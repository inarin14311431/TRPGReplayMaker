import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useGuild } from '../GuildContext.jsx';
import { api } from '../api.js';
import { Page, PageHead } from '../components/Page.jsx';
import { Icon } from '../components/ui.jsx';

const TYPES = [
  ['unknown', '未分類'], ['character', 'キャスト台詞'],
  ['gm', 'GM描写'], ['table', 'PL会話'], ['system', '判定・ルール'],
];
const clock = ms => {
  const s = Math.max(0, Math.floor(Number(ms) / 1000));
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(v => String(v).padStart(2, '0')).join(':');
};
function parseClock(value) {
  const m = /^(\d+):([0-5]\d):([0-5]\d)$/.exec(value.trim());
  if (!m) throw new Error('時刻は HH:MM:SS で入力してください。');
  return (Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000;
}
const input = 'w-full bg-surface-2 border border-border rounded-md text-sm px-3 py-2 text-ink focus:outline-none focus:border-primary';
const secondary = 'btn btn-ghost !py-1.5 !px-3 text-xs';
const primary = 'btn btn-primary !py-1.5 !px-3 text-xs';

function SpeakerEditor({ person, onSave }) {
  const [role, setRole] = useState(person.role);
  const [name, setName] = useState(person.playerName);
  const [character, setCharacter] = useState(person.characterName);
  const [saving, setSaving] = useState(false);
  return (
    <div className="border border-border rounded-md p-3 space-y-2">
      <p className="text-xs text-muted truncate">Discord: {person.originalName}</p>
      <div className="grid grid-cols-3 gap-2">
        <select aria-label="参加区分" value={role} onChange={e => setRole(e.target.value)} className={input}>
          <option value="PL">PL</option><option value="GM">GM</option><option value="other">その他</option>
        </select>
        <input aria-label="プレイヤー名" value={name} onChange={e => setName(e.target.value)} placeholder="PL名" className={input} />
        <input aria-label="キャスト名" value={character} onChange={e => setCharacter(e.target.value)} placeholder="キャスト名" className={input} />
      </div>
      <button className={secondary} disabled={saving} onClick={async () => {
        setSaving(true); try { await onSave(person.userId, { playerName: name, characterName: character, role }); }
        finally { setSaving(false); }
      }}>対応づけ保存</button>
    </div>
  );
}

function TranscriptLine({ line, person, onSave, onStartScene }) {
  const [editing, setEditing] = useState(false);
  const [corrected, setCorrected] = useState(line.correctedText ?? line.originalText);
  const [kind, setKind] = useState(line.speechKind);
  const [hidden, setHidden] = useState(line.hidden);
  const [busy, setBusy] = useState(false);
  const shown = line.correctedText ?? line.originalText;
  const name = kind === 'character' && person?.characterName ? person.characterName : (person?.playerName || line.originalName);
  return (
    <div className="border-b border-border py-3 last:border-0">
      <div className="flex items-center flex-wrap gap-2 text-xs mb-1">
        <span className="font-mono text-muted">{clock(line.elapsedMs)}</span>
        <strong className="text-ink">{name}</strong>
        <span className="text-faint">{TYPES.find(x => x[0] === line.speechKind)?.[1] || '未分類'}</span>
        {line.correctedText !== null && <span className="text-primary">修正済</span>}
        {line.hidden && <span className="text-error">非表示</span>}
        <button className="ml-auto text-primary hover:underline" onClick={() => setEditing(x => !x)}>{editing ? '閉じる' : '修正'}</button>
        <button className="text-muted hover:underline" onClick={() => onStartScene(line.elapsedMs)}>ここからシーン</button>
      </div>
      <p className={'text-sm whitespace-pre-wrap break-words ' + (line.hidden ? 'text-faint line-through' : 'text-ink')}>{shown}</p>
      {editing && (
        <div className="mt-3 space-y-2 bg-surface-2 rounded-md p-3">
          <p className="text-xs text-muted">原文（変更されません）</p>
          <p className="text-xs text-muted whitespace-pre-wrap break-words">{line.originalText}</p>
          <textarea aria-label="文字起こし修正" rows={3} className={input} value={corrected} onChange={e => setCorrected(e.target.value)} />
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="発言種別" className={input + ' !w-auto'} value={kind} onChange={e => setKind(e.target.value)}>
              {TYPES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <label className="text-xs flex items-center gap-1.5"><input type="checkbox" checked={hidden} onChange={e => setHidden(e.target.checked)} />リプレイから除外</label>
            <button className={primary} disabled={busy} onClick={async () => {
              setBusy(true); try { await onSave(line.id, { correctedText: corrected === line.originalText ? null : corrected, speechKind: kind, hidden }); setEditing(false); }
              finally { setBusy(false); }
            }}>修正を保存</button>
            <button className={secondary} disabled={busy} onClick={async () => {
              setBusy(true); try { await onSave(line.id, { correctedText: null, speechKind: 'unknown', hidden: false }); setCorrected(line.originalText); setKind('unknown'); setHidden(false); setEditing(false); }
              finally { setBusy(false); }
            }}>原文に戻す</button>
          </div>
        </div>
      )}
    </div>
  );
}

function SessionPicker() {
  const { guildId } = useGuild();
  const [meetings, setMeetings] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    if (!guildId) { setMeetings([]); return; }
    api.meetings(guildId).then(rows => { if (alive) setMeetings(rows || []); })
      .catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [guildId]);
  return (
    <Page><PageHead title="TRPG Replay Studio" subtitle="録音したセッションからリプレイ編集を開始します。" />
      {error && <p className="text-error">{error}</p>}
      {!guildId && <p className="text-muted">Discordサーバーを選択してください。</p>}
      {guildId && meetings.length === 0 && <p className="text-muted">まだ録音済みのセッションがありません。</p>}
      <div className="grid md:grid-cols-2 gap-3">
        {meetings.map(m => (
          <Link key={m.id} to={'/replays/' + m.id} className="card card-hover no-underline p-5">
            <h2 className="text-base font-bold text-ink">{m.channel_name || 'Session'} · #{m.id}</h2>
            <p className="text-xs text-muted mt-1">{m.started_at} · {m.utterance_count}発言</p>
            <p className="text-sm text-primary mt-3">リプレイを編集</p>
          </Link>
        ))}
      </div>
    </Page>
  );
}

function ReplayWorkspace({ id }) {
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [settings, setSettings] = useState({ title: '', systemName: '', style: 'hybrid', glossary: '' });
  const [sceneTitle, setSceneTitle] = useState('');
  const [sceneTime, setSceneTime] = useState('00:00:00');
  const [draft, setDraft] = useState('');
  const [refreshPage, setRefreshPage] = useState(0);

  const reload = useCallback(async (preserveScene = true) => {
    const d = await api.replayOverview(id);
    setData(d);
    setSettings({ title: d.project.title, systemName: d.project.system_name, style: d.project.style, glossary: d.project.glossary });
    setSelected(prev => preserveScene && d.scenes.some(s => s.id === prev) ? prev : d.scenes[0]?.id);
    setLoading(false);
    return d;
  }, [id]);
  useEffect(() => {
    let alive = true;
    setLoading(true); setSelected(null); setPage({ rows: [], total: 0 }); setError('');
    api.replayOverview(id).then(d => {
      if (!alive) return;
      setData(d); setSettings({ title: d.project.title, systemName: d.project.system_name, style: d.project.style, glossary: d.project.glossary });
      setSelected(d.scenes[0]?.id); setLoading(false);
    }).catch(e => { if (alive) { setError(e.message); setLoading(false); } });
    return () => { alive = false; };
  }, [id]);
  useEffect(() => {
    let alive = true;
    if (!selected) return;
    api.replayLines(id, { sceneId: selected, offset, limit: 80 }).then(p => { if (alive) setPage(p); })
      .catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [id, selected, offset, refreshPage]);
  const scene = data?.scenes.find(s => s.id === selected);
  useEffect(() => { setDraft(scene?.draft_text || ''); }, [selected, scene?.draft_text]);

  const execute = async (fn, message, refresh = true) => {
    setError(''); setNote(''); setWorking(true);
    try {
      await fn();
      if (refresh) await reload();
      setRefreshPage(x => x + 1);
      setNote(message || '保存しました。');
    } catch (e) { setError(e.message); }
    finally { setWorking(false); }
  };
  const choose = sid => { setSelected(sid); setOffset(0); setError(''); };
  const addScene = (ms = null) => {
    const startMs = ms === null ? parseClock(sceneTime) : ms;
    const title = sceneTitle.trim() || ('シーン ' + clock(startMs));
    return execute(async () => {
      const r = await api.createReplayScene(id, { title, startMs });
      const d = await reload();
      if (d.scenes.some(s => s.id === r.scene.id)) choose(r.scene.id);
      setSceneTitle('');
    }, 'シーンを追加しました。');
  };
  const saveSettings = () => execute(() => api.updateReplayProject(id, { ...settings, revision: data.project.revision }), '設定を保存しました。');
  if (loading) return <Page><p className="text-muted">読み込み中…</p></Page>;
  if (!data) return <Page><p className="text-error">{error || 'セッションが見つかりません。'}</p></Page>;

  return (
    <Page max="1800px">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHead title="Replay Studio" subtitle={'録音 #' + id + ' · ' + data.count.toLocaleString() + ' 発言'} />
        <div className="flex flex-wrap gap-2">
          <a href={api.replayExportUrl(id, 'md', 'draft')} className={primary + ' no-underline'}>原稿を保存 (.md)</a>
          <a href={api.replayExportUrl(id, 'md', 'script')} className={secondary + ' no-underline'}>会話ログ (.md)</a>
          <a href={api.replayExportUrl(id, 'json', 'draft')} className={secondary + ' no-underline'}>編集データ (.json)</a>
          <Link to={'/meetings/' + id} className={secondary + ' no-underline'}>元の議事録</Link>
        </div>
      </div>
      {data.meeting.transcription_complete === 0 && (
        <p className="card p-3 border-l-2 text-sm text-ink mb-4" style={{ borderColor: 'var(--warn)' }}>
          このセッションの文字起こしには欠落があります。原音声との照合が必要です。
        </p>
      )}
      {error && <p role="alert" className="card p-3 text-sm text-error mb-3">{error}</p>}
      {note && <p role="status" className="text-xs text-primary mb-3">{note}</p>}

      <details className="card p-4 mb-4">
        <summary className="cursor-pointer text-sm font-bold text-ink">アクト設定・発言者とキャストの対応</summary>
        <div className="grid md:grid-cols-4 gap-3 mt-4">
          <label className="text-xs text-muted">アクトタイトル<input value={settings.title} onChange={e => setSettings(s => ({ ...s, title: e.target.value }))} className={input + ' mt-1'} /></label>
          <label className="text-xs text-muted">TRPGシステム<input value={settings.systemName} onChange={e => setSettings(s => ({ ...s, systemName: e.target.value }))} placeholder="トーキョーN◎VA" className={input + ' mt-1'} /></label>
          <label className="text-xs text-muted">リプレイの形式
            <select value={settings.style} onChange={e => setSettings(s => ({ ...s, style: e.target.value }))} className={input + ' mt-1'}>
              <option value="dialogue">会話再現</option><option value="hybrid">ハイブリッド</option><option value="novel">小説調</option>
            </select>
          </label>
          <div className="flex items-end"><button className={primary} disabled={working} onClick={saveSettings}>アクト設定を保存</button></div>
        </div>
        <label className="block text-xs text-muted mt-3">専門用語辞書（表記の参考。1行1項目）
          <textarea rows={3} className={input + ' mt-1'} value={settings.glossary} onChange={e => setSettings(s => ({ ...s, glossary: e.target.value }))} placeholder="神業、スタイル、キャスト名など" />
        </label>
        <h3 className="text-sm font-bold mt-4 mb-2">参加者</h3>
        <div className="grid md:grid-cols-2 gap-2">
          {data.speakers.map(p => <SpeakerEditor key={p.userId} person={p} onSave={(uid, value) => execute(() => api.saveReplaySpeaker(id, uid, value), '参加者を保存しました。')} />)}
        </div>
      </details>

      <div className="grid grid-cols-1 xl:grid-cols-[225px_minmax(0,1fr)_minmax(320px,0.9fr)] gap-4 items-start">
        <aside className="card p-4">
          <h2 className="text-sm font-bold text-ink mb-3">シーン</h2>
          <div className="space-y-1">
            {data.scenes.map(s => (
              <button key={s.id} onClick={() => choose(s.id)}
                className={'text-left w-full rounded-md px-3 py-2 text-sm ' + (selected === s.id ? 'bg-surface-3 text-ink font-bold' : 'text-muted hover:bg-surface-2')}>
                <span className="block font-mono text-[11px] text-faint">{clock(s.start_ms)}</span>{s.title}
                {!!s.draft_text && <span className="block text-[11px] text-primary">原稿あり</span>}
              </button>
            ))}
          </div>
          <div className="border-t border-border pt-3 mt-3 space-y-2">
            <input className={input} aria-label="シーン開始時刻" value={sceneTime} onChange={e => setSceneTime(e.target.value)} placeholder="HH:MM:SS" />
            <input className={input} aria-label="新しいシーン名" value={sceneTitle} onChange={e => setSceneTitle(e.target.value)} placeholder="新しいシーン名" />
            <button className={primary} disabled={working} onClick={() => { try { addScene(); } catch (e) { setError(e.message); } }}>シーン追加</button>
          </div>
        </aside>

        <section className="card p-4 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 className="text-sm font-bold">文字起こし・原文照合</h2>
            <span className="text-xs text-muted">{page.total.toLocaleString()}発言</span>
          </div>
          <p className="text-xs text-muted mb-3">修正は原文と別に保存されます。発言種別・除外も個別に編集できます。</p>
          {page.rows.map(line => <TranscriptLine key={line.id} line={line}
            person={data.speakers.find(s => s.userId === line.userId)}
            onSave={(uid, changes) => execute(() => api.saveReplayLine(id, uid, changes), '発言を保存しました。')}
            onStartScene={ms => { addScene(ms); }} />)}
          {page.rows.length === 0 && <p className="text-xs text-muted py-5">このシーンに発言はありません。</p>}
          <div className="flex items-center gap-2 justify-between mt-3">
            <button className={secondary} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 80))}>前の80件</button>
            <span className="text-xs text-muted">{Math.min(offset + 1, page.total)}–{Math.min(offset + 80, page.total)} / {page.total}</span>
            <button className={secondary} disabled={offset + 80 >= page.total} onClick={() => setOffset(offset + 80)}>次の80件</button>
          </div>
        </section>

        <section className="card p-4 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-sm font-bold">シーン原稿</h2>
            {scene?.start_ms !== 0 && <button className="text-xs text-error hover:underline" disabled={working} onClick={() => {
              if (window.confirm('このシーン区切りと原稿を削除しますか？')) execute(async () => { await api.deleteReplayScene(id, scene.id); choose(data.scenes[0].id); }, 'シーンを削除しました。');
            }}>シーン削除</button>}
          </div>
          <label className="text-xs text-muted">シーン名
            <input className={input + ' mt-1'} value={sceneTitle || scene?.title || ''} onChange={e => setSceneTitle(e.target.value)} />
          </label>
          <button className={secondary + ' my-2'} disabled={working} onClick={() => execute(() => api.saveReplayScene(id, scene.id, { title: sceneTitle || scene.title }), 'シーン名を保存しました。')}>シーン名保存</button>
          <textarea className={input + ' font-mono text-sm'} aria-label="編集可能なリプレイ原稿" rows={20}
            value={draft} onChange={e => setDraft(e.target.value)} placeholder="ここに文章を直接編集できます。AI生成を使わなくても書き出せます。" />
          <div className="flex flex-wrap gap-2 mt-3">
            <button className={primary} disabled={working} onClick={() => execute(() => api.saveReplayScene(id, scene.id, { draftText: draft }), '原稿を保存しました。')}>原稿を保存</button>
            <button className={secondary} disabled={working} onClick={() => {
              if (draft.trim() && !window.confirm('現在のシーン原稿をAI生成結果で上書きしますか？')) return;
              execute(() => api.generateReplayScene(id, scene.id, { overwrite: true }), 'AIによるシーン原稿を保存しました。');
            }}><Icon.Sparkle width={14} height={14} />{working ? '処理中…' : 'AIで原稿生成'}</button>
          </div>
          <p className="text-xs text-muted mt-3">AI生成は設定済みの文章生成プロバイダーを使用します。長いシーンは分割が必要です。生成後は原音声と照合してください。</p>
        </section>
      </div>
    </Page>
  );
}

export default function ReplayStudio() {
  const { id } = useParams();
  return id ? <ReplayWorkspace key={id} id={id} /> : <SessionPicker />;
}
