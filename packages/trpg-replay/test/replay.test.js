import test from 'node:test';
import assert from 'node:assert/strict';
import { formatElapsedMs, parseElapsed, prepareReplay, renderReplayMarkdown } from '../src/replay.js';

const fixture = (utterances, meeting = {}) => ({ meeting: { id: 1, started_at: '2026-11-07T00:00:00.000Z', channel_name: 'Session', ...meeting }, utterances });
const utter = (start_ms, user_id = 'A', text = '発言', extra = {}) => ({ start_ms, end_ms: start_ms + 2000, user_id, display_name: user_id, text, ...extra });

test('12+ hour timestamps do not wrap at 60 minutes or 24 hours', () => {
  assert.equal(formatElapsedMs(12 * 3600_000 + 2 * 60_000 + 3000), '12:02:03');
  assert.equal(formatElapsedMs(26 * 3600_000), '26:00:00');
});

test('elapsed parser accepts H:MM:SS, MM:SS and seconds', () => {
  assert.equal(parseElapsed('12:15:30'), 44_130_000);
  assert.equal(parseElapsed('15:30'), 930_000);
  assert.equal(parseElapsed(180), 180_000);
  assert.throws(() => parseElapsed('01:70:10'));
});

test('Parley epoch timestamps are relative to meeting start and sorted chronologically', () => {
  const base = Date.parse('2026-11-07T00:00:00.000Z');
  const data = fixture([utter(base + 10000, 'B', '二つ目'), utter(base + 3000, 'A', '一つ目')]);
  const normalized = prepareReplay(data);
  assert.deepEqual(normalized.utterances.map(u => u.elapsed), ['00:00:03', '00:00:10']);
  assert.deepEqual(normalized.utterances.map(u => u.text), ['一つ目', '二つ目']);
});

test('role and character mapping does not rewrite source content', () => {
  const data = fixture([utter(1000, 'A', '「この先に進む」')]);
  const normalized = prepareReplay(data, { title: 'テスト', people: { A: { role: 'PL', name: 'PL1', character: 'キャスト1' } } });
  assert.equal(normalized.utterances[0].text, '「この先に進む」');
  assert.match(renderReplayMarkdown(normalized), /PL1 \/ キャスト1/);
  assert.match(renderReplayMarkdown(normalized), /PL発言とキャストの台詞は自動判定していません/);
});

test('scene transitions occur at and after boundaries', () => {
  const normalized = prepareReplay(fixture([utter(1000), utter(7200001)]), {
    scenes: [{ at: '00:00:00', title: '導入' }, { at: '02:00:00', title: '調査' }],
  });
  const md = renderReplayMarkdown(normalized);
  assert.ok(md.indexOf('導入') < md.indexOf('[00:00:01]'));
  assert.ok(md.indexOf('調査') > md.indexOf('[00:00:01]'));
  assert.ok(md.indexOf('調査') < md.indexOf('[02:00:00]'));
});

test('equal timestamps keep original order', () => {
  const normalized = prepareReplay(fixture([utter(3000, 'A', '一'), utter(3000, 'B', '二')]));
  assert.deepEqual(normalized.utterances.map(u => u.text), ['一', '二']);
});

test('incomplete transcripts are flagged and not silently treated as complete', () => {
  const normalized = prepareReplay(fixture([utter(1000)], { transcription_complete: 0 }));
  assert.match(normalized.warnings.join(' '), /不完全/);
});

test('Markdown and HTML in Discord messages are escaped', () => {
  const normalized = prepareReplay(fixture([utter(1000, 'A', '<script>alert(1)</script> **bold**')]));
  const md = renderReplayMarkdown(normalized);
  assert.doesNotMatch(md, /<script>/);
  assert.match(md, /&lt;script&gt;/);
  assert.match(md, /\\\*\\\*bold\\\*\\\*/);
});

test('empty session produces a valid draft without inventing speech', () => {
  const normalized = prepareReplay(fixture([]));
  assert.equal(normalized.utterances.length, 0);
  assert.match(renderReplayMarkdown(normalized), /発言数: 0/);
});

test('malformed Parley rows fail rather than silently corrupt time', () => {
  assert.throws(() => prepareReplay(fixture([utter('not-time')])), /invalid start/);
  assert.throws(() => prepareReplay({ meeting: {} }), /utterances array/);
});

test('a 13 hour session is displayed with full-hour timestamps', () => {
  const base = Date.parse('2026-11-07T00:00:00.000Z');
  const session = prepareReplay(fixture([utter(base + 13 * 3600_000 + 1000)]));
  assert.equal(session.utterances[0].elapsed, '13:00:01');
});

test('large Parley exports do not overflow argument limits', () => {
  const rows = Array.from({ length: 150000 }, (_, i) => utter(i * 1000, 'A', 'テスト'));
  const session = prepareReplay(fixture(rows));
  assert.equal(session.utterances.length, 150000);
  assert.equal(session.utterances.at(-1).elapsed, '41:39:59');
});
