import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TrackRegistry } from '../src/voice/capture.js';

test('TrackRegistry records and lists finished tracks', () => {
  const reg = new TrackRegistry();
  reg.begin('u1', 'Alice', 1000, '/audio/1/u1_1000.pcm');
  reg.begin('u2', 'Bob', 1500, '/audio/1/u2_1500.pcm');
  reg.finish('u1');
  reg.finish('u2');
  const tracks = reg.list();
  assert.equal(tracks.length, 2);
  assert.deepEqual(tracks.map((t) => t.displayName).sort(), ['Alice', 'Bob']);
  assert.equal(tracks[0].pcmPath.endsWith('.pcm'), true);
});

test('TrackRegistry isActive prevents duplicate begin', () => {
  const reg = new TrackRegistry();
  reg.begin('u1', 'Alice', 1000, '/p.pcm');
  assert.equal(reg.isActive('u1'), true);
  assert.equal(reg.isActive('u2'), false);
});

// ── attachCapture wiring: listener detach + onSpeaker (needs fakes) ────────────
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { attachCapture } from '../src/voice/capture.js';

// Minimal stand-ins for the discord.js voice receiver + guild so we can drive
// speaking-start events deterministically without a live connection. subscribe
// returns a stream that emits 'end' on the next tick so tracks finish cleanly.
function fakeConnection() {
  const speaking = new EventEmitter();
  return {
    receiver: {
      speaking,
      subscribe() {
        const s = new EventEmitter();
        s.pipe = () => s;            // opusStream.pipe(decoder).pipe(out)
        s.destroy = () => {};
        setImmediate(() => s.emit('end'));
        return s;
      },
    },
  };
}
function fakeGuild(members) {
  return { members: { cache: { get: (id) => members[id] } } };
}

test('stopAll detaches the speaking listener so post-stop speech is ignored', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'parley-cap-'));
  try {
    const connection = fakeConnection();
    const guild = fakeGuild({ u1: { displayName: 'Alice', user: { bot: false } } });
    const { TrackRegistry } = await import('../src/voice/capture.js');
    const registry = new TrackRegistry();
    const { stopAll } = attachCapture({ connection, guild, audioDir: dir, registry });

    await stopAll();
    // A speaking-start AFTER stopAll must not open a new (untracked) stream.
    connection.receiver.speaking.emit('start', 'u1');
    await new Promise((r) => setImmediate(r));
    assert.equal(registry.isActive('u1'), false);
    assert.equal(registry.list().length, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('onSpeaker fires for a member who first speaks (latecomer attendee capture)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'parley-cap2-'));
  try {
    const connection = fakeConnection();
    const guild = fakeGuild({ u9: { displayName: 'Latecomer', user: { bot: false } } });
    const { TrackRegistry } = await import('../src/voice/capture.js');
    const registry = new TrackRegistry();
    const seen = [];
    attachCapture({ connection, guild, audioDir: dir, registry, onSpeaker: (id, name) => seen.push([id, name]) });

    connection.receiver.speaking.emit('start', 'u9');
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(seen, [['u9', 'Latecomer']]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// A throw while starting a track (e.g. the native opus module failing to load
// after a system libc upgrade) must NOT escape the speaking-start listener and
// crash the whole process mid-meeting. Regression for the glibc-2.44 opus crash.
test('a throwing track start is swallowed and does not crash the emitter', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'parley-cap3-'));
  try {
    const connection = fakeConnection();
    // subscribe() throws to simulate opus/decoder construction blowing up.
    connection.receiver.subscribe = () => { throw new Error('Cannot find module opus.node'); };
    const guild = fakeGuild({ u1: { displayName: 'Alice', user: { bot: false } } });
    const { TrackRegistry } = await import('../src/voice/capture.js');
    const registry = new TrackRegistry();
    attachCapture({ connection, guild, audioDir: dir, registry });

    // If the throw escaped the listener this would take the process down.
    assert.doesNotThrow(() => connection.receiver.speaking.emit('start', 'u1'));
    await new Promise((r) => setImmediate(r));
    assert.equal(registry.isActive('u1'), false);
    assert.equal(registry.list().length, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Real Node streams with a pass-through decoder exercise the flush contract
// without requiring live Discord or native Opus packets.
import { PassThrough } from 'node:stream';
import { readFileSync, existsSync } from 'node:fs';

test('natural end only marks a track complete after all PCM is flushed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'trpg-drain-natural-'));
  try {
    const speaking = new EventEmitter();
    const source = new PassThrough();
    const conn = { receiver: { speaking, subscribe: () => source } };
    const guild = fakeGuild({ u1: { displayName: 'Alice', user: { bot: false } } });
    const registry = new TrackRegistry();
    attachCapture({
      connection: conn, guild, audioDir: dir, registry,
      now: () => 12345, createDecoder: () => new PassThrough(),
    });
    speaking.emit('start', 'u1');
    const payload = Buffer.alloc(65536, 0x19);
    source.write(payload);
    source.end();
    await new Promise((resolve, reject) => {
      const start = Date.now();
      const tick = () => {
        if (registry.list().length) return resolve();
        if (Date.now() - start > 2000) return reject(new Error('Track did not flush'));
        setTimeout(tick, 5);
      };
      tick();
    });
    const { pcmPath, incomplete } = registry.list()[0];
    assert.equal(incomplete, undefined);
    assert.deepEqual(readFileSync(pcmPath), payload);
    assert.match(readFileSync(join(dir, 'tracks.jsonl'), 'utf8'), /"type":"completed"/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('manual stop drains a speaking track but marks last speech interrupted', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'trpg-drain-manual-'));
  try {
    const speaking = new EventEmitter();
    const source = new PassThrough();
    const conn = { receiver: { speaking, subscribe: () => source } };
    const guild = fakeGuild({ u1: { displayName: 'Alice', user: { bot: false } } });
    const registry = new TrackRegistry();
    const { stopAll } = attachCapture({
      connection: conn, guild, audioDir: dir, registry,
      now: () => 54321, createDecoder: () => new PassThrough(),
    });
    speaking.emit('start', 'u1');
    source.write(Buffer.alloc(1280, 0x3a));
    await stopAll();
    assert.equal(registry.list().length, 1);
    assert.equal(registry.list()[0].incomplete, true);
    assert.equal(readFileSync(registry.list()[0].pcmPath).length, 1280);
    assert.match(readFileSync(join(dir, 'tracks.jsonl'), 'utf8'), /"type":"interrupted"/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
