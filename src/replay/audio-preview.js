// Send a per-speaker PCM track as a virtual WAV. No temporary WAV is written,
// and byte ranges make HTML5 seeking work on large speech turns.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pcmName, wavHeader } from '../voice/audio.js';

function requestedRange(value, total) {
  if (!value) return { start: 0, end: total - 1, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return null;
  let start, end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix < 1) return null;
    start = Math.max(0, total - suffix);
    end = total - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : total - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return null;
  }
  if (start < 0 || end < start || start >= total) return null;
  return { start, end: Math.min(total - 1, end), partial: true };
}

export async function serveReplayAudio(req, res, { db, meetingId, lineId, audioRoot }) {
  const line = db.sql.prepare('SELECT id,user_id,start_ms FROM utterances WHERE id=? AND meeting_id=?').get(lineId, meetingId);
  if (!line) return res.status(404).json({ error: 'Speech turn not found in this meeting.' });
  // Only Discord-like identifiers are allowed; the filename must not traverse
  // directories even if an imported transcript was malicious.
  if (!/^[A-Za-z0-9-]{1,100}$/.test(String(line.user_id)) || !Number.isSafeInteger(line.start_ms) || line.start_ms < 0)
    return res.status(404).json({ error: 'Audio track unavailable.' });
  const filepath = join(audioRoot, String(meetingId), pcmName(line.user_id, line.start_ms));
  let size;
  try { size = (await stat(filepath)).size; }
  catch (e) {
    if (e.code === 'ENOENT') return res.status(404).json({ error: 'Original PCM has expired or was not recorded.' });
    return res.status(500).json({ error: 'Could not read original audio.' });
  }
  if (!Number.isSafeInteger(size) || size < 0 || size % 2 || size > 0xFFFFFFFF - 36)
    return res.status(422).json({ error: 'PCM is corrupt or too large for WAV preview.' });
  const total = size + 44;
  const range = requestedRange(req.headers.range, total);
  if (!range) {
    res.set('Content-Range', 'bytes */' + total);
    return res.status(416).json({ error: 'Requested byte range is not satisfiable.' });
  }
  res.status(range.partial ? 206 : 200);
  res.set({
    'Content-Type': 'audio/wav',
    'Accept-Ranges': 'bytes',
    'Content-Length': String(range.end - range.start + 1),
    'Cache-Control': 'private, no-store',
    ...(range.partial ? { 'Content-Range': 'bytes ' + range.start + '-' + range.end + '/' + total } : {}),
  });
  const header = wavHeader(size);
  if (range.start < 44) {
    res.write(header.subarray(range.start, Math.min(44, range.end + 1)));
  }
  if (range.end < 44) return res.end();
  const pcmStart = Math.max(0, range.start - 44);
  const pcmEnd = range.end - 44;
  const file = createReadStream(filepath, { start: pcmStart, end: pcmEnd });
  file.on('error', err => {
    if (res.headersSent) res.destroy(err);
    else res.status(500).json({ error: 'Audio streaming failed.' });
  });
  file.pipe(res);
}
