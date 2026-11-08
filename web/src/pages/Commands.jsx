import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Page, PageHead } from '../components/Page.jsx';
import { Icon, Empty } from '../components/ui.jsx';

const CATEGORY_ORDER = ['Recording', 'Notes', 'Configuration'];
const CATEGORY_META = {
  Recording: { label: '録音', desc: '録音の開始・終了と状況の確認ができます。' },
  Notes: { label: 'ノート', desc: '録音のノートを読んだり、投稿・検索したりできます。' },
  Configuration: { label: '設定', desc: 'サーバーごとにBotを設定します。' },
};

function CommandRow({ cmd }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <code className="shrink-0 mt-0.5 inline-flex items-center font-mono text-[13px] font-medium text-primary bg-primary-soft rounded-sm px-2 py-1">
        /{cmd.name}
      </code>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[14px] font-medium text-ink">{cmd.summary}</p>
          {cmd.admin && (
            <span className="chip !text-warn !bg-warn-soft">管理者</span>
          )}
        </div>
        {cmd.args && <p className="text-xs text-muted mt-1 font-mono">/{cmd.name} <span className="text-faint">{cmd.args}</span></p>}
        {cmd.detail && <p className="text-[13px] text-muted leading-relaxed mt-1.5">{cmd.detail}</p>}
      </div>
    </div>
  );
}

export default function Commands() {
  const [commands, setCommands] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let stale = false;
    api.commands()
      .then((r) => { if (!stale) setCommands(r.commands || []); })
      .catch((e) => { if (!stale) setError(e?.message || 'コマンドの読み込みに失敗しました'); });
    return () => { stale = true; };
  }, []);

  const byCat = (cat) => (commands || []).filter((c) => c.category === cat);

  return (
    <Page max="820px">
      <PageHead
        title="Discordコマンド"
        subtitle="Discordのチャット欄に「/」を入力すると、使えるコマンドが表示されます。"
      />

      {error ? (
        <Empty icon={Icon.Terminal} title="コマンドを読み込めませんでした" body={error} />
      ) : !commands ? (
        <div className="space-y-5">{[0, 1, 2].map((i) => <div key={i} className="h-40 skeleton rounded-[14px]" />)}</div>
      ) : (
        <div className="space-y-5">
          {CATEGORY_ORDER.filter((cat) => byCat(cat).length > 0).map((cat) => (
            <section key={cat} className="card overflow-hidden">
              <div className="px-4 pt-4 pb-2">
                <h2 className="text-sm font-bold text-ink">{CATEGORY_META[cat].label}</h2>
                {CATEGORY_META[cat]?.desc && <p className="text-xs text-muted mt-0.5">{CATEGORY_META[cat].desc}</p>}
              </div>
              <div className="divide-y divide-border">
                {byCat(cat).map((cmd) => <CommandRow key={cmd.name} cmd={cmd} />)}
              </div>
            </section>
          ))}

          <div className="card p-5 flex items-start gap-3">
            <Icon.Sparkle width={18} height={18} className="text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-[14px] font-medium text-ink">自動録音について</p>
              <p className="text-[13px] text-muted leading-relaxed mt-1">
                自動参加を有効にすると、ボイスチャンネルに2人以上入ったときに自動で録音します。
                切り替えるには
                <Link to="/setup" className="text-primary hover:underline">設定</Link>を開くか、
                <code className="text-ink-2">/setup autojoin</code>を実行してください。
              </p>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}
