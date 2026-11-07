// Durable TRPG replay workbench. Original speech stays in utterances;
// all corrections, hiding, speaker roles and AI drafts are separate records.
export const REPLAY_STYLES = ['dialogue', 'hybrid', 'novel'];
export const SPEECH_KINDS = ['unknown', 'character', 'table', 'gm', 'system'];
const valid = (value, choices) => choices.includes(value);
const clean = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const now = () => new Date().toISOString();
const touch = (db, id) => db.sql.prepare('UPDATE replay_projects SET revision=revision+1,updated_at=? WHERE meeting_id=?').run(now(), id);

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
}

export function assertMeeting(db, id) {
  const meetingId = Number(id);
  if (!Number.isSafeInteger(meetingId) || meetingId < 1) return null;
  return db.getMeeting(meetingId);
}

export function ensureReplay(db, id) {
  const m = assertMeeting(db, id);
  if (!m) return null;
  db.sql.prepare('INSERT OR IGNORE INTO replay_projects (meeting_id, title, system_name, style, glossary, updated_at) VALUES (?, ?, \'\', \'hybrid\', \'\', ?)').run(m.id, m.channel_name || 'TRPG Session', now());
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
  const count = db.sql.prepare('SELECT COUNT(*) AS c FROM utterances WHERE meeting_id = ?').get(meeting.id).c;
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
  const style = patch.style === undefined ? old.style : patch.style;
  if (!title) throw Object.assign(new Error('Title is required.'), { status: 400 });
  if (!valid(style, REPLAY_STYLES)) throw Object.assign(new Error('Invalid replay style.'), { status: 400 });
  db.sql.prepare('UPDATE replay_projects SET title=?, system_name=?, glossary=?, style=?, revision=revision+1, updated_at=? WHERE meeting_id=?')
    .run(title, system, glossary, style, now(), id);
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
  const kind = patch.speechKind === undefined ? (old?.speech_kind || 'unknown') : patch.speechKind;
  if (!valid(kind, SPEECH_KINDS)) throw Object.assign(new Error('Unknown speech kind.'), { status: 400 });
  if (patch.correctedText !== undefined && typeof patch.correctedText !== 'string' && patch.correctedText !== null)
    throw Object.assign(new Error('Corrected text must be a string or null.'), { status: 400 });
  const corrected = patch.correctedText === undefined ? (old?.corrected_text ?? null) :
    (patch.correctedText === null ? null : patch.correctedText.slice(0, 20000));
  const hidden = patch.hidden === undefined ? (old?.hidden || 0) : (patch.hidden === true ? 1 : 0);
  db.sql.prepare('INSERT INTO replay_line_edits (meeting_id,utterance_id,corrected_text,speech_kind,hidden,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(meeting_id,utterance_id) DO UPDATE SET corrected_text=excluded.corrected_text,speech_kind=excluded.speech_kind,hidden=excluded.hidden,updated_at=excluded.updated_at')
    .run(meetingId, id, corrected, kind, hidden, now());
  touch(db, meetingId);
  return { id, originalText: line.text, correctedText: corrected, speechKind: kind, hidden: !!hidden };
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
  const total = db.sql.prepare('SELECT COUNT(*) AS c FROM utterances u WHERE u.meeting_id=?' + clause).get(...args).c;
  const rows = db.sql.prepare([
    'SELECT u.id,u.user_id,u.display_name,u.start_ms,u.end_ms,u.text,',
    ' e.corrected_text,e.speech_kind,e.hidden',
    ' FROM utterances u LEFT JOIN replay_line_edits e ON e.meeting_id=u.meeting_id AND e.utterance_id=u.id',
    ' WHERE u.meeting_id=?' + clause + ' ORDER BY u.start_ms,u.id LIMIT ? OFFSET ?',
  ].join('')).all(...args, limit, offset);
  const result = rows.map(u => ({
    id: u.id, userId: u.user_id, originalName: u.display_name,
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
  const iterator = db.sql.prepare('SELECT u.start_ms,u.text,e.corrected_text,e.hidden FROM utterances u LEFT JOIN replay_line_edits e ON e.meeting_id=u.meeting_id AND e.utterance_id=u.id WHERE u.meeting_id=? ORDER BY u.start_ms,u.id').iterate(meetingId);
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
  for (const table of ['replay_line_edits','replay_scenes','replay_speakers','replay_projects']) {
    db.sql.prepare('DELETE FROM ' + table + ' WHERE meeting_id=?').run(id);
  }
}
