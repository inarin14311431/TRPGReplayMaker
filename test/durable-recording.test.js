import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../src/store/db.js';
import { appendTrackEvent, readTrackEvents, recoverPcmTracks, TRACK_JOURNAL } from '../src/voice/track-journal.js';
import { audioRetentionDays, reconcileOnBoot, sweepRetainedAudio } from '../src/store/reconcile.js';
import { transcribeTracks } from '../src/pipeline/transcribe.js';
import { retryPlan } from '../src/pipeline/retry.js';
import { processMeeting } from '../src/pipeline/orchestrator.js';

function scratch(t) {
  const dir = mkdtempSync(join(tmpdir(), 'trpg-durable-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
const pcm = Buffer.alloc(640, 0);
const when = (s) => Date.parse(s);

test('journal records started/completed speech and recovers finished tracks', t => {
  const dir = scratch(t);
  const file = 'u_123456.pcm';
  writeFileSync(join(dir, file), pcm);
  appendTrackEvent(dir, { type: 'started', file, userId: 'u', displayName: 'Alice' });
  appendTrackEvent(dir, { type: 'completed', file, userId: 'u', displayName: 'Alice', bytes: pcm.length });
  const { tracks, skipped } = recoverPcmTracks(dir);
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].incomplete, false);
  assert.equal(tracks[0].displayName, 'Alice');
  assert.equal(skipped.length, 0);
  assert.equal(readTrackEvents(dir).length, 2);
});

test('crash during speech recovers valid partial PCM but marks incomplete', t => {
  const dir = scratch(t);
  writeFileSync(join(dir, 'u_5000.pcm'), pcm);
  appendTrackEvent(dir, { type: 'started', file: 'u_5000.pcm', userId: 'u', displayName: 'A' });
  appendFileSync(join(dir, TRACK_JOURNAL), '{"v":1,"type":"completed","file":"bad');
  const { tracks } = recoverPcmTracks(dir);
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].incomplete, true);
  assert.equal(readTrackEvents(dir).length, 1);
});

test('modified PCM no longer matches completed journal byte count', t => {
  const dir = scratch(t);
  writeFileSync(join(dir, 'u_5.pcm'), pcm);
  appendTrackEvent(dir, { type: 'completed', file: 'u_5.pcm', userId: 'u', bytes: pcm.length });
  writeFileSync(join(dir, 'u_5.pcm'), Buffer.alloc(320));
  assert.equal(recoverPcmTracks(dir).tracks[0].incomplete, true);
});

test('empty, odd-byte, and malformed PCM are rejected for retry', t => {
  const dir = scratch(t);
  writeFileSync(join(dir, 'a_100.pcm'), Buffer.alloc(0));
  writeFileSync(join(dir, 'a_200.pcm'), Buffer.alloc(3));
  writeFileSync(join(dir, 'a_abcd.pcm'), pcm);
  const { tracks, skipped } = recoverPcmTracks(dir);
  assert.equal(tracks.length, 0);
  assert.equal(skipped.length, 2);
});

test('retryPlan recognizes a crashed recording and protects original audio', t => {
  const dir = scratch(t);
  const db = openDb(':memory:');
  const meetingId = db.createMeeting({ guildId: 'g', channelId: 'c', channelName: 'v', startedAt: '2026-11-07T00:00:00Z' });
  const audioDir = join(dir, 'audio', String(meetingId));
  mkdirSync(audioDir, { recursive: true });
  writeFileSync(join(audioDir, 'speaker_12000.pcm'), pcm);
  appendTrackEvent(audioDir, { type: 'started', file: 'speaker_12000.pcm', userId: 'speaker', displayName: 'Alice' });
  db.setMeetingStatus(meetingId, 'transcription_failed');
  assert.equal(retryPlan(db, meetingId, { dataDir: dir }).action, 'retranscribe');
  assert.equal(existsSync(join(audioDir, 'speaker_12000.pcm')), true);
});

test('expired successful source audio is removed, recent and failed audio is kept', async t => {
  const dir = scratch(t), db = openDb(':memory:');
  const root = join(dir, 'audio');
  const finished = db.createMeeting({ guildId: 'g', channelId: 'c', channelName: 'old', startedAt: '2026-08-01T00:00:00Z' });
  const recent = db.createMeeting({ guildId: 'g', channelId: 'c', channelName: 'recent', startedAt: '2026-11-06T00:00:00Z' });
  const failed = db.createMeeting({ guildId: 'g', channelId: 'c', channelName: 'failed', startedAt: '2020-01-01T00:00:00Z' });
  db.setMeetingStatus(finished, 'done');
  db.setMeetingStatus(recent, 'done');
  db.setMeetingStatus(failed, 'transcription_failed');
  for (const id of [finished, recent, failed]) {
    mkdirSync(join(root, String(id)), { recursive: true });
    writeFileSync(join(root, String(id), 'u_0.pcm'), pcm);
  }
  const count = await sweepRetainedAudio(db, root, { nowMs: when('2026-11-07T12:00:00Z'), retentionDays: 30, log: {} });
  assert.equal(count, 1);
  assert.equal(existsSync(join(root, String(finished))), false);
  assert.equal(existsSync(join(root, String(recent))), true);
  assert.equal(existsSync(join(root, String(failed))), true);
});

test('0-day retention preserves completed audio without deleting other data', async t => {
  const dir = scratch(t), db = openDb(':memory:'), root = join(dir, 'audio');
  const id = db.createMeeting({ guildId: 'g', channelId: 'c', channelName: 'test', startedAt: '2020-01-01T00:00:00Z' });
  db.setMeetingStatus(id, 'done');
  mkdirSync(join(root, String(id)), { recursive: true });
  writeFileSync(join(root, String(id), 'u_0.pcm'), pcm);
  assert.equal(await sweepRetainedAudio(db, root, { retentionDays: 0, log: {} }), 0);
  assert.equal(existsSync(join(root, String(id))), true);
  assert.equal(audioRetentionDays('invalid'), 30);
  assert.equal(audioRetentionDays('0'), 0);
});

test('boot reconciling interrupted meeting retains PCM for retry', async t => {
  const dir = scratch(t), db = openDb(':memory:');
  const id = db.createMeeting({ guildId: 'g', channelId: 'c', channelName: 'test', startedAt: '2026-11-07T00:00:00Z' });
  const p = join(dir, 'audio', String(id));
  mkdirSync(p, { recursive: true });
  writeFileSync(join(p, 'u_100.pcm'), pcm);
  const r = await reconcileOnBoot(db, join(dir, 'audio'), { log: {} });
  assert.equal(r.orphanMeetings, 1);
  assert.equal(db.getMeeting(id).status, 'transcription_failed');
  assert.equal(existsSync(join(p, 'u_100.pcm')), true);
});

test('STT cached results survive mid-session failures and retry only failed tracks', async t => {
  const dir = scratch(t), db = openDb(':memory:');
  const id = db.createMeeting({ guildId: 'g', channelId: 'c', channelName: 'test', startedAt: '2026-11-07T00:00:00Z' });
  const tracks = [
    { userId: 'u', displayName: 'Alice', startMs: 1000, pcmPath: join(dir, 'u_1000.pcm') },
    { userId: 'u', displayName: 'Alice', startMs: 3000, pcmPath: join(dir, 'u_3000.pcm') },
  ];
  for (const track of tracks) writeFileSync(track.pcmPath, pcm);
  const checkpoint = {
    get: (track, signature) => db.getTrackTranscription(id, track.pcmPath.split('/').pop(), signature, track.userId, track.startMs),
    save: (track, signature, record) => db.saveTrackTranscription(id, track.pcmPath.split('/').pop(), signature, record),
  };
  let calls = [];
  const run = async (crash) => transcribeTracks(tracks, {}, {
    checkpoint, convert: async (pcmPath, wav) => wav, cleanup: () => {},
    stt: async (wav) => {
      calls.push(wav);
      if (crash && wav.includes('3000')) throw new Error('temporary STT failure');
      return { text: '原文', words: [{ end: 2 }] };
    },
  });
  const first = await run(true);
  assert.equal(first.utterances.length, 1);
  assert.equal(first.failures.length, 1);
  calls = [];
  const second = await run(false);
  assert.equal(second.failures.length, 0);
  assert.deepEqual(second.utterances.map(u => u.startMs), [1000, 3000]);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /3000/);
});

test('checkpoint invalidated when raw PCM length changes', async t => {
  const dir = scratch(t), db = openDb(':memory:'), path = join(dir, 'u_1000.pcm');
  const id = db.createMeeting({ guildId: 'g', channelId: 'c', channelName: 'test', startedAt: 't' });
  const track = { userId: 'u', displayName: 'A', startMs: 1000, pcmPath: path };
  writeFileSync(path, pcm);
  let count = 0;
  const deps = {
    convert: async (p, w) => w, cleanup: () => {},
    stt: async () => { count++; return { text: 'Hello', words: [{ end: 1 }] }; },
    checkpoint: {
      get: (_, signature) => db.getTrackTranscription(id, 'u_1000.pcm', signature, 'u', 1000),
      save: (_, signature, record) => db.saveTrackTranscription(id, 'u_1000.pcm', signature, record),
    },
  };
  await transcribeTracks([track], {}, deps);
  await transcribeTracks([track], {}, deps);
  assert.equal(count, 1);
  writeFileSync(path, Buffer.alloc(1280));
  await transcribeTracks([track], {}, deps);
  assert.equal(count, 2);
});

test('partial source audio yields explicitly incomplete transcript, not done', async () => {
  const db = openDb(':memory:');
  const id = db.createMeeting({ guildId: 'g', channelId: 'c', channelName: 'test', startedAt: '2026-11-07T00:00:00Z' });
  const result = await processMeeting(db, id, {
    tracks: [{ userId: 'u', displayName: 'A', startMs: 100, pcmPath: '/crashed.pcm', incomplete: true }],
    cfg: { summarizerProvider: 'fake', summaryLanguage: 'ja' },
    transcribe: async () => [{ userId: 'u', displayName: 'A', startMs: 100, endMs: 1000, text: 'hello' }],
    summarizer: { summarize: async () => ({ tldr: 'Test', topics: [], decisions: [], actionItems: [] }) },
  });
  assert.equal(result.partial, true);
  assert.equal(db.getMeeting(id).status, 'partial');
  assert.equal(db.getMeeting(id).transcription_complete, 0);
});

test('checkpoint entries are cleaned when a meeting is deleted', () => {
  const db = openDb(':memory:');
  const id = db.createMeeting({ guildId: 'g', channelId: 'c', channelName: 'test', startedAt: 't' });
  db.saveTrackTranscription(id, 'u_1000.pcm', { bytes: 640, sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }, { userId: 'u', displayName: 'A', startMs: 1000, endMs: 3000, text: 'done' });
  assert.ok(db.getTrackTranscription(id, 'u_1000.pcm', { bytes: 640, sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }, 'u', 1000));
  db.deleteMeeting(id);
  assert.equal(db.getTrackTranscription(id, 'u_1000.pcm', { bytes: 640, sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }, 'u', 1000), null);
});

test('same-size PCM replacement invalidates cached STT via SHA-256', async t => {
  const dir = scratch(t), db = openDb(':memory:'), path = join(dir, 'u_2000.pcm');
  const id = db.createMeeting({ guildId: 'g', channelId: 'c', channelName: 'test', startedAt: 't' });
  const track = { userId: 'u', displayName: 'A', startMs: 2000, pcmPath: path };
  writeFileSync(path, Buffer.alloc(640, 1));
  let calls = 0;
  const deps = {
    convert: async (p, w) => w, cleanup: () => {},
    stt: async () => { calls++; return { text: 'Hello', words: [{ end: 1 }] }; },
    checkpoint: {
      get: (_, s) => db.getTrackTranscription(id, 'u_2000.pcm', s, 'u', 2000),
      save: (_, s, rec) => db.saveTrackTranscription(id, 'u_2000.pcm', s, rec),
    },
  };
  await transcribeTracks([track], {}, deps);
  writeFileSync(path, Buffer.alloc(640, 2));
  await transcribeTracks([track], {}, deps);
  assert.equal(calls, 2);
});

test('legacy per-track cache table migrates to SHA-256 verification column', async t => {
  const dir = scratch(t), file = join(dir, 'db.sqlite');
  const { DatabaseSync } = await import('node:sqlite');
  const old = new DatabaseSync(file);
  old.exec('CREATE TABLE track_transcriptions (meeting_id INTEGER, pcm_name TEXT, pcm_bytes INTEGER, user_id TEXT, display_name TEXT, start_ms INTEGER, end_ms INTEGER, text TEXT, PRIMARY KEY(meeting_id, pcm_name))');
  old.close();
  const db = openDb(file);
  const cols = db.sql.prepare('PRAGMA table_info(track_transcriptions)').all().map(x => x.name);
  assert.ok(cols.includes('pcm_sha256'));
  db.sql.close();
});

test('partial summary without source PCM does not promise a full recovery', t => {
  const dir = scratch(t), db = openDb(':memory:');
  const id = db.createMeeting({ guildId: 'g', channelId: 'c', channelName: 'partial', startedAt: 't' });
  db.addUtterance({ meetingId: id, userId: 'u', displayName: 'A', startMs: 0, endMs: 100, text: 'partial' });
  db.setMeetingStatus(id, 'partial');
  assert.equal(retryPlan(db, id, { dataDir: dir }).ok, false);
});
