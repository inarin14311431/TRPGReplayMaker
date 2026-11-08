// Durable TRPG replay workbench. Original speech stays in utterances;
// all corrections, hiding, speaker roles and AI drafts are separate records.
import { installReplayUsageTable, REPLAY_ENGINES, DEFAULT_BUDGET_USD } from './economy.js';
import { GLOSSARY_CHOICES } from './glossary.js';

export const REPLAY_STYLES = ['dialogue', 'hybrid', 'novel'];
export const AI_PROVIDERS = ['gemini', 'openai', 'openrouter', 'opencode', 'ollama'];
export const SPEECH_KINDS = ['unknown', 'character', 'table', 'gm', 'system'];
const valid = (value, choices) => choices.includes(value);
const clean = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const now = () => new Date().toISOString();
const touch = (db, id) => db.sql.prepare('UPDATE replay_projects SET revision=revision+1,updated_at=? WHERE meeting_id=?').run(now(), id);

// A split is an ordered overlay. Unsplit utterances still contribute one row.
const replayLinesFrom = ' FROM utterances u LEFT JOIN replay_line_edits e ON e.meeting_id=u.meeting_id AND e.utterance_id=u.id'
  + " JOIN json_each(COALESCE(e.parts_json, '[null]')) part";
const replayLineText = "COALESCE(json_extract(part.value, '$.text'), u.text)";
const replayLineCorrection = "CASE WHEN part.value IS NULL THEN e.corrected_text ELSE json_extract(part.value, '$.correctedText') END";
const replayLineHidden = "COALESCE(json_extract(part.value, '$.hidden'), e.hidden, 0)";

export function installReplayTables(db) {
  db.sql.exec([
    'CREATE TABLE IF NOT EXISTS replay_projects (',
    ' meeting_id INTEGER PRIMARY KEY, title TEXT NOT NULL DEFAULT \'\',',
    ' system_name TEXT NOT NULL DEFAULT \'\', style TEXT NOT NULL DEFAULT \'hybrid\',',
    ' glossary TEXT NOT NULL DEFAULT \'\', revision INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL);',
    'CREATE TABLE IF NOT EXISTS replay_speakers (',
    ' meeting_id INTEGER NOT NULL, user_id TEXT NOT NULL, player_name TEXT NOT NULL DEFAULT \'\',',
    ' character_name TEXT NOT NULL DEFAULT \'\', role TEXT NOT NULL DEFAULT \'PL\',',
    ' PRIMARY KEY(meeting_id, user_id));',
    'CREATE TABLE IF NOT EXISTS replay_scenes (',
    ' id INTEGER PRIMARY KEY AUTOINCREMENT, meeting_id INTEGER NOT NULL,',
    ' start_ms INTEGER NOT NULL, title TEXT NOT NULL, draft_text TEXT NOT NULL DEFAULT \'\',',
    ' updated_at TEXT NOT NULL, UNIQUE(meeting_id, start_ms));',
    'CREATE INDEX IF NOT EXISTS replay_scenes_order ON replay_scenes(meeting_id, start_ms);',
    'CREATE TABLE IF NOT EXISTS replay_line_edits (',
    ' meeting_id INTEGER NOT NULL, utterance_id INTEGER NOT NULL, corrected_text TEXT,',
    ' speech_kind TEXT NOT NULL DEFAULT \'unknown\', hidden INTEGER NOT NULL DEFAULT 0,',
    ' updated_at TEXT NOT NULL, PRIMARY KEY(meeting_id, utterance_id));',
  ].join('\n'));
  const columns = db.sql.prepare('PRAGMA table_info(replay_line_edits)').all();
  if (!columns.some(column => column.name === 'parts_json')) {
    db.sql.exec('ALTER TABLE replay_line_edits ADD COLUMN parts_json TEXT');
  }
  installReplayUsageTable(db);
}

export function assertMeeting(db, id) {
  const meetingId = Number(id);
  if (!Number.isSafeInteger(meetingId) || meetingId < 1) return null;
  return db.getMeeting(meetingId);
}

export function ensureReplay(db, id) {
  const m = assertMeeting(db, id);
  if (!m) return null;
  db.sql.prepare('INSERT OR IGNORE INTO replay_projects (meeting_id, title, system_name, style, glossary, updated_at) VALUES (?, ?, \'トーキョーN◎VA\', \'hybrid\', \'\', ?)').run(m.id, m.channel_name || 'TRPG Session', now());
  db.sql.prepare('INSERT OR IGNORE INTO replay_scenes (meeting_id, start_ms, title, updated_at) VALUES (?, 0, ?, ?)').run(m.id, 'オープニング', now());
  return m;
}

export function originTime(db, m) {
  const row = db.sql.prepare('SELECT MIN(start_ms) AS first FROM utterances WHERE meeting_id = ?').get(m.id);
  const first = row?.first;
  if (first == null || first < 100000000000) return 0;
  const fromMeeting = Date.parse(m.started_at || '');
  return Number.isFinite(fromMeeting) && fromMeeting <= first ? fromMeeting : first;
}

export function getReplayOverview(db, id) {
  const meeting = ensureReplay(db, id);
  if (!meeting) return null;
  const project = db.sql.prepare('SELECT * FROM replay_projects WHERE meeting_id = ?').get(meeting.id);
  const scenes = db.sql.prepare('SELECT * FROM replay_scenes WHERE meeting_id = ? ORDER BY start_ms, id').all(meeting.id);
  const distinct = db.sql.prepare(
    'SELECT user_id, MAX(display_name) AS original_name FROM utterances WHERE meeting_id = ? GROUP BY user_id ORDER BY user_id'
  ).all(meeting.id);
  const attendees = db.listAttendees(meeting.id);
  const seen = new Map(distinct.map(x => [x.user_id, x.original_name]));
  for (const a of attendees) if (!seen.has(a.user_id)) seen.set(a.user_id, a.display_name);
  const saved = db.sql.prepare('SELECT * FROM replay_speakers WHERE meeting_id = ?').all(meeting.id);
  const byId = new Map(saved.map(x => [x.user_id, x]));
  const speakers = [...seen].map(([id, originalName]) => ({
    userId: id, originalName, playerName: byId.get(id)?.player_name || originalName,
    characterName: byId.get(id)?.character_name || '',
    role: byId.get(id)?.role || 'PL',
  }));
  const count = db.sql.prepare('SELECT COUNT(*) AS c' + replayLinesFrom + ' WHERE u.meeting_id=?').get(meeting.id).c;
  return { meeting, project, scenes, speakers, count, originMs: originTime(db, meeting) };
}

export function saveReplayProject(db, id, patch) {
  if (!ensureReplay(db, id)) return null;
  const old = db.sql.prepare('SELECT * FROM replay_projects WHERE meeting_id = ?').get(id);
  if (patch.revision !== undefined && patch.revision !== old.revision) {
    const error = new Error('Settings were changed in another tab. Reload before saving.');
    error.status = 409; throw error;
  }
  const title = patch.title === undefined ? old.title : clean(patch.title, 160);
  const system = patch.systemName === undefined ? old.system_name : clean(patch.systemName, 100);
  const glossary = patch.glossary === undefined ? old.glossary : clean(patch.glossary, 10000);
  const glossaryPreset = patch.glossaryPreset === undefined ? old.glossary_preset : patch.glossaryPreset;
  if (!GLOSSARY_CHOICES.includes(glossaryPreset)) throw Object.assign(new Error('Invalid glossary preset.'), { status: 400 });
  const style = patch.style === undefined ? old.style : patch.style;
  const engine = patch.engine === undefined ? old.engine : patch.engine;
  const localModel = patch.localModel === undefined ? old.local_model : clean(patch.localModel, 100);
  const budgetUsd = patch.budgetUsd === undefined ? old.budget_usd : Number(patch.budgetUsd);
  const aiProvider = patch.aiProvider === undefined ? old.ai_provider : patch.aiProvider;
  const aiModel = patch.aiModel === undefined ? old.ai_model : clean(patch.aiModel, 150);
  if (!AI_PROVIDERS.includes(aiProvider)) throw Object.assign(new Error('Invalid AI provider.'), { status: 400 });
  if (!/^[a-zA-Z0-9_./:+-]{1,150}$/.test(aiModel)) throw Object.assign(new Error('Invalid AI model ID.'), { status: 400 });
  if (!REPLAY_ENGINES.includes(engine)) throw Object.assign(new Error('Invalid economy engine.'), { status: 400 });
  if (!Number.isFinite(budgetUsd) || budgetUsd < 0 || budgetUsd > 100) throw Object.assign(new Error('Budget must be $0 to $100.'), { status: 400 });
  if (!localModel || !/^[\w.:-]{1,100}$/.test(localModel)) throw Object.assign(new Error('Invalid local Ollama model.'), { status: 400 });
  if (!title) throw Object.assign(new Error('Title is required.'), { status: 400 });
  if (!valid(style, REPLAY_STYLES)) throw Object.assign(new Error('Invalid replay style.'), { status: 400 });
  db.sql.prepare('UPDATE replay_projects SET title=?, system_name=?, glossary=?, glossary_preset=?, style=?, engine=?, local_model=?, budget_usd=?, ai_provider=?, ai_model=?, revision=revision+1, updated_at=? WHERE meeting_id=?')
    .run(title, system, glossary, glossaryPreset, style, engine, localModel, budgetUsd, aiProvider, aiModel, now(), id);
  return db.sql.prepare('SELECT * FROM replay_projects WHERE meeting_id = ?').get(id);
}

export function saveSpeaker(db, meetingId, userId, input) {
  const overview = getReplayOverview(db, meetingId);
  if (!overview) return null;
  const who = overview.speakers.find(s => s.userId === userId);
  if (!who) throw Object.assign(new Error('Speaker not found in this recording.'), { status: 404 });
  const role = input.role || 'PL';
  if (!valid(role, ['GM', 'PL', 'other'])) throw Object.assign(new Error('Invalid role.'), { status: 400 });
  const player = clean(input.playerName, 100);
  const character = clean(input.characterName, 100);
  db.sql.prepare('INSERT INTO replay_speakers (meeting_id,user_id,player_name,character_name,role) VALUES (?,?,?,?,?) ON CONFLICT(meeting_id,user_id) DO UPDATE SET player_name=excluded.player_name, character_name=excluded.character_name, role=excluded.role')
    .run(meetingId, userId, player, character, role);
  touch(db, meetingId);
  return { userId, originalName: who.originalName, playerName: player || who.originalName, characterName: character, role };
}

export function createScene(db, meetingId, input) {
  if (!ensureReplay(db, meetingId)) return null;
  const startMs = Number(input.startMs);
  if (!Number.isSafeInteger(startMs) || startMs < 0) throw Object.assign(new Error('Scene start must be nonnegative milliseconds.'), { status: 400 });
  const title = clean(input.title, 160);
  if (!title) throw Object.assign(new Error('Scene title is required.'), { status: 400 });
  const exists = db.sql.prepare('SELECT id FROM replay_scenes WHERE meeting_id=? AND start_ms=?').get(meetingId, startMs);
  if (exists) throw Object.assign(new Error('A scene already starts at that time.'), { status: 409 });
  const id = db.sql.prepare('INSERT INTO replay_scenes (meeting_id,start_ms,title,updated_at) VALUES (?,?,?,?)').run(meetingId, startMs, title, now()).lastInsertRowid;
  touch(db, meetingId);
  return db.sql.prepare('SELECT * FROM replay_scenes WHERE id = ?').get(id);
}

export function saveScene(db, meetingId, sceneId, patch) {
  const scene = db.sql.prepare('SELECT * FROM replay_scenes WHERE meeting_id=? AND id=?').get(meetingId, sceneId);
  if (!scene) return null;
  const title = patch.title === undefined ? scene.title : clean(patch.title, 160);
  const draft = patch.draftText === undefined ? scene.draft_text : (typeof patch.draftText === 'string' ? patch.draftText.slice(0, 250000) : '');
  if (!title) throw Object.assign(new Error('Scene title is required.'), { status: 400 });
  db.sql.prepare('UPDATE replay_scenes SET title=?, draft_text=?, updated_at=? WHERE id=? AND meeting_id=?')
    .run(title, draft, now(), sceneId, meetingId);
  if (title !== scene.title) touch(db, meetingId);
  return db.sql.prepare('SELECT * FROM replay_scenes WHERE id=?').get(sceneId);
}

export function deleteScene(db, meetingId, sceneId) {
  const scene = db.sql.prepare('SELECT * FROM replay_scenes WHERE id=? AND meeting_id=?').get(sceneId, meetingId);
  if (!scene) return false;
  if (scene.start_ms === 0) throw Object.assign(new Error('Opening scene cannot be deleted.'), { status: 400 });
  db.sql.prepare('DELETE FROM replay_scenes WHERE id=? AND meeting_id=?').run(sceneId, meetingId);
  touch(db, meetingId);
  return true;
}

export function updateReplayLine(db, meetingId, utteranceId, patch) {
  const id = Number(utteranceId);
  const line = db.sql.prepare('SELECT * FROM utterances WHERE id=? AND meeting_id=?').get(id, meetingId);
  if (!line) return null;
  const old = db.sql.prepare('SELECT * FROM replay_line_edits WHERE utterance_id=? AND meeting_id=?').get(id, meetingId);
  const parts = old?.parts_json ? JSON.parse(old.parts_json) : null;
  const partIndex = parts?.findIndex(part => part.id === patch.partId) ?? -1;
  if (parts ? partIndex < 0 : patch.partId != null) {
    throw Object.assign(new Error('発言の分割状態が変わりました。画面を更新してください。'), { status: 409 });
  }
  const part = parts?.[partIndex];
  const originalText = part?.text ?? line.text;
  const currentText = part ? part.correctedText : old?.corrected_text;
  const kind = patch.speechKind === undefined ? (part?.speechKind || old?.speech_kind || 'unknown') : patch.speechKind;
  if (!valid(kind, SPEECH_KINDS)) throw Object.assign(new Error('Unknown speech kind.'), { status: 400 });
  if (patch.correctedText !== undefined && typeof patch.correctedText !== 'string' && patch.correctedText !== null)
    throw Object.assign(new Error('Corrected text must be a string or null.'), { status: 400 });
  const corrected = patch.correctedText === undefined ? (currentText ?? null) :
    (patch.correctedText === null ? null : patch.correctedText.slice(0, 20000));
  const hidden = patch.hidden === undefined ? (part?.hidden ?? old?.hidden ?? 0) : (patch.hidden === true ? 1 : 0);
  let nextParts = parts;
  if (patch.splitTexts !== undefined) {
    const texts = patch.splitTexts;
    if (patch.sourceText !== (currentText ?? originalText)) {
      throw Object.assign(new Error('発言が変更されました。画面を更新してから分割してください。'), { status: 409 });
    }
    if (!Array.isArray(texts) || texts.length < 2 || (parts?.length ?? 1) - 1 + texts.length > 40
        || texts.some(text => typeof text !== 'string' || !text.trim() || text.length > 20000)) {
      throw Object.assign(new Error('空欄を除き、1件の原文を2〜40件の発言に分けてください。'), { status: 400 });
    }
    let nextId = parts ? Math.max(...parts.map(item => item.id)) + 1 : 1;
    const split = texts.map((text, index) => ({
      id: index === 0 && part ? part.id : nextId++,
      text: text.trim(), correctedText: null, speechKind: kind, hidden,
    }));
    nextParts = parts ? parts.toSpliced(partIndex, 1, ...split) : split;
  } else if (part) {
    nextParts = parts.toSpliced(partIndex, 1, { ...part, correctedText: corrected, speechKind: kind, hidden });
  }
  db.sql.prepare('INSERT INTO replay_line_edits (meeting_id,utterance_id,corrected_text,speech_kind,hidden,updated_at,parts_json) VALUES(?,?,?,?,?,?,?) ON CONFLICT(meeting_id,utterance_id) DO UPDATE SET corrected_text=excluded.corrected_text,speech_kind=excluded.speech_kind,hidden=excluded.hidden,updated_at=excluded.updated_at,parts_json=excluded.parts_json')
    .run(meetingId, id, part ? old.corrected_text : corrected, part ? old.speech_kind : kind,
      part ? old.hidden : hidden, now(), nextParts ? JSON.stringify(nextParts) : null);
  touch(db, meetingId);
  return { id, originalText, correctedText: corrected, speechKind: kind, hidden: !!hidden };
}

export function sceneBounds(scenes, sceneId) {
  if (sceneId === null || sceneId === undefined) return null;
  const ix = scenes.findIndex(s => s.id === Number(sceneId));
  if (ix < 0) throw Object.assign(new Error('Scene not found.'), { status: 404 });
  return { start: scenes[ix].start_ms, end: scenes[ix + 1]?.start_ms ?? null };
}

export function transcriptPage(db, meetingId, { sceneId = null, offset = 0, limit = 100 } = {}) {
  const m = assertMeeting(db, meetingId);
  if (!m) return null;
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 500)
    throw Object.assign(new Error('Invalid page range.'), { status: 400 });
  const origin = originTime(db, m);
  const scenes = db.sql.prepare('SELECT * FROM replay_scenes WHERE meeting_id=? ORDER BY start_ms,id').all(meetingId);
  const bounds = sceneBounds(scenes, sceneId);
  const clause = bounds ? ' AND u.start_ms >= ?' + (bounds.end === null ? '' : ' AND u.start_ms < ?') : '';
  const args = [meetingId, ...(bounds ? [origin + bounds.start, ...(bounds.end === null ? [] : [origin + bounds.end])] : [])];
  const total = db.sql.prepare('SELECT COUNT(*) AS c' + replayLinesFrom + ' WHERE u.meeting_id=?' + clause).get(...args).c;
  const rows = db.sql.prepare([
    'SELECT u.id,u.user_id,u.display_name,u.start_ms,u.end_ms,u.text AS source_text,',
    replayLineText + ' AS text, ' + replayLineCorrection + ' AS corrected_text, ',
    "COALESCE(json_extract(part.value, '$.speechKind'), e.speech_kind) AS speech_kind, ",
    replayLineHidden + " AS hidden, json_extract(part.value, '$.id') AS part_id",
    replayLinesFrom,
    ' WHERE u.meeting_id=?' + clause + ' ORDER BY u.start_ms,u.id,part.key LIMIT ? OFFSET ?',
  ].join('')).all(...args, limit, offset);
  const result = rows.map(u => ({
    id: u.id, ...(u.part_id === null ? {} : { partId: u.part_id, sourceText: u.source_text }), userId: u.user_id, originalName: u.display_name,
    startMs: u.start_ms, endMs: u.end_ms,
    elapsedMs: Math.max(0, u.start_ms - origin),
    originalText: u.text, correctedText: u.corrected_text,
    speechKind: u.speech_kind || 'unknown', hidden: !!u.hidden,
  }));
  return { rows: result, total, offset, limit };
}


/** Suggest boundaries based on transcript volume. Existing user scenes are not
 * deleted or moved; the output is intentionally a starting point for editing.
 */
export function autoSplitReplay(db, meetingId, { targetChars = 12000 } = {}) {
  const m = ensureReplay(db, meetingId);
  if (!m) return null;
  if (!Number.isSafeInteger(targetChars) || targetChars < 2000 || targetChars > 30000)
    throw Object.assign(new Error('targetChars must be between 2000 and 30000.'), { status: 400 });
  const origin = originTime(db, m);
  const existing = db.sql.prepare('SELECT start_ms FROM replay_scenes WHERE meeting_id=? ORDER BY start_ms').all(meetingId).map(s => s.start_ms);
  const iterator = db.sql.prepare('SELECT u.start_ms, ' + replayLineText + ' AS text, ' + replayLineCorrection
    + ' AS corrected_text, ' + replayLineHidden + ' AS hidden' + replayLinesFrom
    + ' WHERE u.meeting_id=? ORDER BY u.start_ms,u.id,part.key').iterate(meetingId);
  let chars = 0, last = 0, ix = 1;
  const created = [];
  for (const row of iterator) {
    if (row.hidden) continue;
    const elapsed = Math.max(0, row.start_ms - origin);
    while (ix < existing.length && existing[ix] <= elapsed) {
      last = existing[ix++];
      chars = 0;
    }
    chars += (row.corrected_text ?? row.text).length + 80;
    if (chars >= targetChars && elapsed >= last + 30000) {
      if (!existing.includes(elapsed) && !created.some(s => s.start_ms === elapsed)) {
        const scene = createScene(db, meetingId, {
          startMs: elapsed,
          title: 'シーン ' + String(existing.length + created.length + 1).padStart(2, '0'),
        });
        created.push(scene);
      }
      last = elapsed;
      chars = 0;
    }
  }
  return { created, scenes: db.sql.prepare('SELECT * FROM replay_scenes WHERE meeting_id=? ORDER BY start_ms,id').all(meetingId) };
}

export function removeReplayForMeeting(db, id) {
  for (const table of ['replay_line_edits','replay_scenes','replay_speakers','replay_projects','replay_ai_usage']) {
    db.sql.prepare('DELETE FROM ' + table + ' WHERE meeting_id=?').run(id);
  }
}
