import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { openDb } from '../src/store/db.js';
import { getReplayOverview, saveReplayProject } from '../src/replay/store.js';
import {
  lunaCostUsd, reserveCostUsd, quoteScene, installReplayUsageTable,
  replaySpentUsd, spendGuard, recordReplayUsage, requestLuna, LUNA_MODEL,
} from '../src/replay/economy.js';
import { replayRouter } from '../src/web/replay-api.js';

const seed = () => {
  const db = openDb(':memory:');
  const id = db.createMeeting({
    guildId: 'g', channelId: 'c', channelName: 'TRPG',
    startedAt: '2026-11-07T10:00:00Z',
  });
  db.addAttendee(id, 'pl1', 'PL1');
  db.addUtterance({
    meetingId: id, userId: 'pl1', displayName: 'PL1',
    startMs: Date.parse('2026-11-07T10:00:02Z'),
    endMs: Date.parse('2026-11-07T10:00:04Z'),
    text: '神業を使います。',
  });
  getReplayOverview(db, id);
  return { db, id };
};
async function server(db, generateText) {
  const app = express();
  app.use(express.json());
  app.use('/api/replays', replayRouter({ db, generateText }));
  const listener = app.listen(0, '127.0.0.1');
  await new Promise(r => listener.once('listening', r));
  return { url: 'http://127.0.0.1:' + listener.address().port, close: () => new Promise(ok => listener.close(ok)) };
}
const request = async (s, url, method = 'GET', body = null) => {
  const r = await fetch(s.url + '/api/replays' + url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, body: await r.json() };
};

test('Luna published price computes small session estimates', () => {
  assert.equal(lunaCostUsd(200000, 100000), 0.07);
  assert.equal(lunaCostUsd(0, 0), 0);
  const q = quoteScene('日本語をここで整える');
  assert.ok(q.estimatedUsd > 0);
  assert.ok(q.reservedUsd >= q.estimatedUsd);
  assert.equal(typeof reserveCostUsd('abc'), 'number');
});

test('legacy replay project gets budget and engine columns', () => {
  const { db, id } = seed();
  const p = getReplayOverview(db, id).project;
  assert.equal(p.engine, 'inherit');
  assert.equal(p.budget_usd, 0.5);
  assert.equal(p.local_model, 'qwen2.5:7b');
  installReplayUsageTable(db);
  installReplayUsageTable(db);
  assert.equal(replaySpentUsd(db, id), 0);
});

test('economy settings reject unsafe engines and invalid dollar budgets', () => {
  const { db, id } = seed();
  const p = saveReplayProject(db, id, { title: 'test', engine: 'luna', budgetUsd: 0.02 });
  assert.equal(p.engine, 'luna');
  assert.equal(p.budget_usd, 0.02);
  assert.throws(() => saveReplayProject(db, id, { engine: 'unknown' }), /Invalid economy engine/);
  assert.throws(() => saveReplayProject(db, id, { budgetUsd: -1 }), /Budget/);
  assert.throws(() => saveReplayProject(db, id, { budgetUsd: 999 }), /Budget/);
});

test('paid budget guard stops work before API call', async () => {
  const { db, id } = seed();
  saveReplayProject(db, id, { title: 'test', engine: 'luna', budgetUsd: 0 });
  let called = 0;
  const s = await server(db, async () => { called++; return 'This should not be called'; });
  try {
    const preview = await request(s, '/meetings/' + id + '/cost-preview');
    assert.equal(preview.status, 200);
    assert.equal(preview.body.engine, 'luna');
    assert.ok(preview.body.reservedPendingUsd > 0);
    const scene = getReplayOverview(db, id).scenes[0];
    const r = await request(s, '/meetings/' + id + '/scenes/' + scene.id + '/generate', 'POST', {});
    assert.equal(r.status, 402);
    assert.equal(called, 0);
    assert.equal(replaySpentUsd(db, id), 0);
  } finally { await s.close(); }
});

test('Luna generation records measured costs; re-generate requires overwrite', async () => {
  const { db, id } = seed();
  saveReplayProject(db, id, { title: 'test', engine: 'luna', budgetUsd: 0.5 });
  let called = 0;
  const s = await server(db, async () => {
    called++;
    return { text: '編集済み本文', inputTokens: 2000, outputTokens: 800 };
  });
  try {
    const scene = getReplayOverview(db, id).scenes[0];
    const p = '/meetings/' + id + '/scenes/' + scene.id + '/generate';
    const res = await request(s, p, 'POST', {});
    assert.equal(res.status, 200);
    assert.equal(res.body.engine, 'luna');
    assert.equal(replaySpentUsd(db, id), lunaCostUsd(2000, 800));
    assert.equal((await request(s, p, 'POST', {})).status, 409);
    assert.equal(called, 1);
    const info = await request(s, '/meetings/' + id + '/cost-preview');
    assert.equal(info.body.pending.length, 0);
  } finally { await s.close(); }
});

test('local engine does not spend external AI budget', async () => {
  const { db, id } = seed();
  saveReplayProject(db, id, { title: 'test', engine: 'local', localModel: 'qwen2.5:7b', budgetUsd: 0 });
  const s = await server(db, async (_prompt, meta) => {
    assert.equal(meta.engine, 'local');
    return { text: 'ローカル本文' };
  });
  try {
    const scene = getReplayOverview(db, id).scenes[0];
    const res = await request(s, '/meetings/' + id + '/scenes/' + scene.id + '/generate', 'POST', {});
    assert.equal(res.status, 200);
    assert.equal(replaySpentUsd(db, id), 0);
    assert.equal((await request(s, '/meetings/' + id + '/cost-preview')).body.engine, 'local');
  } finally { await s.close(); }
});

test('usage follows source meeting merge and is deleted with meeting', () => {
  const { db, id } = seed();
  const m2 = db.createMeeting({ guildId: 'g', channelId: 'c', channelName: 'extra', startedAt: '2026-11-07T11:00:00Z' });
  recordReplayUsage(db, { meetingId: m2, sceneId: 99, engine: 'luna', model: LUNA_MODEL, inputTokens: 200000, outputTokens: 100000 });
  assert.equal(replaySpentUsd(db, m2), 0.07);
  db.mergeMeetings(id, [m2]);
  assert.equal(replaySpentUsd(db, id), 0.07);
  db.deleteMeeting(id);
  assert.equal(replaySpentUsd(db, id), 0);
});

test('low-cost API call passes output cap and returns provider token usage', async () => {
  const fake = async (_url, opts) => {
    assert.equal(JSON.parse(opts.body).model, 'gpt-6-luna');
    assert.equal(JSON.parse(opts.body).max_completion_tokens, 4000);
    assert.equal(JSON.parse(opts.body).reasoning_effort, 'none');
    return { ok: true, json: async () => ({
      choices: [{ message: { content: 'できあがった原稿' } }],
      usage: { prompt_tokens: 1200, completion_tokens: 500 },
    }) };
  };
  const result = await requestLuna('テスト', { apiKey: 'testing', fetchImpl: fake });
  assert.equal(result.text, 'できあがった原稿');
  assert.equal(result.inputTokens, 1200);
  assert.equal(result.outputTokens, 500);
  await assert.rejects(requestLuna('テスト', { apiKey: null, fetchImpl: fake }), /OPENAI_API_KEY/);
});

test('ledger rejects calls after available dollar balance is exhausted', () => {
  const { db, id } = seed();
  recordReplayUsage(db, { meetingId: id, sceneId: 1, engine: 'luna', model: LUNA_MODEL, inputTokens: 200000, outputTokens: 100000 });
  assert.throws(() => spendGuard(db, id, 0.07, reserveCostUsd('new prompt')), /exceeds/);
  assert.doesNotThrow(() => spendGuard(db, id, 0.10, reserveCostUsd('new prompt')));
});
