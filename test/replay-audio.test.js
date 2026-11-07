import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../src/store/db.js';
import { replayRouter } from '../src/web/replay-api.js';
import { pcmName, wavHeader } from '../src/voice/audio.js';

async function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'trpg-audio-stream-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const db = openDb(':memory:');
  const id = db.createMeeting({ guildId: 'g', channelId: 'vc', channelName: 'TRPG', startedAt: '2026-11-07T00:00:00Z' });
  db.addUtterance({ meetingId: id, userId: 'speaker1', displayName: 'Player', startMs: 1000, endMs: 2000, text: 'Hello' });
  const lineId = db.listUtterances(id)[0].id;
  const audioRoot = join(dir, 'audio'), audioDir = join(audioRoot, String(id));
  mkdirSync(audioDir, { recursive: true });
  const pcm = Buffer.alloc(640, 42);
  writeFileSync(join(audioDir, pcmName('speaker1', 1000)), pcm);
  const app = express();
  app.use(express.json());
  app.use('/api/replays', replayRouter({ db, audioRoot }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(ok => server.once('listening', ok));
  t.after(() => server.close());
  return { id, lineId, audioRoot, pcm, url: 'http://127.0.0.1:' + server.address().port };
}

test('playable WAV contains header and complete original PCM track', async t => {
  const f = await fixture(t);
  const response = await fetch(f.url + '/api/replays/meetings/' + f.id + '/lines/' + f.lineId + '/audio');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /audio\/wav/);
  assert.equal(response.headers.get('accept-ranges'), 'bytes');
  assert.equal(Number(response.headers.get('content-length')), 44 + f.pcm.length);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const result = Buffer.from(await response.arrayBuffer());
  assert.deepEqual(result.subarray(0, 44), wavHeader(f.pcm.length));
  assert.deepEqual(result.subarray(44), f.pcm);
});

test('HTTP Range requests stream exact header and PCM slices', async t => {
  const f = await fixture(t);
  const base = f.url + '/api/replays/meetings/' + f.id + '/lines/' + f.lineId + '/audio';
  const response = await fetch(base, { headers: { Range: 'bytes=40-48' } });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), 'bytes 40-48/684');
  const data = Buffer.from(await response.arrayBuffer());
  assert.equal(data.length, 9);
  assert.deepEqual(data.subarray(0, 4), wavHeader(f.pcm.length).subarray(40, 44));
  assert.deepEqual(data.subarray(4), f.pcm.subarray(0, 5));
  const suffix = await fetch(base, { headers: { Range: 'bytes=-10' } });
  assert.equal(suffix.status, 206);
  assert.deepEqual(Buffer.from(await suffix.arrayBuffer()), f.pcm.subarray(-10));
});

test('unauthorized source lines, missing audio and invalid ranges are refused', async t => {
  const f = await fixture(t);
  const base = f.url + '/api/replays/meetings/' + f.id + '/lines/';
  assert.equal((await fetch(base + '999/audio')).status, 404);
  assert.equal((await fetch(base + f.lineId + '/audio', { headers: { Range: 'bytes=9000-9100' } })).status, 416);
  assert.equal((await fetch(base + f.lineId + '/audio', { headers: { Range: 'bytes=0-5,20-30' } })).status, 416);
  rmSync(join(f.audioRoot, String(f.id)), { recursive: true, force: true });
  const missing = await fetch(base + f.lineId + '/audio');
  assert.equal(missing.status, 404);
});

test('malformed user IDs never create path traversal for audio preview', async t => {
  const f = await fixture(t);
  const db = openDb(':memory:');
  assert.ok(db);
  // Inject into the route's own DB through a new utterance.
  // The API must reject invalid path components even if database rows are corrupted.
  const dir = mkdtempSync(join(tmpdir(), 'trpg-audio-ids-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const source = openDb(':memory:');
  const m = source.createMeeting({ guildId: 'g', channelId: 'c', channelName: 't', startedAt: 't' });
  source.addUtterance({ meetingId: m, userId: '../outside', displayName: 'Bad', startMs: 1, endMs: 2, text: 'x' });
  const row = source.listUtterances(m)[0];
  const app = express(); app.use('/api/replays', replayRouter({ db: source, audioRoot: dir }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(ok => server.once('listening', ok));
  try {
    const resp = await fetch('http://127.0.0.1:' + server.address().port + '/api/replays/meetings/' + m + '/lines/' + row.id + '/audio');
    assert.equal(resp.status, 404);
  } finally { await new Promise(ok => server.close(ok)); }
});
