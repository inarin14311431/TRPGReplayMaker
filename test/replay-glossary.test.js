import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { readFileSync } from 'node:fs';
import { generateReplaySample } from '../scripts/generate-replay-sample.mjs';
import { openDb } from '../src/store/db.js';
import { getReplayOverview, saveReplayProject } from '../src/replay/store.js';
import { buildScenePrompt, rowsForScene } from '../src/replay/render.js';
import {
  GLOSSARY_PRESETS, GLOSSARY_CHOICES, inferSystemPreset,
  selectedGlossaryPresets, glossaryForPrompt, glossaryCatalog,
} from '../src/replay/glossary.js';
import { replayRouter } from '../src/web/replay-api.js';

function seed() {
  const db = openDb(':memory:');
  const id = db.createMeeting({
    guildId: 'g', channelId: 'c', channelName: 'テスト',
    startedAt: '2026-11-07T09:00:00Z',
  });
  const start = Date.parse('2026-11-07T09:00:00Z');
  db.addAttendee(id, 'pl', '参加者');
  db.addUtterance({ meetingId: id, userId: 'pl', displayName: '参加者',
    startMs: start + 1000, endMs: start + 2000, text: 'ここで判定します。' });
  const overview = getReplayOverview(db, id);
  return { db, id, scene: overview.scenes[0] };
}

test('TRPG presets include common, N◎VA and several other systems', () => {
  const ids = GLOSSARY_PRESETS.map(p => p.id);
  assert.deepEqual(ids, ['common', 'nova', 'coc', 'dx3', 'sw25', 'dnd5e']);
  assert.ok(GLOSSARY_PRESETS.every(p => p.terms.length >= 10));
  assert.ok(GLOSSARY_PRESETS.every(p => p.terms.every(t => t.term && t.reading && t.hint)));
  assert.ok(GLOSSARY_CHOICES.includes('auto'));
  assert.ok(GLOSSARY_CHOICES.includes('none'));
  assert.equal(glossaryCatalog().length, 6);
});

test('system identification handles fullwidth N◎VA and multiple other systems', () => {
  const expected = [
    ['トーキョーＮ◎ＶＡ', 'nova'],
    ['トーキョーN◎VA', 'nova'],
    ['クトゥルフ神話TRPG 7版', 'coc'],
    ['Call of Cthulhu', 'coc'],
    ['ダブルクロス The 3rd Edition', 'dx3'],
    ['ソード・ワールド2.5', 'sw25'],
    ['D&D 5e', 'dnd5e'],
    ['完全オリジナルTRPG', null],
  ];
  for (const [system, id] of expected) assert.equal(inferSystemPreset(system), id, system);
});

test('auto glossary includes common terms and only the matching ruleset', () => {
  const nova = glossaryForPrompt('トーキョーN◎VA');
  assert.match(nova, /リプレイ/);
  assert.match(nova, /ルーラー/);
  assert.match(nova, /神業/);
  assert.doesNotMatch(nova, /オーヴァード/);
  const coc = glossaryForPrompt('クトゥルフ神話TRPG');
  assert.match(coc, /正気度/);
  assert.doesNotMatch(coc, /神業/);
  const custom = glossaryForPrompt('架空TRPG');
  assert.match(custom, /PL/);
  assert.doesNotMatch(custom, /正気度/);
  assert.deepEqual(selectedGlossaryPresets('D&D 5e'), ['common', 'dnd5e']);
  assert.deepEqual(selectedGlossaryPresets('トーキョーN◎VA', 'common'), ['common']);
});

test('custom act terms are preserved without global transcript replacement', () => {
  const own = '真白｜ましろ｜架空のキャスト';
  assert.match(glossaryForPrompt('トーキョーN◎VA', 'none', own), /真白/);
  assert.doesNotMatch(glossaryForPrompt('トーキョーN◎VA', 'none', own), /神業/);
  assert.equal(glossaryForPrompt('任意TRPG', 'none', ''), 'なし');
  assert.match(glossaryForPrompt('任意TRPG', 'auto', own), /キャスト/); // custom line
});

test('glossary preset saved per act; invalid identifiers rejected', () => {
  const { db, id } = seed();
  assert.equal(getReplayOverview(db, id).project.glossary_preset, 'auto');
  assert.equal(saveReplayProject(db, id, { glossaryPreset: 'coc', glossary: '探索者A｜たんさくしゃえー｜PLのキャラクター' }).glossary_preset, 'coc');
  assert.throws(() => saveReplayProject(db, id, { glossaryPreset: 'not-allowed' }), /Invalid glossary preset/);
  const after = getReplayOverview(db, id).project;
  assert.match(after.glossary, /探索者A/);
});

test('scene prompt includes auto-selected glossary and act-specific entries', () => {
  const { db, id, scene } = seed();
  saveReplayProject(db, id, { systemName: 'ダブルクロス The 3rd Edition', glossary: '藤宮｜ふじみや｜PC', glossaryPreset: 'auto' });
  const overview = getReplayOverview(db, id);
  const prompt = buildScenePrompt(overview, scene, rowsForScene(db, id, scene.id));
  assert.match(prompt, /UGN/);
  assert.match(prompt, /侵蝕率/);
  assert.match(prompt, /藤宮/);
  assert.doesNotMatch(prompt, /N◎VA。GM/);
});

test('glossary HTTP catalog is available without extra services', async () => {
  const { db } = seed();
  const app = express();
  app.use('/api/replays', replayRouter({ db }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(ok => server.once('listening', ok));
  try {
    const res = await fetch('http://127.0.0.1:' + server.address().port + '/api/replays/glossaries');
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.ok(json.presets.find(p => p.id === 'sw25'));
    assert.ok(json.presets.find(p => p.id === 'dnd5e'));
  } finally { await new Promise(ok => server.close(ok)); }
});


test('sample HTML in repository matches production exporter output', () => {
  const expected = readFileSync(new URL('../examples/nova-short-replay.html', import.meta.url), 'utf8');
  const actual = generateReplaySample();
  assert.equal(actual, expected);
  assert.match(actual, /硝子の目撃者/);
  assert.match(actual, /SCENE 02/);
  assert.match(actual, /speech-table/);
  assert.doesNotMatch(actual, /<script/);
});
