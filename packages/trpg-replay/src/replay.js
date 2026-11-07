/**
 * Convert a Parley meeting JSON export into an auditable, scene-split TRPG replay draft.
 * This module does not infer player-vs-character speech or invent events.
 */

const text = (v, fallback = '') => (typeof v === 'string' ? v : fallback);
const safe = (v) => text(v).replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/\\/g, '\\\\')
  .replace(/([`*_{}\[\]()#+.!|~\-])/g, '\\$1')
  .replace(/\r?\n/g, '\n  ');

function integerTimestamp(v) {
  const n = Number(v);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

/** Elapsed time uses hours, not minutes modulo 60; 12+ hour sessions work. */
export function formatElapsedMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) throw new RangeError('Invalid elapsed milliseconds');
  const n = Math.floor(ms / 1000);
  return `${String(Math.floor(n / 3600)).padStart(2, '0')}:${String(Math.floor(n % 3600 / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}

/** Accept H:MM:SS, MM:SS or a number of seconds. */
export function parseElapsed(value) {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value * 1000;
  if (typeof value !== 'string') throw new TypeError('Scene time must be a string or integer seconds');
  const parts = value.split(':');
  if (parts.length !== 2 && parts.length !== 3) throw new Error(`Invalid scene time: ${value}`);
  if (!parts.every(p => /^\d+$/.test(p))) throw new Error(`Invalid scene time: ${value}`);
  const nums = parts.map(Number);
  const seconds = nums.pop();
  const minutes = nums.pop();
  const hours = nums.pop() ?? 0;
  if (seconds > 59 || minutes > 59 || !Number.isSafeInteger(hours * 3600 + minutes * 60 + seconds)) {
    throw new Error(`Out-of-range scene time: ${value}`);
  }
  return (hours * 3600 + minutes * 60 + seconds) * 1000;
}

function resolvePerson(raw, people = {}, peopleByName = {}) {
  const id = String(raw.user_id ?? raw.userId ?? '');
  const displayName = text(raw.display_name ?? raw.displayName, '不明な発言者');
  const p = people[id] ?? peopleByName[displayName] ?? {};
  return {
    userId: id,
    originalName: displayName,
    speakerName: text(p.name, displayName),
    characterName: text(p.character),
    role: ['GM', 'PL', 'other'].includes(p.role) ? p.role : 'other',
    mapped: Object.prototype.hasOwnProperty.call(people, id) ||
      Object.prototype.hasOwnProperty.call(peopleByName, displayName),
  };
}

function readTimestamps(raw) {
  const startMs = integerTimestamp(raw.start_ms ?? raw.startMs);
  if (startMs === null) throw new Error('Utterance has an invalid start_ms/startMs');
  const endMs = integerTimestamp(raw.end_ms ?? raw.endMs);
  return { startMs, endMs: endMs === null ? startMs : Math.max(startMs, endMs) };
}

export function prepareReplay(data, config = {}) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.utterances)) {
    throw new TypeError('Expected a Parley JSON export with an utterances array');
  }
  if (config !== null && (typeof config !== 'object' || Array.isArray(config))) {
    throw new TypeError('Expected a JSON configuration object');
  }
  const settings = config ?? {};
  const meeting = data.meeting ?? {};
  const validRows = data.utterances.map((u, i) => ({ raw: u, index: i, ...readTimestamps(u) }));
  const minMs = validRows.reduce((min, row) => Math.min(min, row.startMs), Infinity);
  const absolute = minMs !== Infinity && minMs >= 100_000_000_000; // Parley saves epoch milliseconds
  const fromMeeting = Date.parse(meeting.started_at ?? meeting.startedAt ?? '');
  const origin = absolute && Number.isFinite(fromMeeting) ? fromMeeting : (absolute ? minMs : 0);
  const warnings = [];
  if (data.meeting?.transcription_complete === 0 || data.meeting?.transcription_complete === false) {
    warnings.push('元データの文字起こしは不完全と記録されています。欠落した音声がある可能性があります。');
  }
  if (absolute && origin > minMs) warnings.push('録音開始時刻より前の発言があります。負の経過時間は0秒で表示します。');

  const utterances = validRows
    .sort((a, b) => a.startMs - b.startMs || a.index - b.index)
    .map(({ raw, index, startMs, endMs }) => {
      const person = resolvePerson(raw, settings.people ?? {}, settings.peopleByName ?? {});
      return {
        index,
        startMs,
        endMs,
        elapsedMs: Math.max(0, startMs - origin),
        elapsed: formatElapsedMs(Math.max(0, startMs - origin)),
        text: text(raw.text),
        ...person,
      };
    });
  if (utterances.some(u => !u.mapped)) warnings.push('キャスト設定がない発言者がいます。話者名を確認してください。');
  warnings.push('PL発言とキャストの台詞は自動判定していません。リプレイ編集時に区別してください。');

  const scenes = (settings.scenes ?? []).map((scene, index) => {
    if (!scene || typeof scene !== 'object' || !text(scene.title).trim()) {
      throw new Error(`Scene ${index + 1} must have a title`);
    }
    return { atMs: parseElapsed(scene.at), title: scene.title.trim(), index };
  }).sort((a, b) => a.atMs - b.atMs || a.index - b.index);
  if (!scenes.length || scenes[0].atMs > 0) {
    scenes.unshift({ atMs: 0, title: '開始（シーン未設定）', index: -1 });
  }

  const title = text(settings.title).trim() || text(meeting.channel_name, 'TRPG Session');
  const session = {
    schemaVersion: 1,
    source: 'Parley JSON meeting export',
    meetingId: meeting.id ?? null,
    startedAt: meeting.started_at ?? meeting.startedAt ?? null,
    title,
    system: text(settings.system),
    scenes: scenes.map(s => ({ at: formatElapsedMs(s.atMs), title: s.title })),
    utterances,
    warnings,
  };
  return session;
}

export function renderReplayMarkdown(session) {
  const lines = [
    `# ${safe(session.title)}`,
    '',
    `- システム: ${safe(session.system || '未設定')}`,
    `- 開始日時: ${safe(String(session.startedAt ?? '未設定'))}`,
    `- 元データ: ${safe(session.source)}`,
    `- 発言数: ${session.utterances.length}`,
    '',
    '> 編集前の発言ログです。GM描写・PL発言・キャスト台詞の区別は未判定です。原文を照合しながら編集してください。',
    '',
  ];
  for (const warning of session.warnings) lines.push(`> 注意: ${safe(warning)}`);
  lines.push('', '---', '');
  const sortedScenes = session.scenes.map(s => ({ ...s, atMs: parseElapsed(s.at) }));
  let nextScene = 0;
  for (const u of session.utterances) {
    while (nextScene < sortedScenes.length && sortedScenes[nextScene].atMs <= u.elapsedMs) {
      const scene = sortedScenes[nextScene++];
      lines.push(`## ${safe(scene.title)}（${scene.at}）`, '');
    }
    let who = u.speakerName;
    if (u.role === 'GM') who = `GM・${who}`;
    if (u.role === 'PL' && u.characterName) who = `${who} / ${u.characterName}`;
    lines.push(`**[${u.elapsed}] ${safe(who)}:** ${safe(u.text)}`, '');
  }
  // Keep scene markers even when a session ended before their configured time.
  while (nextScene < sortedScenes.length) {
    const scene = sortedScenes[nextScene++];
    lines.push(`## ${safe(scene.title)}（${scene.at}）`, '', '*この時刻以降の発言はありません。*', '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}
