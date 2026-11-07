import { Router } from 'express';
import { requireAdmin } from './auth.js';
import { getGuildConfig } from '../store/config.js';
import { getSummarizer } from '../adapters/summarizer/index.js';
import {
  installReplayTables, getReplayOverview, saveReplayProject, saveSpeaker,
  createScene, saveScene, deleteScene, updateReplayLine, transcriptPage,
} from '../replay/store.js';
import { buildScenePrompt, exportReplay, rowsForScene } from '../replay/render.js';

function respondError(res, err) {
  const status = err?.status && Number.isInteger(err.status) && err.status >= 400 && err.status < 600
    ? err.status : 500;
  return res.status(status).json({ error: err.message || 'Replay request failed.' });
}
function checkedMeeting(db, req, res) {
  const overview = getReplayOverview(db, Number(req.params.id));
  if (!overview) {
    res.status(404).json({ error: 'Recording not found.' });
    return null;
  }
  return overview;
}
function numberParam(raw) {
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 1) throw Object.assign(new Error('Invalid ID.'), { status: 400 });
  return n;
}

export function replayRouter({ db, generateText = null }) {
  installReplayTables(db);
  const r = Router();

  r.get('/meetings/:id', (req, res) => {
    try {
      const overview = checkedMeeting(db, req, res);
      if (overview) res.json(overview);
    } catch (e) { respondError(res, e); }
  });

  r.get('/meetings/:id/lines', (req, res) => {
    try {
      if (!checkedMeeting(db, req, res)) return;
      const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);
      const limit = req.query.limit === undefined ? 100 : Number(req.query.limit);
      const sceneId = req.query.scene === undefined ? null : numberParam(req.query.scene);
      res.json(transcriptPage(db, Number(req.params.id), { offset, limit, sceneId }));
    } catch (e) { respondError(res, e); }
  });

  r.patch('/meetings/:id', requireAdmin, (req, res) => {
    try {
      if (!checkedMeeting(db, req, res)) return;
      res.json({ project: saveReplayProject(db, Number(req.params.id), req.body || {}) });
    } catch (e) { respondError(res, e); }
  });

  r.put('/meetings/:id/speakers/:userId', requireAdmin, (req, res) => {
    try {
      if (!checkedMeeting(db, req, res)) return;
      res.json({ speaker: saveSpeaker(db, Number(req.params.id), req.params.userId, req.body || {}) });
    } catch (e) { respondError(res, e); }
  });

  r.post('/meetings/:id/scenes', requireAdmin, (req, res) => {
    try {
      if (!checkedMeeting(db, req, res)) return;
      const scene = createScene(db, Number(req.params.id), req.body || {});
      res.status(201).json({ scene });
    } catch (e) { respondError(res, e); }
  });

  r.patch('/meetings/:id/scenes/:sceneId', requireAdmin, (req, res) => {
    try {
      if (!checkedMeeting(db, req, res)) return;
      const scene = saveScene(db, Number(req.params.id), numberParam(req.params.sceneId), req.body || {});
      if (!scene) return res.status(404).json({ error: 'Scene not found.' });
      res.json({ scene });
    } catch (e) { respondError(res, e); }
  });

  r.delete('/meetings/:id/scenes/:sceneId', requireAdmin, (req, res) => {
    try {
      if (!checkedMeeting(db, req, res)) return;
      if (!deleteScene(db, Number(req.params.id), numberParam(req.params.sceneId))) {
        return res.status(404).json({ error: 'Scene not found.' });
      }
      res.json({ ok: true });
    } catch (e) { respondError(res, e); }
  });

  r.patch('/meetings/:id/lines/:lineId', requireAdmin, (req, res) => {
    try {
      if (!checkedMeeting(db, req, res)) return;
      const line = updateReplayLine(db, Number(req.params.id), numberParam(req.params.lineId), req.body || {});
      if (!line) return res.status(404).json({ error: 'Utterance not found in this meeting.' });
      res.json({ line });
    } catch (e) { respondError(res, e); }
  });

  r.post('/meetings/:id/scenes/:sceneId/generate', requireAdmin, async (req, res) => {
    try {
      const overview = checkedMeeting(db, req, res);
      if (!overview) return;
      const sceneId = numberParam(req.params.sceneId);
      const scene = overview.scenes.find(x => x.id === sceneId);
      if (!scene) return res.status(404).json({ error: 'Scene not found.' });
      if (scene.draft_text && req.body?.overwrite !== true)
        return res.status(409).json({ error: 'This scene already has a draft. Confirm overwrite explicitly.' });
      const rows = rowsForScene(db, overview.meeting.id, scene.id, { maxChars: 24000 });
      const prompt = buildScenePrompt(overview, scene, rows);
      const text = generateText
        ? await generateText(prompt, { meetingId: overview.meeting.id, sceneId: scene.id })
        : await getSummarizer(getGuildConfig(db, overview.meeting.guild_id)).ask(prompt);
      if (typeof text !== 'string' || !text.trim())
        throw Object.assign(new Error('AI returned no editable draft.'), { status: 502 });
      const latest = getReplayOverview(db, overview.meeting.id);
      const current = latest.scenes.find(x => x.id === sceneId);
      if (!current || current.updated_at !== scene.updated_at || latest.project.revision !== overview.project.revision)
        return res.status(409).json({ error: 'The scene or project changed during AI generation. The existing draft was preserved.' });
      const saved = saveScene(db, overview.meeting.id, sceneId, { draftText: text });
      res.json({ scene: saved });
    } catch (e) { respondError(res, e); }
  });

  r.get('/meetings/:id/export', (req, res) => {
    try {
      if (!checkedMeeting(db, req, res)) return;
      const format = req.query.format === 'json' ? 'json' : 'md';
      const mode = req.query.mode === 'script' ? 'script' : 'draft';
      const output = exportReplay(db, Number(req.params.id), { mode, format });
      const filename = 'trpg-replay-' + Number(req.params.id) + '.' + format;
      res.set('Content-Disposition', 'attachment; filename="' + filename + '"');
      if (format === 'json') return res.json(output);
      res.type('text/markdown; charset=utf-8').send(output);
    } catch (e) { respondError(res, e); }
  });
  return r;
}
