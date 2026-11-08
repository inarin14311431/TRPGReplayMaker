import { useSystem } from '../SystemContext.jsx';
import { Logo } from '../components/ui.jsx';
import { ConnectionForm, BotStatusBadge } from '../components/Connection.jsx';

const STEPS = [
  {
    title: 'Discord Botを作る（初回だけ）',
    content: <> <a href="https://discord.com/developers/applications" target="_blank" rel="noopener noreferrer" className="text-primary underline">Discord Developer Portal</a> で <b>New Application</b> を選択。<b>Bot</b> からトークンを取得し、<b>General Information</b> からアプリケーションIDをコピーします。</>,
  },
  {
    title: '入力して、サーバーに招待',
    content: <>右の欄にトークンとIDを入力してください。IDを入力すると <b>DiscordサーバーにBotを招待</b> が表示されます。Botの招待にはそのサーバーの管理権限が必要です。</>,
  },
  {
    title: 'Discordで録音 → ブラウザでリプレイ',
    content: <>Botを接続できたら、Discordのボイスチャンネルで <code className="text-ink">/trpg-start</code> を実行。終了時は <code className="text-ink">/trpg-stop</code>。その後、リプレイ作成画面から原稿にします。</>,
  },
];

export default function Onboarding() {
  const { status, refresh } = useSystem();
  const bot = status?.bot;
  const connecting = bot?.state === 'starting';
  const error = bot?.state === 'error' ? bot?.error : null;

  return (
    <div className="min-h-screen bg-bg text-ink flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-[970px] grid md:grid-cols-2 gap-6 md:gap-10 items-start">
        <div className="md:pt-4">
          <div className="flex items-center gap-3 mb-6">
            <Logo size={40} />
            <span className="font-display text-2xl font-extrabold tracking-tight">TRPGReplayMaker</span>
          </div>
          <h1 className="font-display text-[26px] font-extrabold leading-tight mb-3">最初のセットアップ</h1>
          <p className="text-muted text-sm leading-relaxed mb-7">
            この設定を行うのはサーバー管理者だけです。セッション参加者はDiscordだけで参加できます。
          </p>
          <ol className="space-y-6">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-3.5">
                <span className="shrink-0 mt-0.5 grid place-items-center h-7 w-7 rounded-full bg-primary-soft text-primary text-sm font-bold">{i + 1}</span>
                <div>
                  <h2 className="text-sm font-semibold text-ink">{step.title}</h2>
                  <p className="text-[13px] text-muted leading-relaxed mt-1">{step.content}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted mt-8">録音は必ず参加者全員の同意を得て開始してください。</p>
        </div>
        <div className="card p-6">
          <div className="flex justify-between items-center gap-3 mb-5">
            <h2 className="text-base font-bold text-ink">Botの接続情報</h2>
            {bot && <BotStatusBadge bot={bot} />}
          </div>
          {connecting ? (
            <div role="status" className="py-10 text-center">
              <div className="mx-auto mb-4 h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <p className="text-sm font-medium text-ink">Discordに接続しています…</p>
            </div>
          ) : (
            <>
              {error && <p role="alert" className="mb-4 text-sm text-error bg-error-soft rounded-md px-3 py-2">{error}</p>}
              <ConnectionForm conn={status?.connection} onSaved={refresh} submitLabel="保存して接続する" />
            </>
          )}
          <p className="text-xs text-muted leading-relaxed mt-5">トークンはローカル設定に保存し、招待URLには含めません。Web画面は通常、このPCからのみアクセスできます。</p>
          {status?.portable && <p className="text-xs text-muted leading-relaxed mt-3">Dockerなしのポータブル版で起動しています。Botの接続後は「使い方ガイド」から文字起こし方式を確認してください。OpenAI音声認識は従量課金、ローカルWhisperは別途Pythonが必要です。</p>}
        </div>
      </div>
    </div>
  );
}
