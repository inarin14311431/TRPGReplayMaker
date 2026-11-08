import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useGuild } from '../GuildContext.jsx';
import { Page, PageHead, SectionHead } from '../components/Page.jsx';
import { BarChart, RankBars, Donut } from '../components/charts.jsx';
import { Avatar, Icon, Empty } from '../components/ui.jsx';
import { fmtHours, fmtMs, fmtCompact, colorOf } from '../lib/format.js';

function StatTile({ label, value, sub }) {
  return (
    <div className="card p-4">
      <div className="stat-value text-ink text-2xl">{value}</div>
      <div className="text-xs text-muted mt-1">{label}</div>
      {sub && <div className="text-[11px] text-faint mt-0.5">{sub}</div>}
    </div>
  );
}

export default function Analytics() {
  const { guildId } = useGuild();
  const [agg, setAgg] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!guildId) return;
    let stale = false;
    setAgg(null); setError(null);
    api.stats(guildId)
      .then((a) => { if (!stale) setAgg(a); })
      .catch((e) => { if (!stale) setError(e?.message || '読み込みに失敗しました'); });
    return () => { stale = true; };
  }, [guildId]);

  const wordRows = useMemo(() => {
    if (!agg) return [];
    return agg.leaderboard.slice(0, 8).map((p) => ({
      label: p.displayName, value: p.words, display: `${fmtCompact(p.words)}語`, color: colorOf(p.displayName),
    }));
  }, [agg]);

  if (!guildId) return <Page><Empty icon={Icon.Chart} title="サーバーが選択されていません" /></Page>;
  if (error) return <Page><Empty icon={Icon.Chart} title="集計を読み込めませんでした" body={error} /></Page>;
  if (!agg) return (
    <Page>
      <div className="h-8 w-44 skeleton mb-7" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">{[0,1,2,3].map(i => <div key={i} className="h-24 skeleton rounded-[14px]" />)}</div>
      <div className="grid lg:grid-cols-2 gap-6">{[0,1].map(i => <div key={i} className="h-72 skeleton rounded-[14px]" />)}</div>
    </Page>
  );

  const { stats, leaderboard, timeline } = agg;
  const totalDays = timeline.filter((t) => t.count > 0).length;
  const avgPerActiveDay = totalDays ? (stats.totalMeetings / totalDays) : 0;
  const talkRows = leaderboard.slice(0, 8).map((p) => ({
    label: p.displayName, value: p.ms, display: fmtMs(p.ms), color: colorOf(p.displayName),
  }));

  return (
    <Page>
      <PageHead title="集計" subtitle="このサーバーの発言時間、参加状況、録音数を確認できます。" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile label="総録音数" value={stats.totalMeetings} sub={`録音した日数 ${totalDays}日`} />
        <StatTile label="総発言時間" value={fmtHours(stats.totalTalkMs)} sub={`発言 ${fmtCompact(stats.totalUtterances)}件`} />
        <StatTile label="録音した日の平均" value={avgPerActiveDay.toFixed(1)} sub="件" />
        <StatTile label="タスク" value={stats.todos.total} sub={`未完了${stats.todos.open}件`} />
      </div>

      <div className="card p-5 mb-6">
        <SectionHead title="日ごとの録音数" action={<span className="text-xs text-muted">過去30日</span>} />
        <BarChart data={timeline} height={190} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <SectionHead title="参加者ごとの発言時間" />
          {talkRows.length === 0 ? <p className="text-sm text-muted py-4">データがありません。</p> : <RankBars rows={talkRows} />}
        </div>
        <div className="card p-5">
          <SectionHead title="発言した単語数" />
          {wordRows.length === 0 ? <p className="text-sm text-muted py-4">データがありません。</p> : <RankBars rows={wordRows} />}
        </div>
      </div>

      <div className="card p-5 mt-6">
        <SectionHead title="参加状況" action={<span className="text-xs text-muted">{leaderboard.length}人</span>} />
        <div className="flex items-center gap-6 flex-wrap">
          <Donut value={stats.todos.done} total={stats.todos.total || 1}
            label={`${Math.round((stats.todos.done / (stats.todos.total || 1)) * 100)}%`} sub="tasks done" />
          <div className="flex-1 min-w-[240px]">
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5">
              {leaderboard.map((p) => (
                <div key={p.displayName} className="flex items-center gap-2.5">
                  <Avatar name={p.displayName} size={26} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] text-ink truncate">{p.displayName}</div>
                    <div className="text-[11px] text-muted">{p.meetings} meetings · {fmtMs(p.ms)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}
