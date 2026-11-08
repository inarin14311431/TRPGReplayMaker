import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSystem } from '../SystemContext.jsx';
import { useGuild } from '../GuildContext.jsx';
import { api } from '../api.js';
import { Page, PageHead } from '../components/Page.jsx';
import { Icon } from '../components/ui.jsx';
import { discordInviteUrl } from '../lib/discord-invite.js';

import Markdown from '../components/Markdown.jsx';
import manual from '../../../docs/user-manual.md?raw';
import replayExample from '../../../examples/nova-short-replay.html?url';

const manualLinks = {
  '#1-アプリをダウンロードする': '#download',
  '../examples/nova-short-replay.html': replayExample,
};
const sectionIds = ['download', 'launch', 'discord-bot', 'transcription', 'recording', 'replay', 'backup', 'transcription-help', 'troubleshooting'];
const [manualIntro, ...manualSections] = manual.trim().split(/^## /m);
const chapters = manualSections.map((section, index) => {
  const newline = section.indexOf('\n');
  return { id: sectionIds[index], title: section.slice(0, newline), text: section.slice(newline + 1).trim() };
});

function Stage({ number, title, done, children }) {
  return (
    <section className="card p-5 space-y-3">
      <div className="flex items-start gap-3">
        <span className={'shrink-0 grid place-items-center w-8 h-8 rounded-full text-sm font-bold ' +
          (done ? 'bg-accent-soft text-accent' : 'bg-primary-soft text-primary')}>
          {done ? <Icon.Check width={17} height={17} /> : number}
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-ink">{title}</h2>
          <p className="text-xs text-muted mt-1">{done ? '準備できています' : '必要な操作を確認してください'}</p>
        </div>
      </div>
      <div className="pl-11 space-y-3 text-sm text-ink-2 leading-relaxed">{children}</div>
    </section>
  );
}

export default function GettingStarted() {
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);

  const { status, refresh } = useSystem();
  const { guilds, guildId, refreshGuilds } = useGuild();
  const [meetingCount, setMeetingCount] = useState(null);
  const [error, setError] = useState('');
  const botReady = !!status?.bot?.connected;
  const hasServer = !!guildId;
  const portable = status?.portable === true;
  const localSttAvailable = !!(status?.sidecar?.managed || status?.sidecar?.running);
  const discordId = status?.connection?.discordClientId?.value || '';
  const invite = discordInviteUrl(discordId);

  useEffect(() => {
    let active = true;
    setError('');
    setMeetingCount(null);
    if (!guildId) return () => { active = false; };
    api.meetings(guildId).then(meetings => {
      if (active) setMeetingCount(Array.isArray(meetings) ? meetings.length : 0);
    }).catch(e => { if (active) setError(e?.message || '録音一覧の取得に失敗しました。'); });
    return () => { active = false; };
  }, [guildId]);

  function updateStatus() {
    refresh();
    refreshGuilds();
    if (guildId) api.meetings(guildId).then(x => setMeetingCount(x?.length || 0)).catch(e => setError(e.message));
  }

  return (
    <Page>
      <PageHead title="はじめての方へ" subtitle="DiscordのBot接続から、録音・文字起こし・リプレイの保存まで説明します。" />
      <div className="flex flex-wrap gap-2 mb-5 text-xs text-muted">
        <span>Bot：{botReady ? '接続済み' : '未接続'}</span>
        <span>／</span>
        <span>サーバー：{guilds.length ? guilds.length + '件' : '未登録'}</span>
        <span>／</span>
        <span>録音済み：{meetingCount === null ? '—' : meetingCount + '件'}</span>
        <button className="text-primary underline" onClick={updateStatus}>状態を更新</button>
      </div>
      {error && <p role="alert" className="text-sm text-error mb-4">{error}</p>}
      <p className="mb-4 text-sm"><a className="text-primary underline" href="#manual">マニュアルの目次へ</a></p>
      <div className="grid md:grid-cols-3 gap-4 items-start">
        <Stage number={1} title="DiscordにBotを追加" done={botReady && hasServer}>
          <p>すでにBotが接続できている場合、設定のやり直しは不要です。</p>
          {!botReady && <p>DiscordのBotトークンとアプリケーションIDを一度だけ登録します。</p>}
          {!hasServer && <p>Botはまだサーバーに参加していません。招待後、状態を更新してください。</p>}
          {invite ? (
            <a href={invite} target="_blank" rel="noopener noreferrer" className="btn btn-primary !py-2 no-underline inline-flex">
              Botをサーバーに招待する <Icon.ArrowUpRight width={15} height={15}/>
            </a>
          ) : (
            <a href="https://discord.com/developers/applications" target="_blank" rel="noopener noreferrer" className="text-primary underline">
              Discord Developer Portalを開く
            </a>
          )}
          <p><Link className="text-primary underline" to="/setup">接続情報・文字起こし設定</Link></p>
        </Stage>
        <Stage number={2} title="Discordで録音する" done={hasServer && meetingCount !== null && meetingCount > 0}>
          <p>参加者全員の同意を取ってから、Discordのボイスチャンネルに入ります。</p>
          <p>チャット欄で <code className="font-mono text-ink">/trpg-start</code> と入力すると録音開始。終わったら <code className="font-mono text-ink">/trpg-stop</code> で保存・文字起こしを開始します。</p>
          <p><Link className="text-primary underline" to="/live">録音中の状態を見る</Link></p>
          {portable && !localSttAvailable && <div className="rounded-md border border-border p-3 text-xs text-muted leading-relaxed">
            <p className="font-bold text-ink">録音後の文字起こし方式を先に選択</p>
            <p className="mt-1">Docker不要のZIP版には、PythonのローカルWhisperは標準搭載していません。<Link to="/setup" className="underline text-primary">設定</Link> で OpenAI APIキーを設定し、文字起こしをOpenAI（有料）に切り替えるか、付属の Setup-Local-Whisper.bat で無料のローカル音声認識を追加してください。</p>
            <p className="mt-1">録音前に選んだ方式で短いテスト録音を行い、発言が表示されることを確認してください。</p>
          </div>}
          {!portable && <p className="text-xs text-muted">初回の文字起こしでは音声モデルのダウンロードが必要になる場合があります。</p>}
        </Stage>
        <Stage number={3} title="リプレイを作成・保存" done={false}>
          <p>録音が終わったら、リプレイ作成画面でアクト名・キャスト名を入力し、必要なシーンを自動分割します。</p>
          <p>文章生成は低価格APIかローカルAIを選べます。結果を確認したらHTMLで保存できます。</p>
          <Link to="/replays" className="btn btn-primary !py-2 no-underline inline-flex">
            リプレイ作成を開く <Icon.Arrow width={15} height={15}/>
          </Link>
        </Stage>
      </div>
      <section id="manual" className="mt-8 scroll-mt-4">
        <h2 className="text-xl font-bold text-ink mb-3">操作マニュアル（Windows）</h2>
        <Markdown text={manualIntro.replace(/^# .*\n/, '').trim()} links={manualLinks} className="text-sm text-ink-2" />
        <nav aria-label="マニュアルの目次" className="card p-5 mt-4">
          <h3 className="font-bold text-ink mb-2">目次</h3>
          <ul className="grid gap-2 sm:grid-cols-2 text-sm">
            {chapters.map(chapter => (
              <li key={chapter.id}><a className="text-primary underline" href={'#' + chapter.id}>{chapter.title}</a></li>
            ))}
          </ul>
        </nav>
        <div className="mt-4 space-y-4">
          {chapters.map(chapter => (
            <section id={chapter.id} key={chapter.id} className="card p-5 scroll-mt-4">
              <h3 className="font-bold text-ink mb-3">{chapter.title}</h3>
              {chapter.id === 'transcription-help' && <p className="mb-3 text-sm"><Link to="/setup" className="text-primary underline">文字起こしの設定を開く</Link></p>}
              <Markdown text={chapter.text} links={manualLinks} className="text-sm text-ink-2 leading-relaxed" />
            </section>
          ))}
        </div>
      </section>
      <div className="mt-5 card p-4 text-sm text-muted leading-relaxed">
        <strong className="text-ink">ご注意：</strong> このアプリは現時点では自分のPCなどで動かす構成です。
        GitHubのURLを開くだけでは録音Botは起動しません。録音PCを終了するとBotも停止します。
        保存音声や生成原稿には非公開の会話が含まれるため、公開GitHubにアップロードしないでください。
      </div>
    </Page>
  );
}
