// Generate an original, short Tokyo N◎VA sample using the production HTML exporter.
// No Discord, AI provider, API key or official artwork is required.
// Usage: node scripts/generate-replay-sample.mjs [output.html]
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { openDb } from '../src/store/db.js';
import { getReplayOverview, createScene, saveReplayProject, saveSpeaker, updateReplayLine } from '../src/replay/store.js';
import { exportReplayHtml } from '../src/replay/html.js';

export function generateReplaySample() {
  const db = openDb(':memory:');
  const base = Date.parse('2026-11-07T18:00:00Z');
  const meetingId = db.createMeeting({
    guildId: 'fictional-server', channelId: 'fictional-table',
    channelName: '硝子の目撃者', startedAt: '2026-11-07T18:00:00Z',
  });
  const people = [
    { id: 'rl', discordName: 'サンプルRL', playerName: 'RL', characterName: '', role: 'GM' },
    { id: 'pl-a', discordName: 'PL-A', playerName: '真白のPL', characterName: '真白', role: 'PL' },
    { id: 'pl-b', discordName: 'PL-B', playerName: '京のPL', characterName: '京', role: 'PL' },
  ];
  for (const p of people) db.addAttendee(meetingId, p.id, p.discordName);
  getReplayOverview(db, meetingId);
  saveReplayProject(db, meetingId, { title: '硝子の目撃者', systemName: 'トーキョーN◎VA' });
  for (const p of people) saveSpeaker(db, meetingId, p.id, p);
  const utterances = [
    [5000, 'rl', 'gm', 'N◎VAの夜。雨が降る高架下で、依頼人が二人を待っていた。'],
    [17000, 'pl-a', 'character', '「約束の時間だ。話を聞こう」'],
    [26000, 'rl', 'gm', '依頼人は記録端末を取り出す。「昨夜、監視映像から弟の姿だけが消えた。理由を知りたい」'],
    [41000, 'pl-b', 'character', '「映像が消えたのか。それとも、そこにいた記録そのものが？」'],
    [55000, 'pl-b', 'table', 'ここで端末の記録を調べたいです。'],
    [62000, 'rl', 'gm', 'RLは調査可能だと伝える。'],
    [395000, 'rl', 'gm', '調査の結果、記録の欠落はわずか一秒。映像は意図的に編集されていた。'],
    [409000, 'pl-b', 'character', '「犯人は弟さんを消したんじゃない。誰かに見つからないよう、記録を隠したんだ」'],
    [424000, 'pl-a', 'character', '「なら、その一秒を買い戻しに行く。代金は高そうだがな」'],
    [438000, 'rl', 'gm', '依頼人は黙ってうなずいた。街の灯が、雨の向こうでにじんでいる。'],
  ];
  for (const [ms, userId, speechKind, text] of utterances) {
    const who = people.find(p => p.id === userId);
    db.addUtterance({ meetingId, userId, displayName: who.discordName, startMs: base + ms, endMs: base + ms + 3000, text });
  }
  createScene(db, meetingId, { title: '消えた一秒', startMs: 390000 });
  // Example is transcript-style: actual fictional lines, not AI-synthesized content.
  const rows = db.listUtterances(meetingId);
  for (const [i, row] of rows.entries()) {
    updateReplayLine(db, meetingId, row.id, { speechKind: utterances[i][2] });
  }
  return exportReplayHtml(db, meetingId, { mode: 'script' });
}

const file = resolve(process.argv[2] || 'examples/nova-short-replay.html');
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, generateReplaySample(), 'utf8');
console.log('Wrote ' + file);
