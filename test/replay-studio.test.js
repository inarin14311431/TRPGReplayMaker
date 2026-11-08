import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { openDb } from '../src/store/db.js';
import { replayRouter } from '../src/web/replay-api.js';
import {
  installReplayTables, getReplayOverview, transcriptPage, createScene, updateReplayLine,
  saveReplayProject, saveSpeaker, deleteScene, removeReplayForMeeting, autoSplitReplay,
} from '../src/replay/store.js';
import { exportReplay, rowsForScene, buildScenePrompt, clock } from '../src/replay/render.js';

const seed = () => {
  const db = openDb(':memory:');
  installReplayTables(db);
  const origin = Date.parse('2026-11-07T09:00:00Z');
  const id = db.createMeeting({ guildId: 'g1', channelId: 'c1', channelName: 'TRPG', startedAt: '2026-11-07T09:00:00Z' });
  db.addAttendee(id, 'gm', 'マスター');
  db.addAttendee(id, 'pl', '参加者');
  db.addUtterance({ meetingId: id, userId: 'gm', displayName: 'マスター', startMs: origin + 1000, endMs: origin + 2000, text: '君たちは路地裏に到着した。' });
  db.addUtterance({ meetingId: id, userId: 'pl', displayName: '参加者', startMs: origin + 6000, endMs: origin + 8000, text: '「ここが現場か」' });
  db.addUtterance({ meetingId: id, userId: 'gm', displayName: 'マスター', startMs: origin + 3600000, endMs: origin + 3602000, text: '情報が揃った。' });
  return { db, id, origin };
};
async function serve(db, generateText = null, authorize = null) {
  const app = express();
  app.use(express.json());
  if (authorize) app.use((req, res, next) => { req.authResolved = true; req.user = authorize; next(); });
  app.use('/api/replays', replayRouter({ db, generateText }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(ok => server.once('listening', ok));
  return { url: 'http://127.0.0.1:' + server.address().port, close: () => new Promise(ok => server.close(ok)) };
}
async function call(base, route, method = 'GET', body = null) {
  const response = await fetch(base + '/api/replays' + route, {
    method, headers: body === null ? {} : { 'content-type': 'application/json' },
    ...(body === null ? {} : { body: JSON.stringify(body) }),
  });
  const data = (response.headers.get('content-type') || '').includes('application/json')
    ? await response.json() : await response.text();
  return { response, data };
}

test('workbench initializes opening scene and preserves original recording', () => {
  const { db, id } = seed();
  const project = getReplayOverview(db, id);
  assert.equal(project.count, 3);
  assert.equal(project.scenes.length, 1);
  assert.equal(project.scenes[0].start_ms, 0);
  assert.equal(project.speakers.length, 2);
  assert.equal(transcriptPage(db, id).rows[0].originalText, '君たちは路地裏に到着した。');
  assert.equal(getReplayOverview(db, id).scenes.length, 1);
});

test('scenes divide by recorded hour instead of wrapping minutes', () => {
  const { db, id } = seed();
  getReplayOverview(db, id);
  const scene = createScene(db, id, { title: '調査', startMs: 3600000 });
  assert.equal(transcriptPage(db, id, { sceneId: scene.id }).total, 1);
  assert.equal(transcriptPage(db, id, { sceneId: getReplayOverview(db, id).scenes[0].id }).total, 2);
  assert.equal(clock(13 * 3600000 + 3000), '13:00:03');
  assert.throws(() => createScene(db, id, { title: '重複', startMs: 3600000 }), /already/);
});

test('manual transcription correction is overlay-only and raw source remains unchanged', () => {
  const { db, id } = seed();
  getReplayOverview(db, id);
  const line = db.listUtterances(id)[1];
  updateReplayLine(db, id, line.id, { correctedText: '「ここが事件現場か」', speechKind: 'character' });
  const actual = transcriptPage(db, id).rows[1];
  assert.equal(actual.originalText, '「ここが現場か」');
  assert.equal(actual.correctedText, '「ここが事件現場か」');
  assert.equal(db.listUtterances(id)[1].text, '「ここが現場か」');
  updateReplayLine(db, id, line.id, { correctedText: null });
  assert.equal(transcriptPage(db, id).rows[1].correctedText, null);
});

test('replay splits keep source audio references and support independent edits across pages', () => {
  const { db, id } = seed();
  const overview = getReplayOverview(db, id);
  const original = db.listUtterances(id)[0];
  updateReplayLine(db, id, original.id, { correctedText: '到着した。見張る。調べる。待つ。', speechKind: 'gm' });
  updateReplayLine(db, id, original.id, { sourceText: '到着した。見張る。調べる。待つ。', splitTexts: ['到着した。', '見張る。', '調べる。', '待つ。'] });
  assert.equal(getReplayOverview(db, id).count, 6);
  const { rows, total } = transcriptPage(db, id, { limit: 2, offset: 1 });
  assert.equal(total, 6);
  assert.deepEqual(rows.map(row => row.originalText), ['見張る。', '調べる。']);
  assert.ok(rows.every(row => row.id === original.id && row.sourceText === original.text && row.speechKind === 'gm'));
  updateReplayLine(db, id, original.id, { partId: rows[0].partId, correctedText: '入口で見張る。', speechKind: 'character' });
  updateReplayLine(db, id, original.id, { partId: rows[1].partId, hidden: true });
  assert.throws(() => updateReplayLine(db, id, original.id, { correctedText: '古い画面' }), /分割状態/);
  const sceneRows = rowsForScene(db, id, overview.scenes[0].id);
  assert.equal(sceneRows[1].speechKind, 'character');
  const prompt = buildScenePrompt(overview, overview.scenes[0], sceneRows);
  assert.match(prompt, /到着した。[\s\S]*入口で見張る。[\s\S]*待つ。/);
  assert.doesNotMatch(prompt, /調べる。/);
  assert.equal(db.listUtterances(id)[0].text, original.text);
});

test('cast mapping and script export include source references and omit hidden lines', () => {
  const { db, id } = seed();
  getReplayOverview(db, id);
  saveReplayProject(db, id, { title: 'N◎VA リプレイ', systemName: 'トーキョーN◎VA' });
  saveSpeaker(db, id, 'pl', { playerName: 'PL1', characterName: 'アザミ', role: 'PL' });
  const lines = db.listUtterances(id);
  updateReplayLine(db, id, lines[1].id, { speechKind: 'character', correctedText: '「調査しよう」' });
  updateReplayLine(db, id, lines[2].id, { hidden: true });
  const md = exportReplay(db, id, { mode: 'script' });
  assert.match(md, /アザミ/);
  assert.match(md, /「調査しよう」/);
  assert.match(md, /original utterance #/);
  assert.doesNotMatch(md, /情報が揃った。/);
  const obj = exportReplay(db, id, { format: 'json' });
  assert.equal(obj.scenes[0].lines.length, 3);
  assert.equal(obj.scenes[0].lines[2].hidden, true);
});

test('invalid settings and optimistic stale saves are rejected', () => {
  const { db, id } = seed();
  const overview = getReplayOverview(db, id);
  const project = saveReplayProject(db, id, { title: 'A', style: 'hybrid', revision: overview.project.revision });
  assert.equal(project.revision, 1);
  assert.throws(() => saveReplayProject(db, id, { title: 'B', revision: 0 }), /another tab/);
  assert.throws(() => saveReplayProject(db, id, { style: 'unsafe' }), /Invalid replay style/);
  assert.throws(() => deleteScene(db, id, overview.scenes[0].id), /cannot be deleted/);
  assert.throws(() => updateReplayLine(db, id, db.listUtterances(id)[0].id, { speechKind: 'unsupported' }));
});

test('AI scene prompt uses corrected speech, role, glossary and no hidden speech', () => {
  const { db, id } = seed();
  getReplayOverview(db, id);
  saveReplayProject(db, id, { title: '事件簿', glossary: '神業 かみわざ' });
  saveSpeaker(db, id, 'pl', { playerName: '卓の参加者', characterName: 'アザミ', role: 'PL' });
  const line = db.listUtterances(id)[1];
  updateReplayLine(db, id, line.id, { correctedText: '「危険だ」', speechKind: 'character' });
  const overview = getReplayOverview(db, id);
  const scene = overview.scenes[0];
  const prompt = buildScenePrompt(overview, scene, rowsForScene(db, id, scene.id));
  assert.match(prompt, /アザミ/);
  assert.match(prompt, /「危険だ」/);
  assert.match(prompt, /神業 かみわざ/);
  assert.match(prompt, /ログにない事件/);
});

test('AI generation stores draft and requires explicit overwrite', async () => {
  const { db, id } = seed();
  const srv = await serve(db, async prompt => {
    assert.match(prompt, /発言ログ/);
    return '## 整理されたシーン\n\nGM：「事件現場だ」';
  });
  try {
    let r = await call(srv.url, '/meetings/' + id);
    assert.equal(r.response.status, 200);
    const sid = r.data.scenes[0].id;
    r = await call(srv.url, '/meetings/' + id + '/scenes/' + sid + '/generate', 'POST', {});
    assert.equal(r.response.status, 200);
    assert.match(r.data.scene.draft_text, /整理されたシーン/);
    r = await call(srv.url, '/meetings/' + id + '/scenes/' + sid + '/generate', 'POST', {});
    assert.equal(r.response.status, 409);
    r = await call(srv.url, '/meetings/' + id + '/export?format=md&mode=draft');
    assert.match(r.data, /整理されたシーン/);
    r = await call(srv.url, '/meetings/' + id + '/export?format=md&mode=script');
    assert.match(r.data, /original utterance #/);
    assert.doesNotMatch(r.data, /整理されたシーン/);
  } finally { await srv.close(); }
});

test('API paginate, edit, create and delete scene; no cross-meeting line edits', async () => {
  const { db, id } = seed();
  const srv = await serve(db);
  try {
    let r = await call(srv.url, '/meetings/' + id + '/lines?limit=1&offset=1');
    assert.equal(r.data.total, 3);
    assert.equal(r.data.rows.length, 1);
    const sourceId = r.data.rows[0].id;
    r = await call(srv.url, '/meetings/' + id + '/lines/' + sourceId, 'PATCH', { correctedText: '校正済み', speechKind: 'table' });
    assert.equal(r.response.status, 200);
    assert.equal(r.data.line.originalText, '「ここが現場か」');
    r = await call(srv.url, '/meetings/' + id + '/scenes', 'POST', { title: '中盤', startMs: 3600000 });
    assert.equal(r.response.status, 201);
    const sid = r.data.scene.id;
    r = await call(srv.url, '/meetings/' + id + '/lines?scene=' + sid);
    assert.equal(r.data.total, 1);
    r = await call(srv.url, '/meetings/' + id + '/scenes/' + sid, 'DELETE');
    assert.equal(r.response.status, 200);
    const another = db.createMeeting({ guildId: 'g1', channelId: 'c1', channelName: 'other', startedAt: 't' });
    r = await call(srv.url, '/meetings/' + another + '/lines/' + sourceId, 'PATCH', { hidden: true });
    assert.equal(r.response.status, 404);
    r = await call(srv.url, '/meetings/' + id + '/lines?limit=501');
    assert.equal(r.response.status, 400);
  } finally { await srv.close(); }
});

test('replay editing mutations remain admin-only in the authenticated server', async () => {
  const { db, id } = seed();
  const srv = await serve(db, null, { isAdmin: false });
  try {
    const overview = await call(srv.url, '/meetings/' + id);
    assert.equal(overview.response.status, 200);
    const r = await call(srv.url, '/meetings/' + id, 'PATCH', { title: 'bad' });
    assert.equal(r.response.status, 403);
  } finally { await srv.close(); }
});

test('source can exceed one AI request without a silent partial draft', () => {
  const { db, id, origin } = seed();
  for (let i = 0; i < 30; i++) db.addUtterance({ meetingId: id, userId: 'pl', displayName: '参加者', startMs: origin + 9000 + i, endMs: origin + 9010 + i, text: '長い発言'.repeat(400) });
  const scene = getReplayOverview(db, id).scenes[0];
  assert.throws(() => rowsForScene(db, id, scene.id, { maxChars: 24000 }), /too long/);
  assert.equal(db.listUtterances(id).length, 33);
});

test('deleting source recording does not leave replay notes orphaned', () => {
  const { db, id } = seed();
  getReplayOverview(db, id);
  db.deleteMeeting(id);
  assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM replay_projects WHERE meeting_id=?').get(id).n, 0);
  assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM replay_scenes WHERE meeting_id=?').get(id).n, 0);
});

test('merge preserves corrected utterance overlays from source meeting', () => {
  const { db, id, origin } = seed();
  const second = db.createMeeting({ guildId: 'g1', channelId: 'c1', channelName: 'other', startedAt: '2026-11-07T09:00:00Z' });
  db.addUtterance({ meetingId: second, userId: 'pl', displayName: '参加者', startMs: origin + 8000000, endMs: origin + 8001000, text: '追加発言' });
  const line = db.listUtterances(second)[0];
  getReplayOverview(db, second);
  updateReplayLine(db, second, line.id, { correctedText: '修正済み追加発言' });
  db.mergeMeetings(id, [second]);
  const row = transcriptPage(db, id).rows.find(x => x.id === line.id);
  assert.equal(row.correctedText, '修正済み追加発言');
  assert.equal(getReplayOverview(db, second), null);
});

test('automatic split handles long sessions without removing manual scene boundaries', () => {
  const { db, id, origin } = seed();
  getReplayOverview(db, id);
  createScene(db, id, { title: '手動の場面', startMs: 3600000 });
  for (let i = 0; i < 10; i++) {
    db.addUtterance({ meetingId: id, userId: 'pl', displayName: '参加者',
      startMs: origin + 4000000 + i * 60000, endMs: origin + 4001000 + i * 60000,
      text: '描写'.repeat(800) });
  }
  const x = autoSplitReplay(db, id, { targetChars: 3000 });
  assert.ok(x.created.length >= 2);
  assert.ok(x.scenes.some(s => s.title === '手動の場面' && s.start_ms === 3600000));
  assert.equal(x.scenes[0].start_ms, 0);
  assert.throws(() => autoSplitReplay(db, id, { targetChars: 100 }), /targetChars/);
});

test('auto split is available through authenticated replay API', async () => {
  const { db, id } = seed();
  const srv = await serve(db);
  try {
    const r = await call(srv.url, '/meetings/' + id + '/auto-split', 'POST', { targetChars: 2000 });
    assert.equal(r.response.status, 200);
    assert.ok(Array.isArray(r.data.scenes));
  } finally { await srv.close(); }
});
