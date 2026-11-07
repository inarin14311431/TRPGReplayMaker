import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { openDb } from '../src/store/db.js';
import {
  getReplayOverview, saveReplayProject, saveScene, saveSpeaker, updateReplayLine,
} from '../src/replay/store.js';
import { buildScenePrompt, rowsForScene } from '../src/replay/render.js';
import { isNovaSystem, renderSafeMarkdown, exportReplayHtml } from '../src/replay/html.js';
import { replayRouter } from '../src/web/replay-api.js';

function seed() {
  const db = openDb(':memory:');
  const id = db.createMeeting({ guildId: 'g', channelId: 'c', channelName: 'Test act', startedAt: '2026-11-07T10:00:00Z' });
  const timestamp = Date.parse('2026-11-07T10:00:00Z');
  db.addAttendee(id, 'rl', '管理人');
  db.addAttendee(id, 'pl', '参加者');
  db.addUtterance({ meetingId: id, userId: 'rl', displayName: '管理人',
    startMs: timestamp + 1000, endMs: timestamp + 3000, text: '裏路地だ。' });
  db.addUtterance({ meetingId: id, userId: 'pl', displayName: '参加者',
    startMs: timestamp + 4000, endMs: timestamp + 5000, text: '「了解」' });
  const ov = getReplayOverview(db, id);
  return { db, id, scene: ov.scenes[0], transcript: db.listUtterances(id) };
}

async function withServer(db, generateText, run) {
  const app = express();
  app.use(express.json());
  app.use('/api/replays', replayRouter({ db, generateText }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try { return await run('http://127.0.0.1:' + server.address().port); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('new projects default to Tokyo N◎VA but can switch to other TRPG systems', () => {
  const { db, id } = seed();
  assert.equal(getReplayOverview(db, id).project.system_name, 'トーキョーN◎VA');
  assert.equal(isNovaSystem('トーキョーN◎VA'), true);
  assert.equal(isNovaSystem('トーキョーＮ◎ＶＡ'), true);
  assert.equal(isNovaSystem('クトゥルフ神話TRPG'), false);
  const changed = saveReplayProject(db, id, { systemName: 'Other System' });
  assert.equal(changed.system_name, 'Other System');
});

test('N◎VA scene prompt respects RL / cast distinctions and does not invent miracles', () => {
  const { db, id, scene } = seed();
  const o = getReplayOverview(db, id);
  const p = buildScenePrompt(o, scene, rowsForScene(db, id, scene.id));
  assert.match(p, /ルーラー/);
  assert.match(p, /キャスト/);
  assert.match(p, /神業/);
  assert.match(p, /ログにない事件/);
  saveReplayProject(db, id, { systemName: 'Generic Fantasy' });
  const generic = buildScenePrompt(getReplayOverview(db, id), scene, rowsForScene(db, id, scene.id));
  assert.doesNotMatch(generic, /このアクトはトーキョーN◎VA/);
});

test('portable HTML is self-contained, responsive and has scene navigation', () => {
  const { db, id } = seed();
  const html = exportReplayHtml(db, id, { mode: 'script' });
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<meta name="viewport"/);
  assert.match(html, /SCENE 01/);
  assert.match(html, /href="#scene-1"/);
  assert.match(html, /TOKYO N◎VA \/ ACT REPLAY/);
  assert.match(html, /裏路地だ/);
  assert.match(html, /@media print/);
  assert.match(html, /Content-Security-Policy/);
  assert.doesNotMatch(html, /<script/);
  assert.doesNotMatch(html, /<link rel=/);
  assert.doesNotMatch(html, /<img/);
});

test('HTML respects character speakers, visible corrected text and hidden lines', () => {
  const { db, id, transcript } = seed();
  saveSpeaker(db, id, 'rl', { playerName: 'ルーラーA', role: 'GM' });
  saveSpeaker(db, id, 'pl', { playerName: 'PL一号', characterName: '霧島', role: 'PL' });
  updateReplayLine(db, id, transcript[0].id, { speechKind: 'gm' });
  updateReplayLine(db, id, transcript[1].id, { speechKind: 'character', correctedText: '「準備完了」' });
  let html = exportReplayHtml(db, id, { mode: 'script' });
  assert.match(html, /RL \/ GM/);
  assert.match(html, /ルーラーA/);
  assert.match(html, /霧島/);
  assert.match(html, /「準備完了」/);
  assert.doesNotMatch(html, /「了解」/);
  updateReplayLine(db, id, transcript[0].id, { hidden: true, speechKind: 'gm' });
  html = exportReplayHtml(db, id, { mode: 'script' });
  assert.doesNotMatch(html, /裏路地だ/);
  assert.match(html, /準備完了/);
});

test('malicious titles and AI markdown are rendered as harmless text', () => {
  const { db, id, scene } = seed();
  saveReplayProject(db, id, { title: '<script>alert("x")</script>' });
  saveScene(db, id, scene.id, { title: '事件 <img src=x onerror=alert(1)>', draftText: [
    '## 描写',
    '<script>alert(1)</script>',
    '- <svg onload=alert(2)>',
    '**危険な台詞**',
    '> <iframe src=evil>',
  ].join('\n') });
  const html = exportReplayHtml(db, id);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert/);
  assert.match(html, /&lt;svg onload=alert/);
  assert.match(html, /<strong>危険な台詞<\/strong>/);
  assert.match(html, /&lt;iframe src=evil&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<iframe/);
  assert.doesNotMatch(html, /<svg/);
});

test('Markdown renderer has safe limited formatting', () => {
  const html = renderSafeMarkdown('## 見出し\n\n文の**強調**\n次行\n\n- 箇条書き\n\n> 引用');
  assert.match(html, /<h4>見出し<\/h4>/);
  assert.match(html, /<p>文の<strong>強調<\/strong><br>次行<\/p>/);
  assert.match(html, /<ul><li>箇条書き<\/li><\/ul>/);
  assert.match(html, /<blockquote>引用<\/blockquote>/);
});

test('per-act provider and model setting is validated and persisted without API keys', () => {
  const { db, id } = seed();
  assert.equal(getReplayOverview(db, id).project.ai_provider, 'gemini');
  const changed = saveReplayProject(db, id, { engine: 'custom', aiProvider: 'openrouter', aiModel: 'deepseek/deepseek-chat' });
  assert.equal(changed.engine, 'custom');
  assert.equal(changed.ai_provider, 'openrouter');
  assert.equal(changed.ai_model, 'deepseek/deepseek-chat');
  assert.equal(JSON.stringify(changed).includes('api_key'), false);
  assert.throws(() => saveReplayProject(db, id, { aiProvider: 'fake' }), /Invalid AI provider/);
  assert.throws(() => saveReplayProject(db, id, { aiModel: '../.env?x=<script>' }), /Invalid AI model ID/);
});

test('Web API downloads HTML and invokes selected custom engine metadata', async () => {
  const { db, id, scene } = seed();
  saveReplayProject(db, id, { engine: 'custom', aiProvider: 'openai', aiModel: 'gpt-4o-mini' });
  let calls = 0;
  await withServer(db, async (prompt, args) => {
    calls++;
    assert.equal(args.engine, 'custom');
    assert.match(prompt, /トーキョーN◎VA/);
    return '## 本文\n\n「確認した。」';
  }, async (base) => {
    const info = await fetch(base + '/api/replays/meetings/' + id + '/cost-preview').then(r => r.json());
    assert.equal(info.engine, 'custom');
    assert.equal(info.model, 'gpt-4o-mini');
    assert.equal(info.estimatedPendingUsd, 0);
    const generated = await fetch(base + '/api/replays/meetings/' + id + '/scenes/' + scene.id + '/generate', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ overwrite: false }),
    });
    assert.equal(generated.status, 200);
    assert.equal(calls, 1);
    const response = await fetch(base + '/api/replays/meetings/' + id + '/export?format=html&mode=draft');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.match(response.headers.get('content-disposition'), /\.html"/);
    const html = await response.text();
    assert.match(html, /「確認した。」/);
    const transcript = await fetch(base + '/api/replays/meetings/' + id + '/export?format=html&mode=script').then(r => r.text());
    assert.match(transcript, /裏路地だ/);
  });
});
