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

function TranscriptLine({ line, person, meetingId, onSave, onStartScene }) {
  const [editing, setEditing] = useState(false);
  const [corrected, setCorrected] = useState(line.correctedText ?? line.originalText);
  const [kind, setKind] = useState(line.speechKind);
  const [hidden, setHidden] = useState(line.hidden);
  const [busy, setBusy] = useState(false);
  const shown = line.correctedText ?? line.originalText;
  useEffect(() => { setCorrected(shown); setKind(line.speechKind); setHidden(line.hidden); }, [shown, line.speechKind, line.hidden]);
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
          <div className="space-y-1">
            <p className="text-xs text-muted">原音声（録音保存期間内のみ）</p>
            <audio controls preload="none" className="w-full" src={api.replayAudioUrl(meetingId, line.id)}>
              音声を再生できません。
            </audio>
          </div>
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
    <Page><PageHead title="TRPGリプレイ編集" subtitle="録音したセッションからリプレイ編集を開始します。" />
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
  const [bulkProgress, setBulkProgress] = useState(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [settings, setSettings] = useState({ title: '', systemName: '', style: 'hybrid', glossary: '', glossaryPreset: 'auto', engine: 'inherit', localModel: 'qwen2.5:7b', budgetUsd: 0.5, aiProvider: 'gemini', aiModel: 'gemini-2.5-flash' });
  const [quote, setQuote] = useState(null);
  const [glossaries, setGlossaries] = useState([]);
  const [newSceneTitle, setNewSceneTitle] = useState('');
  const [editSceneTitle, setEditSceneTitle] = useState('');
  const [sceneTime, setSceneTime] = useState('00:00:00');
  const [draft, setDraft] = useState('');
  const [refreshPage, setRefreshPage] = useState(0);

  useEffect(() => {
    let active = true;
    api.replayGlossaries().then(d => { if (active) setGlossaries(d.presets || []); })
      .catch(e => { if (active) setError('用語集の取得に失敗しました: ' + e.message); });
    return () => { active = false; };
  }, []);

  const reload = useCallback(async (preserveScene = true) => {
    const d = await api.replayOverview(id);
    setData(d);
    setSettings({ title: d.project.title, systemName: d.project.system_name, style: d.project.style, glossary: d.project.glossary, glossaryPreset: d.project.glossary_preset || 'auto', engine: d.project.engine, localModel: d.project.local_model, budgetUsd: d.project.budget_usd, aiProvider: d.project.ai_provider, aiModel: d.project.ai_model });
    setSelected(prev => preserveScene && d.scenes.some(s => s.id === prev) ? prev : d.scenes[0]?.id);
    setLoading(false);
    return d;
  }, [id]);
  useEffect(() => {
    let alive = true;
    setLoading(true); setSelected(null); setPage({ rows: [], total: 0 }); setError('');
    api.replayOverview(id).then(d => {
      if (!alive) return;
      setData(d); setSettings({ title: d.project.title, systemName: d.project.system_name, style: d.project.style, glossary: d.project.glossary, glossaryPreset: d.project.glossary_preset || 'auto', engine: d.project.engine, localModel: d.project.local_model, budgetUsd: d.project.budget_usd, aiProvider: d.project.ai_provider, aiModel: d.project.ai_model });
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
  useEffect(() => { setDraft(scene?.draft_text || ''); setEditSceneTitle(scene?.title || ''); }, [selected, scene?.draft_text, scene?.title]);

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
    const title = newSceneTitle.trim() || ('シーン ' + clock(startMs));
    return execute(async () => {
      const r = await api.createReplayScene(id, { title, startMs });
      const d = await reload();
      if (d.scenes.some(s => s.id === r.scene.id)) choose(r.scene.id);
      setNewSceneTitle('');
    }, 'シーンを追加しました。');
  };
  const saveSettings = () => execute(async () => {
    await api.updateReplayProject(id, { ...settings, revision: data.project.revision });
    setQuote(null);
  }, '設定を保存しました。');
  const previewCost = async () => {
    setError(''); setNote('');
    try { const x = await api.replayCostPreview(id); setQuote(x); return x; }
    catch (e) { setError(e.message); return null; }
  };

  const generateAll = async () => {
    const ungenerated = data.scenes.filter(s => !s.draft_text?.trim());
    if (!ungenerated.length) { setNote('すべてのシーンに原稿があります。'); return; }
    const estimate = await previewCost();
    if (!estimate) return;
    if (estimate.engine === 'luna' && estimate.reservedPendingUsd > estimate.remainingUsd) {
      setError('設定した予算の見積上限を超えます。必要なシーンだけ生成するか、ローカル生成に切り替えてください。');
      return;
    }
    if (estimate.pending.some(x => x.error)) {
      setError('文字数の上限を超えるシーンがあります。自動分割または手動分割が必要です。');
      return;
    }
    const costInfo = estimate.engine === 'luna'
      ? ('概算USD ' + estimate.estimatedPendingUsd.toFixed(4) + ' / 予約額USD ' + estimate.reservedPendingUsd.toFixed(4))
      : estimate.engine === 'local' ? '外部文章生成API料金0円（ローカル計算）' : estimate.engine === 'custom' ? '指定したAIの料金は提供元によります（料金未計算）' : 'サーバー共通AI設定（料金未計算）';
    if (!window.confirm(ungenerated.length + 'シーンを順番にAI生成します。 ' + costInfo + ' 開始しますか？')) return;
    setError(''); setNote(''); setWorking(true);
    const failures = [];
    let completed = 0;
    setBulkProgress({ completed, total: ungenerated.length });
    for (const s of ungenerated) {
      try { await api.generateReplayScene(id, s.id, { overwrite: false }); }
      catch (err) { failures.push(s.title + ': ' + err.message); }
      completed += 1;
      setBulkProgress({ completed, total: ungenerated.length });
    }
    try { await reload(); setQuote(null); } catch (err) { failures.push('一覧の更新: ' + err.message); }
    setWorking(false); setBulkProgress(null);
    if (failures.length) setError('一部のシーンで生成に失敗しました。保存済みの原稿は残っています。' + '\n' + failures.join('\n'));
    else setNote('全シーンのAI原稿生成が完了しました。');
  };

  if (loading) return <Page><p className="text-muted">読み込み中…</p></Page>;
  if (!data) return <Page><p className="text-error">{error || 'セッションが見つかりません。'}</p></Page>;

  return (
    <Page max="1800px">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHead title="リプレイ編集" subtitle={'録音 #' + id + ' · ' + data.count.toLocaleString() + ' 発言'} />
        <div className="flex flex-wrap gap-2">
          <a href={api.replayExportUrl(id, 'html', 'draft')} className={primary + ' no-underline'}>完成版HTML (.html)</a>
          <a href={api.replayExportUrl(id, 'md', 'draft')} className={secondary + ' no-underline'}>原稿を保存 (.md)</a>
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
        <div className="mt-4 rounded-md border border-border p-4 space-y-3">
          <h3 className="text-sm font-bold text-ink">用語集（すべてのTRPGに対応）</h3>
          <p className="text-xs text-muted">共通用語と各システム専用語をAI原稿生成時に参照します。自動選択はシステム名から判別します。元の音声認識結果は書き換えません。</p>
          <label className="block text-xs text-muted">使用する用語集
            <select aria-label="用語集プリセット" value={settings.glossaryPreset} className={input + ' mt-1'}
              onChange={e => setSettings(s => ({ ...s, glossaryPreset: e.target.value }))}>
              <option value="auto">自動選択（TRPG共通 ＋ システム別）</option>
              <option value="common">TRPG共通のみ</option>
              {glossaries.filter(g => g.id !== 'common').map(g =>
                <option key={g.id} value={g.id}>TRPG共通 ＋ {g.label}</option>)}
              <option value="none">プリセットなし（独自用語のみ）</option>
            </select>
          </label>
          <details className="text-xs text-muted">
            <summary className="cursor-pointer text-primary">収録済みの用語と説明を見る</summary>
            <div className="grid md:grid-cols-2 gap-3 mt-3">
              {glossaries.map(g => <details key={g.id} className="rounded-md border border-border p-3">
                <summary className="cursor-pointer font-semibold text-ink">{g.label}（{g.terms.length}語）</summary>
                <p className="mt-2 text-muted">{g.description}</p>
                <div className="space-y-2 mt-3 max-h-64 overflow-auto">
                  {g.terms.map(t => <p key={t.term}><b className="text-ink">{t.term}</b>（{t.reading}）<span className="block">{t.hint}</span></p>)}
                </div>
              </details>)}
            </div>
          </details>
          <label className="block text-xs text-muted">このアクト固有の用語・登場人物（1行1件）
            <textarea rows={4} className={input + ' mt-1'} value={settings.glossary}
              onChange={e => setSettings(s => ({ ...s, glossary: e.target.value }))}
              placeholder={'正式表記｜読み・別名｜短い説明\n烏丸茉莉｜からすま まつり｜このアクトのキャスト\n紫苑司｜しおんじ｜ハンドル名'} />
          </label>
          <p className="text-xs text-muted">上の「アクト設定を保存」で保存します。用語集はAIへの参考情報です。確定的な誤変換修正は「文字起こし・原文照合」で行ってください。</p>
        </div>

        <div className="mt-4 p-4 rounded-md border border-border bg-surface-2 space-y-2">
          <h3 className="text-sm font-bold text-ink">低価格でリプレイを生成する</h3>
          <p className="text-xs text-muted">音声認識は設定画面でローカル faster-whisper を選べます。ここでは文章生成の方式を選択します。</p>
          <div className="grid md:grid-cols-3 gap-3">
            <label className="text-xs text-muted">文章生成方式
              <select className={input + ' mt-1'} value={settings.engine} onChange={e => setSettings(s => ({ ...s, engine: e.target.value }))}>
                <option value="luna">GPT-6 Luna（低価格API）</option>
                <option value="local">Ollama（ローカル／API料金0円）</option>
                <option value="custom">自分のAI API・モデルを指定</option>
                <option value="inherit">サーバー共通AI設定（料金未計算）</option>
              </select>
            </label>
            <label className="text-xs text-muted">Luna予算（USD）
              <input type="number" min="0" max="100" step="0.01" className={input + ' mt-1'}
                value={settings.budgetUsd} onChange={e => setSettings(s => ({ ...s, budgetUsd: e.target.value }))} />
            </label>
            <label className="text-xs text-muted">Ollamaモデル
              <input className={input + ' mt-1'} value={settings.localModel}
                onChange={e => setSettings(s => ({ ...s, localModel: e.target.value }))} placeholder="qwen2.5:7b" />
            </label>
          </div>
          {settings.engine === 'custom' && <div className="grid md:grid-cols-2 gap-3">
            <label className="text-xs text-muted">使用するAIサービス
              <select value={settings.aiProvider} className={input + ' mt-1'} onChange={e => setSettings(s => ({ ...s, aiProvider: e.target.value }))}>
                <option value="gemini">Google Gemini</option>
                <option value="openai">OpenAI API</option>
                <option value="openrouter">OpenRouter</option>
                <option value="opencode">OpenCode</option>
                <option value="ollama">Ollama（ローカル）</option>
              </select>
            </label>
            <label className="text-xs text-muted">モデルID
              <input className={input + ' mt-1'} value={settings.aiModel}
                onChange={e => setSettings(s => ({ ...s, aiModel: e.target.value }))} placeholder="gemini-2.5-flash" />
            </label>
            <p className="md:col-span-2 text-xs text-muted">APIキーはこの画面に入力せず <Link to="/setup" className="underline text-primary">設定画面</Link> で登録します。各自のキーをPC内に保存し、選択モデルの料金は提供元の請求条件に従います。カスタム設定は費用見積り・予算ガードの対象外です。</p>
          </div>}
          <p className="text-xs text-muted">設定変更は上の「アクト設定を保存」で反映します。LunaはOpenAI APIキー、Ollamaは別途ローカル導入が必要です。予算ガードは推定値に基づくもので、請求額の厳密な上限保証ではありません。</p>
        </div>
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
          <div className="mt-3">
            <button className={secondary} disabled={working} onClick={() => execute(async () => {
              const result = await api.autoSplitReplay(id, 12000);
              setNote(result.created.length + 'シーンの区切りを追加しました。');
            }, '自動分割しました。')}>長いログを自動分割</button>
            <p className="text-xs text-muted mt-1">文字量を基準に区切ります。内容に合わせてシーン名を編集できます。</p>
          </div>
          <div className="mt-3 space-y-1">
            <button className={secondary} disabled={working} onClick={previewCost}>生成料金を見積もる</button>
            {quote && <div className="text-xs text-muted leading-relaxed" role="status">
              <p>生成方式: {quote.engine === 'luna' ? 'GPT-6 Luna' : quote.engine === 'local' ? 'Ollama（API料金0円）' : quote.engine === 'custom' ? '自分のAI：' + quote.model + '（料金未計算）' : '共通設定（料金未計算）'}</p>
              {quote.engine === 'luna' && <>
                <p>使用済み料金の記録: $ {quote.spentUsd.toFixed(4)} / 予算 $ {quote.budgetUsd.toFixed(2)}</p>
                <p>未生成シーンの料金概算: $ {quote.estimatedPendingUsd.toFixed(4)}</p>
                <p>予算ガード用の予約額: $ {quote.reservedPendingUsd.toFixed(4)}</p>
                <p>円換算は1 USD＝160円を参考にしてください。実際の請求額とは異なります。</p>
              </>}
              {quote.pending.some(x => x.error) && <p className="text-error">長すぎるシーンがあります。分割してから生成してください。</p>}
            </div>}
          </div>
          <div className="mt-3">
            <button className={primary} disabled={working} onClick={generateAll}>未生成の全シーンをAI生成</button>
            {bulkProgress && <p role="status" className="text-xs text-muted mt-2">AI処理 {bulkProgress.completed} / {bulkProgress.total} シーン</p>}
          </div>
          <div className="border-t border-border pt-3 mt-3 space-y-2">
            <input className={input} aria-label="シーン開始時刻" value={sceneTime} onChange={e => setSceneTime(e.target.value)} placeholder="HH:MM:SS" />
            <input className={input} aria-label="新しいシーン名" value={newSceneTitle} onChange={e => setNewSceneTitle(e.target.value)} placeholder="新しいシーン名" />
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
            meetingId={id}
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
            <input className={input + ' mt-1'} value={editSceneTitle} onChange={e => setEditSceneTitle(e.target.value)} />
          </label>
          <button className={secondary + ' my-2'} disabled={working} onClick={() => execute(() => api.saveReplayScene(id, scene.id, { title: editSceneTitle }), 'シーン名を保存しました。')}>シーン名保存</button>
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
