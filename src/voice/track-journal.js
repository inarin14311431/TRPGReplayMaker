// Append-only audio capture ledger. Each record is fsynced independently so a
// process crash cannot discard metadata about previously closed speech turns.
// The PCM itself is fsynced before a "completed" event is emitted.
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, statSync, writeSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parsePcmName } from './audio.js';

export const TRACK_JOURNAL = 'tracks.jsonl';

export function appendTrackEvent(audioDir, event) {
  mkdirSync(audioDir, { recursive: true });
  const fd = openSync(join(audioDir, TRACK_JOURNAL), 'a', 0o600);
  try {
    const line = Buffer.from(JSON.stringify({ v: 1, at: new Date().toISOString(), ...event }) + '\n');
    let pos = 0;
    while (pos < line.length) {
      const written = writeSync(fd, line, pos, line.length - pos);
      if (!written) throw new Error('Short journal write');
      pos += written;
    }
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

export function readTrackEvents(audioDir) {
  let content;
  try { content = readFileSync(join(audioDir, TRACK_JOURNAL), 'utf8'); }
  catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  // A crash can truncate the last write. Ignore invalid/torn lines without
  // ignoring previous valid records or allowing non-JSON data into the output.
  const events = [];
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      if (obj && obj.v === 1 && ['started', 'completed', 'interrupted'].includes(obj.type) &&
          typeof obj.file === 'string' && basename(obj.file) === obj.file &&
          /^\S+_\d+\.pcm$/.test(obj.file)) events.push(obj);
    } catch { /* torn final line, or corrupted record */ }
  }
  return events;
}

/** Find recoverable speaker audio without relying on an in-memory registry.
 * If there was no durable completion record, treat recovered PCM as uncertain.
 * We do not truncate, delete, or claim that incomplete audio is complete.
 */
export function recoverPcmTracks(audioDir, nameById = new Map()) {
  const events = readTrackEvents(audioDir);
  const last = new Map();
  for (const e of events) last.set(e.file, e);
  let filenames = [];
  try { filenames = readdirSync(audioDir); }
  catch (e) { if (e.code === 'ENOENT') return { tracks: [], skipped: [] }; throw e; }

  const tracks = [];
  const skipped = [];
  for (const file of filenames) {
    if (!/^[^/\\]+_\d+\.pcm$/.test(file)) continue;
    const { userId, startMs } = parsePcmName(file);
    if (!userId || !Number.isSafeInteger(startMs) || startMs < 0) {
      skipped.push({ file, reason: 'invalid PCM filename' });
      continue;
    }
    const pcmPath = join(audioDir, file);
    let bytes;
    try { bytes = statSync(pcmPath).size; }
    catch (e) { skipped.push({ file, reason: e.message }); continue; }
    // Signed 16-bit mono PCM: odd byte counts represent a truncated sample.
    if (bytes === 0 || bytes % 2 !== 0) {
      skipped.push({ file, reason: 'empty or truncated PCM file' });
      continue;
    }
    const journal = last.get(file);
    const complete = journal?.type === 'completed' && journal.bytes === bytes;
    tracks.push({
      userId, startMs, displayName: nameById.get(userId) || journal?.displayName || userId,
      pcmPath, incomplete: !complete, bytes,
    });
  }
  tracks.sort((a, b) => a.startMs - b.startMs || a.userId.localeCompare(b.userId));
  return { tracks, skipped };
}
