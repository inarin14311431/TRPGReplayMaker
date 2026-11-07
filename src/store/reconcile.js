// Crash recovery and policy-controlled source-audio retention.
import { readdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

// 0 = preserve successful audio indefinitely; invalid values fail safely to 30d.
export function audioRetentionDays(value = process.env.AUDIO_RETENTION_DAYS) {
  if (value == null || value === '') return 30;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : 30;
}

const KEEP_ALWAYS = new Set(['recording', 'processing', 'transcription_failed', 'summary_failed', 'partial']);

function shouldDeleteAudio(meeting, nowMs, retentionDays) {
  if (!meeting || meeting.status === 'empty') return true;
  if (KEEP_ALWAYS.has(meeting.status)) return false;
  if (meeting.status !== 'done') return false; // unknown state: never auto-delete
  if (retentionDays === 0) return false;
  const endedMs = Date.parse(meeting.ended_at || meeting.started_at || '');
  // Invalid timestamps: keep, rather than deleting audio we cannot date.
  return Number.isFinite(endedMs) && endedMs + retentionDays * 86_400_000 < nowMs;
}

// Safe to call while the bot is live: actively recording, retryable or partial
// meeting audio is never deleted. Deletion counts reflect confirmed successes.
export async function sweepRetainedAudio(db, audioRoot, {
  readdir = readdirSync, remove = rm, log = console,
  retentionDays = audioRetentionDays(), nowMs = Date.now(),
} = {}) {
  let dirs;
  try { dirs = readdir(audioRoot, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); }
  catch (e) { if (e.code === 'ENOENT') return 0; throw e; }
  let swept = 0;
  for (const name of dirs) {
    if (!/^\d+$/.test(name) || !Number.isSafeInteger(Number(name))) continue;
    const meeting = db.getMeeting(Number(name));
    if (!shouldDeleteAudio(meeting, nowMs, retentionDays)) continue;
    try {
      await remove(join(audioRoot, name), { recursive: true, force: true });
      swept++;
    } catch (err) {
      log.warn?.('[retention] failed to remove meeting audio ' + name + ': ' + err.message);
    }
  }
  if (swept) log.log?.('[retention] removed ' + swept + ' expired or orphaned audio dir(s).');
  return swept;
}

// Runs only before the application starts; do not call during a live recording.
export async function reconcileOnBoot(db, audioRoot, opts = {}) {
  const result = { orphanMeetings: 0, sweptDirs: 0 };
  for (const m of db.findOrphanedMeetings()) {
    // Previously captured PCM remains in the audio dir; retry reads it directly.
    db.setMeetingStatus(m.id, 'transcription_failed');
    result.orphanMeetings++;
    opts.log?.warn?.('[reconcile] meeting ' + m.id + ' interrupted; saved PCM can be retried.');
  }
  result.sweptDirs = await sweepRetainedAudio(db, audioRoot, opts);
  return result;
}
