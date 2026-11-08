import { SlashCommandBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';
import { SUPPORTED_PROVIDERS } from '../adapters/summarizer/index.js';
import { WHISPER_MODELS } from './setup-logic.js';
import { STT_PROVIDERS, STT_MODELS } from '../adapters/stt/index.js';
import { LANGUAGES } from '../adapters/summarizer/languages.js';

// Discord caps a string option at 25 choices; the cloud STT model ids comfortably
// fit. Flatten every provider's models into one choice list for `stt_model`.
const STT_MODEL_CHOICES = [...new Set(Object.values(STT_MODELS).flat())];

export function buildCommands() {
  return [
    new SlashCommandBuilder().setName('trpg-start').setDescription('Join your voice channel and start recording'),
    new SlashCommandBuilder().setName('trpg-stop').setDescription('Stop recording and leave'),
    new SlashCommandBuilder().setName('summary').setDescription('Show notes for a meeting')
      .addIntegerOption((o) => o.setName('meeting').setDescription('Meeting id (default: most recent)')),
    new SlashCommandBuilder().setName('post').setDescription('Post a meeting summary publicly in this channel')
      .addIntegerOption((o) => o.setName('meeting').setDescription('Meeting id (default: most recent)')),
    new SlashCommandBuilder().setName('history').setDescription('List recent meetings'),
    new SlashCommandBuilder().setName('status').setDescription('Check bot status and current recording'),
    new SlashCommandBuilder().setName('raw').setDescription('Dump raw meeting data')
      .addIntegerOption((o) => o.setName('meeting').setDescription('Meeting id (default: most recent)')),
    new SlashCommandBuilder().setName('search').setDescription('Search past meetings')
      .addStringOption((o) => o.setName('keyword').setDescription('Word or phrase').setRequired(true)),
    new SlashCommandBuilder().setName('setup').setDescription('Configure the bot (admin only)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addStringOption((o) => o.setName('provider').setDescription('Summarizer provider')
        .addChoices(...SUPPORTED_PROVIDERS.map((p) => ({ name: p, value: p }))))
      .addStringOption((o) => o.setName('model').setDescription('Summarizer model — type to search the provider catalog').setAutocomplete(true))
      .addStringOption((o) => o.setName('fallback_provider').setDescription('Backup summarizer used only if the primary fails')
        .addChoices(...SUPPORTED_PROVIDERS.map((p) => ({ name: p, value: p })), { name: 'none', value: 'none' }))
      .addStringOption((o) => o.setName('fallback_model').setDescription('Backup summarizer model — type to search the provider catalog').setAutocomplete(true))
      .addStringOption((o) => o.setName('stt_provider').setDescription('Speech-to-text provider')
        .addChoices(...STT_PROVIDERS.map((p) => ({ name: p, value: p }))))
      .addStringOption((o) => o.setName('stt_model').setDescription('Cloud STT model (OpenAI)')
        .addChoices(...STT_MODEL_CHOICES.map((m) => ({ name: m, value: m }))))
      .addStringOption((o) => o.setName('whisper_model').setDescription('Whisper model size (local sidecar)')
        .addChoices(...WHISPER_MODELS.map((m) => ({ name: m, value: m }))))
      .addChannelOption((o) => o.setName('notes_channel').setDescription('Where to post notes').addChannelTypes(ChannelType.GuildText))
      .addBooleanOption((o) => o.setName('thread').setDescription('Post notes in a thread'))
      .addBooleanOption((o) => o.setName('autojoin').setDescription('Auto-join when 2+ people are in voice'))
      .addStringOption((o) => o.setName('language').setDescription('Spoken language (pick German to fix DE/EN mixing)')
        .addChoices(...LANGUAGES.map((l) => ({ name: l.name, value: l.code })), { name: 'Auto-detect', value: 'auto' }))
      .addStringOption((o) => o.setName('summary_language').setDescription('Language for the notes/summary')
        .addChoices(...LANGUAGES.map((l) => ({ name: l.name, value: l.code })), { name: 'Match transcription', value: 'match' })),
  ];
}

export function commandsJSON() {
  return buildCommands().map((c) => c.toJSON());
}

// UI-facing catalog of the slash commands (single source for the dashboard's
// Commands page). Kept next to buildCommands() so they stay in sync. `admin`
// marks commands gated behind the Manage Server permission; `args` is a short
// human description of the options.
export const COMMAND_CATALOG = [
  { name: 'trpg-start', category: 'Recording', admin: false, args: null,
    summary: '録音を開始します。',
    detail: '参加中のボイスチャンネルにBotが入り、発言者ごとに録音します。録音中はBotの名前に [REC] が付きます。' },
  { name: 'trpg-stop', category: 'Recording', admin: false, args: null,
    summary: '録音を終了し、文字起こしを開始します。',
    detail: '録音が終わると文字起こしが始まり、処理後に指定したチャンネルやスレッドへノートを投稿します。' },
  { name: 'status', category: 'Recording', admin: false, args: null,
    summary: '録音の状況を確認します。' },
  { name: 'summary', category: 'Notes', admin: false, args: '[meeting]',
    summary: '録音のノートを表示します。',
    detail: '要点、話題、決定事項、質問、タスク、発言時間を自分だけに表示します。' },
  { name: 'post', category: 'Notes', admin: false, args: '[meeting]',
    summary: 'このチャンネルに録音の要約を投稿します。',
    detail: '/summary と同じ内容をチャンネル全体に表示します。スレッド投稿が有効ならスレッドに投稿します。' },
  { name: 'history', category: 'Notes', admin: false, args: null,
    summary: '最近の録音を一覧で表示します。' },
  { name: 'raw', category: 'Notes', admin: false, args: '[meeting]',
    summary: '録音データをJSONで表示します。',
    detail: '録音情報、参加者、発言、要約をJSONで確認できます。' },
  { name: 'search', category: 'Notes', admin: false, args: '<keyword>',
    summary: '文字起こしをキーワードで検索します。' },
  { name: 'setup', category: 'Configuration', admin: true,
    args: '[provider] [model] [fallback_provider] [fallback_model] [stt_provider] [stt_model] [whisper_model] [notes_channel] [thread] [autojoin] [language] [summary_language]',
    summary: 'このサーバーのBotを設定します（管理者のみ）。',
    detail: '要約や文字起こしの提供元、投稿先、自動参加、言語などを設定します。Web画面の「設定」からも変更できます。' },
];
;
