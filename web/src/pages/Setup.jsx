import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useGuild } from '../GuildContext.jsx';
import { useSystem } from '../SystemContext.jsx';
import { Page, PageHead } from '../components/Page.jsx';
import { Icon, Empty } from '../components/ui.jsx';
import { ModelPicker } from '../components/ModelPicker.jsx';
import { ConnectionForm, BotStatusBadge } from '../components/Connection.jsx';

const WHISPER = ['tiny', 'base', 'small', 'medium', 'large-v3', 'large-v3-turbo'];
const LANGS = [['auto', '自動検出'], ['en', '英語'], ['de', 'ドイツ語'], ['es', 'スペイン語'], ['fr', 'フランス語'],
  ['it', 'イタリア語'], ['pt', 'ポルトガル語'], ['nl', 'オランダ語'], ['ru', 'ロシア語'], ['ja', '日本語'], ['zh', '中国語']];
const SUMMARY_LANGS = [['match', '文字起こしと同じ言語'], ...LANGS.filter(([c]) => c !== 'auto')];

// Model defaults come from the server (adapters/summarizer/models.js) so the
// dashboard, /setup and the adapters can't drift apart.
// Providers whose key is editable from the UI (Ollama is keyless/local).
const KEYED = {
  gemini: 'GEMINI_API_KEY', openai: 'OPENAI_API_KEY', opencode: 'OPENCODE_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};
const KEY_HELP = {
  gemini: 'aistudio.google.com/apikey',
  openai: 'platform.openai.com/api-keys',
  opencode: 'opencode.ai/zen',
  openrouter: 'openrouter.ai/keys',
};
// Which env secret each STT provider needs (sidecar is keyless/local).
const STT_KEY = { openai: 'openai' };
const STT_HELP = {
  sidecar: 'PC上のfaster-whisperで文字起こしします。API料金はかかりません。WindowsのZIP版ではPython 3.11を入れ、Setup-Local-Whisper.batを実行してください。Docker版ではコンテナで動作します。',
  openai: 'OpenAIのAPIキーを使って文字起こしします。この項目を選んで利用すると、使用量に応じて料金がかかります。',
};
// The provider's model catalog, fetched live (and re-fetchable with refresh,
// which bypasses the server's cache). `seq` drops responses that land after the
// provider already changed.
function useCatalog(provider) {
  const [state, setState] = useState({ catalog: null, loading: !!provider });
  const seq = useRef(0);
  const load = useCallback((refresh) => {
    const mine = ++seq.current;
    if (!provider) { setState({ catalog: null, loading: false }); return; }
    setState((s) => ({ ...s, loading: true }));
    api.providerModels(provider, refresh)
      .then((catalog) => { if (seq.current === mine) setState({ catalog, loading: false }); })
      .catch(() => { if (seq.current === mine) setState({ catalog: null, loading: false }); });
  }, [provider]);
  useEffect(() => { load(false); }, [load]);
  return { catalog: state.catalog, loading: state.loading, reload: () => load(true) };
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-ink mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted mt-1.5">{hint}</p>}
    </div>
  );
}

function Card({ title, desc, children }) {
  return (
    <section className="card p-5">
      <div className="mb-4">
        <h2 className="text-sm font-bold text-ink">{title}</h2>
        {desc && <p className="text-xs text-muted mt-0.5">{desc}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

// value is the server's own prompt, or null when it uses the built-in default.
function PromptEditor({ value, defaultValue, onSave }) {
  const current = value ?? defaultValue;
  const [draft, setDraft] = useState(current);
  const [busy, setBusy] = useState(false);
  const changed = draft !== current;
  useEffect(() => { setDraft(current); }, [current]);

  async function savePrompt(next) {
    setBusy(true);
    const ok = await onSave({ summaryPrompt: next });
    if (ok) setDraft(next ?? defaultValue);
    setBusy(false);
  }

  return (
    <Field label="要約の指示文" hint="AIに録音情報と文字起こしを渡す前に送る指示です。ノートやタスクを表示するには、指定のJSON形式を維持してください。">
      <textarea className="input min-h-64 font-mono text-xs resize-y" aria-label="要約の指示文"
        value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={20000} />
      <div className="flex flex-wrap gap-2 mt-2">
        <button type="button" className="btn btn-primary" disabled={busy || !changed || !draft.trim()}
          onClick={() => savePrompt(draft.trim())}>指示文を保存</button>
        <button type="button" className="btn btn-ghost" disabled={busy || value == null}
          onClick={() => savePrompt(null)}>初期設定に戻す</button>
        {changed && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setDraft(current)}>変更を破棄</button>}
      </div>
    </Field>
  );
}

function HotwordEditor({ value, onSave }) {
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setDraft(value); }, [value]);

  return (
    <Field label="認識のヒント" hint="地名・キャスト名・TRPG用語などを1行に1語入力します。空欄で保存すると解除できます。">
      <textarea aria-label="認識のヒント" className="input resize-y" rows={4} maxLength={300}
        value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={'新星市\n神業'} />
      <button type="button" className="btn btn-primary mt-2" disabled={busy || draft === value}
        onClick={async () => {
          setBusy(true);
          try { await onSave({ sttHotwords: draft }); } finally { setBusy(false); }
        }}>認識のヒントを保存</button>
    </Field>
  );
}

function Switch({ checked, onChange, label, desc }) {
  return (
    <label className="flex items-start justify-between gap-4 cursor-pointer select-none">
      <span>
        <span className="block text-[13px] font-medium text-ink">{label}</span>
        {desc && <span className="block text-xs text-muted mt-0.5">{desc}</span>}
      </span>
      <span className="relative shrink-0 mt-0.5">
        <input type="checkbox" checked={checked} onChange={onChange} className="peer sr-only" />
        <span className="block h-6 w-10 rounded-full bg-surface-3 peer-checked:bg-primary transition-colors" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
      </span>
    </label>
  );
}

function Chevron() {
  return <Icon.Chevron width={14} height={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-muted" />;
}

/* ── API key editor ───────────────────────────────────────────────────────
   Shows a "set / not set" badge; lets the user paste a new key (saved to .env,
   applied live) or clear it. The value is never read back from the server. */
function KeyEditor({ provider, present, onChanged, autoEdit = false }) {
  const envVar = KEYED[provider];
  const [editing, setEditing] = useState(autoEdit && !present);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [err, setErr] = useState(null);

  async function save() {
    setBusy(true); setErr(null);
    try { await api.setProviderKey(provider, value.trim()); setValue(''); setEditing(false); onChanged?.(); }
    catch (e) { setErr(e?.message || 'APIキーを保存できませんでした'); }
    finally { setBusy(false); }
  }
  async function clear() {
    if (!window.confirm(`${provider}のAPIキーを削除しますか？`)) return;
    setBusy(true); setErr(null);
    try { await api.setProviderKey(provider, ''); setValue(''); setEditing(false); onChanged?.(); }
    catch (e) { setErr(e?.message || 'APIキーを削除できませんでした'); }
    finally { setBusy(false); }
  }

  return (
    <Field label="APIキー" hint={err ? undefined : <><code className="text-ink-2">.env</code>に<code className="text-ink-2">{envVar}</code>として保存します。取得先 {KEY_HELP[provider]}</>}>
      {!editing ? (
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 text-[13px] font-medium px-2.5 py-1.5 rounded-sm ${present ? 'text-accent bg-accent-soft' : 'text-warn bg-warn-soft'}`}>
            <span style={{ width: 6, height: 6, borderRadius: 6, background: 'currentColor' }} />
            {present ? '登録済み' : '未登録'}
          </span>
          <button onClick={() => setEditing(true)} className="btn btn-ghost !py-1.5">{present ? '変更' : 'APIキーを登録'}</button>
          {present && <button onClick={clear} disabled={busy} className="btn btn-ghost !py-1.5 !text-error">削除</button>}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type={reveal ? 'text' : 'password'} value={value} autoFocus
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setEditing(false); setValue(''); } }}
              placeholder={`貼り付け：${provider} APIキー…`} className="input !pr-10" />
            <button type="button" onClick={() => setReveal((r) => !r)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink text-xs">{reveal ? '非表示' : '表示'}</button>
          </div>
          <button onClick={save} disabled={!value.trim() || busy} className="btn btn-primary !py-2">{busy ? '保存中…' : '保存'}</button>
          <button onClick={() => { setEditing(false); setValue(''); }} disabled={busy} className="btn btn-ghost !py-2">キャンセル</button>
        </div>
      )}
      {err && <p className="text-xs text-error mt-1.5">{err}</p>}
    </Field>
  );
}

/* ── Local sidecar status + on/off control ─────────────────────────────────
   The sidecar is the local faster-whisper process. It's a single global backend
   (not per-guild), so this lives off `sys.sidecar` from /system/status. Shows a
   live state pill and a Start/Stop button; hidden entirely when the sidecar is
   unmanaged here (e.g. running as its own Docker container). */
function SidecarControl({ sys, onChanged }) {
  const sc = sys?.sidecar;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  if (!sc) return null; // standalone web server with no controller attached

  const map = {
    running: { label: '動作中', color: 'var(--accent)', bg: 'var(--accent-soft)' },
    starting: { label: '起動中…', color: 'var(--warn)', bg: 'var(--warn-soft)' },
    error: { label: '停止中', color: 'var(--error)', bg: 'var(--error-soft)' },
    stopped: { label: '停止中', color: 'var(--muted)', bg: 'var(--surface-3)' },
  };
  const s = map[sc.state] || map.stopped;
  const running = sc.state === 'running';

  async function act(action) {
    setBusy(true); setErr(null);
    try { await api.sidecarAction(action); await onChanged?.(); }
    catch (e) { setErr(e?.message || `Failed to ${action} sidecar`); }
    finally { setBusy(false); }
  }

  if (!sc.managed) {
    return (
      <div className="rounded-md bg-surface-2 px-3.5 py-3 text-xs text-muted">
        ローカルのWhisperは別のプロセスで動作しています
        {sc.url ? <> (<code className="text-ink-2">{sc.url}</code>)</> : null}. Docker版では別のコンテナで動作し、
        起動・停止には <code className="text-ink-2">docker compose</code>を使います。
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-medium text-ink">ローカル文字起こし</span>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full" style={{ color: s.color, background: s.bg }}>
            <span style={{ width: 6, height: 6, borderRadius: 6, background: s.color }} />
            {s.label}{sc.external ? ' · 外部で管理' : ''}
          </span>
          {running && sc.device && <DeviceBadge device={sc.device} model={sc.model} batchSize={sc.batchSize} />}
        </div>
        <div className="flex items-center gap-2">
          {running
            ? <button onClick={() => act('stop')} disabled={busy} className="btn btn-ghost !py-1.5">{busy ? '…' : '停止'}</button>
            : <button onClick={() => act('start')} disabled={busy} className="btn btn-primary !py-1.5">{busy ? '起動中…' : '文字起こし機能を起動'}</button>}
          {running && <button onClick={() => act('restart')} disabled={busy} className="btn btn-ghost !py-1.5">再起動</button>}
        </div>
      </div>
      <p className="text-xs text-muted mt-2">
        {running
          ? 'このPCで文字起こししています。クラウドAPIを使う場合は、停止するとCPUとメモリの消費を抑えられます。'
          : '停止中です。このPCで文字起こしするには起動してください。'}
      </p>
      {running && sc.device === 'cpu' && (
        <p className="text-xs mt-2 rounded-sm px-2.5 py-2" style={{ color: 'var(--warn)', background: 'var(--warn-soft)' }}>
          ⚠ <b>CPU</b>で文字起こししています。長時間の録音では処理に時間がかかります。
          NVIDIA GPUを使うためのCUDAの設定は、
          READMEのGPUの項目を参照してください。
        </p>
      )}
      {(err || sc.error) && <p className="text-xs text-error mt-1.5">{err || sc.error}</p>}
    </div>
  );
}

// Small pill showing the STT compute backend + model + batch size, so users can
// see at a glance whether transcription is GPU-accelerated (fast) or on the CPU
// fallback (slow). Green for cuda, muted/amber for cpu.
function DeviceBadge({ device, model, batchSize }) {
  const gpu = device === 'cuda';
  const color = gpu ? 'var(--accent)' : 'var(--warn)';
  const bg = gpu ? 'var(--accent-soft)' : 'var(--warn-soft)';
  const label = gpu ? 'GPU' : device === 'cpu' ? 'CPU' : device;
  const detail = [model, batchSize ? `batch ${batchSize}` : null].filter(Boolean).join(' · ');
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full"
      style={{ color, background: bg }} title={`文字起こし稼働中 ${device}${detail ? ` (${detail})` : ''}`}>
      {label}{detail ? <span className="opacity-70">· {detail}</span> : null}
    </span>
  );
}

/* ── Connection card (server-wide Discord + STT settings) ────────────────── */
function ConnectionCard({ sys, onChanged }) {
  const [open, setOpen] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const bot = sys?.bot;
  const conn = sys?.connection;
  if (!sys?.managed) {
    return (
      <Card title="Discordとの接続" desc="Discord Botの接続設定です。">
        <p className="text-sm text-muted">
          This dashboard is running in read-only mode (no bot process attached), so the Discord
          connection is managed elsewhere. Start Parley with <code className="text-ink-2">npm start</code> to
          edit it here.
        </p>
        {bot && <div className="mt-2"><BotStatusBadge bot={bot} /></div>}
      </Card>
    );
  }
  async function restart() {
    setRestarting(true);
    try { await api.botAction('restart'); await onChanged?.(); }
    finally { setRestarting(false); }
  }
  return (
    <Card title="Discordとの接続" desc="Discord Botの接続設定です。保存すると再接続します。">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {bot && <BotStatusBadge bot={bot} />}
          {bot?.guildCount > 0 && <span className="text-xs text-muted">{bot.guildCount} server{bot.guildCount === 1 ? '' : 's'}</span>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={restart} disabled={restarting} className="btn btn-ghost !py-1.5">{restarting ? '再接続中…' : '再接続'}</button>
          <button onClick={() => setOpen((o) => !o)} className="btn btn-ghost !py-1.5">{open ? '閉じる' : '接続情報を編集'}</button>
        </div>
      </div>
      {bot?.state === 'error' && bot?.error && <p className="text-xs text-error mt-2">{(bot.error === 'An invalid token was provided.' ? 'Botトークンが無効です。接続情報を編集し、DiscordのBotトークンを確認してください。' : bot.error)}</p>}
      {open && (
        <div className="mt-4 pt-4 border-t border-border">
          <ConnectionForm conn={conn} submitLabel="保存して再接続" onSaved={async () => { setOpen(false); await onChanged?.(); }} />
        </div>
      )}
    </Card>
  );
}

export default function Setup() {
  const { guildId } = useGuild();
  const { status: sys, refresh: refreshSys } = useSystem();
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState('');
  const [msgErr, setMsgErr] = useState(false);
  // "Draft" providers: when you pick a cloud provider that has no API key yet,
  // we stage the choice (reveal its key field) WITHOUT saving — saving would be
  // rejected server-side ("key not set"). Once the key is added we auto-commit.
  const [sumDraft, setSumDraft] = useState(null);
  const [sttDraft, setSttDraft] = useState(null);

  function reload() { if (guildId) api.config(guildId).then(setData).catch(() => setData(null)); }
  useEffect(() => { reload(); }, [guildId]);

  // One catalog per model field: the primary provider's and the fallback's.
  const models = useCatalog(data?.config?.summarizerProvider);
  const fbModels = useCatalog(data?.config?.summarizerFallbackProvider);

  if (!guildId) return (
    <Page max="720px">
      <PageHead title="設定" subtitle="Discordとの接続とサーバーごとの設定を管理します。" />
      <ConnectionCard sys={sys} onChanged={refreshSys} />
      <div className="mt-5"><Empty icon={Icon.Settings} title="サーバーが選択されていません" body="画面上部でサーバーを選ぶと、要約や文字起こし、投稿先を設定できます。" /></div>
    </Page>
  );
  if (!data) return (
    <Page max="720px">
      <div className="h-8 w-32 skeleton mb-7" />
      <div className="space-y-5">{[0,1,2].map(i => <div key={i} className="h-44 skeleton rounded-[14px]" />)}</div>
    </Page>
  );

  const { config: c, providers, sttProviders, channels, secrets = {}, defaultModels = {}, defaultSummaryPrompt } = data;
  const save = async (patch) => {
    try {
      const r = await api.saveConfig(guildId, patch);
      setData((d) => ({ ...d, config: r.config }));
      setMsg('保存しました'); setMsgErr(false);
      // Switching the transcription backend may have auto-started/stopped the
      // local sidecar; refresh system status so its pill reflects reality.
      if (patch.sttProvider !== undefined) refreshSys?.();
      return true;
    } catch (e) { setMsg(e.message); setMsgErr(true); return false; }
    finally { setTimeout(() => setMsg(''), 2400); }
  };
  const sel = 'input appearance-none pr-9 cursor-pointer';

  // ── Summarizer provider, with draft-before-key handling ───────────────────
  const sumProvider = sumDraft || c.summarizerProvider;        // shown in the <select>
  const sumReady = (providers.find((p) => p.provider === sumProvider) || {}).ok;
  const sumKeyed = Object.prototype.hasOwnProperty.call(KEYED, sumProvider);
  function pickSummarizer(p) {
    const ready = (providers.find((x) => x.provider === p) || {}).ok;
    if (!ready && Object.prototype.hasOwnProperty.call(KEYED, p)) {
      setSumDraft(p);              // stage it; reveal the key field, don't save yet
      setMsg(''); 
    } else {
      setSumDraft(null);
      save({ provider: p, model: defaultModels[p] || '' });
    }
  }
  // After a key lands for the staged provider, commit the switch.
  async function commitSumKey() {
    await reload();
    if (sumDraft) { await save({ provider: sumDraft, model: defaultModels[sumDraft] || '' }); setSumDraft(null); }
  }

  // ── Transcription provider, same pattern ──────────────────────────────────
  const sttProvider = sttDraft || c.sttProvider;
  const sttReady = (sttProviders || []).find((p) => p.provider === sttProvider)?.ok;
  const sttKeyed = Object.prototype.hasOwnProperty.call(STT_KEY, sttProvider);
  const sttModels = (sttProviders || []).find((p) => p.provider === sttProvider)?.models || [];
  function pickStt(p) {
    const sp = (sttProviders || []).find((x) => x.provider === p);
    if (!sp?.ok && Object.prototype.hasOwnProperty.call(STT_KEY, p)) {
      setSttDraft(p);              // stage it; reveal the key field, don't save yet
      setMsg('');
    } else {
      setSttDraft(null);
      save({ sttProvider: p, sttModel: p === 'sidecar' ? null : (sp?.models?.[0] ?? null) });
    }
  }
  async function commitSttKey() {
    await reload(); refreshSys?.();
    if (sttDraft) {
      const sp = (sttProviders || []).find((x) => x.provider === sttDraft);
      await save({ sttProvider: sttDraft, sttModel: sp?.models?.[0] ?? null });
      setSttDraft(null);
    }
  }

  return (
    <Page max="720px">
      <PageHead
        title="設定"
        subtitle="サーバーごとの設定です。保存するとすぐに反映されます。"
        actions={msg && <span className={`text-sm font-medium ${msgErr ? 'text-error' : 'text-accent'}`}>{msg}</span>}
      />

      <div className="space-y-5">
        <ConnectionCard sys={sys} onChanged={refreshSys} />
        <Card title="要約" desc="文字起こしからノートを作るAIを選びます。">
          <Field label="提供元" hint={sumDraft ? 'この提供元を使うには、下にAPIキーを登録してください。' : undefined}>
            <div className="relative">
              <select className={sel} value={sumProvider}
                onChange={(e) => pickSummarizer(e.target.value)}>
                {providers.map((p) => (
                  <option key={p.provider} value={p.provider}>
                    {p.provider}{p.ok ? '' : ' (no key set)'}
                  </option>
                ))}
              </select>
              <Chevron />
            </div>
          </Field>

          {sumKeyed && <KeyEditor provider={sumProvider} present={!!secrets[sumProvider]} onChanged={commitSumKey} autoEdit={!!sumDraft} />}

          {!sumDraft && (
          <Field label="モデル" hint="入力するとモデルを検索できます。モデルIDを直接入力してEnterで確定することもできます。">
            <ModelPicker value={c.summarizerModel} catalog={models.catalog} loading={models.loading}
              onRefresh={models.reload}
              onPick={(id) => save({ provider: c.summarizerProvider, model: id })} />
          </Field>
          )}

          {/* Only providers with a working key are offered: validateSetup rejects
              a keyless fallback server-side, so listing them would just error. */}
          {!sumDraft && (
          <Field label="予備の提供元" hint="利用上限や障害などで通常の提供元が使えない場合に使います。使わない場合は「なし」を選びます。">
            <div className="relative">
              <select className={sel} value={c.summarizerFallbackProvider || 'none'}
                onChange={(e) => save({ fallbackProvider: e.target.value })}>
                <option value="none">none</option>
                {providers.filter((p) => p.ok && p.provider !== c.summarizerProvider).map((p) => (
                  <option key={p.provider} value={p.provider}>{p.provider}</option>
                ))}
              </select>
              <Chevron />
            </div>
            {c.summarizerFallbackProvider && (
              <div className="mt-2">
                <ModelPicker value={c.summarizerFallbackModel} catalog={fbModels.catalog} loading={fbModels.loading}
                  onRefresh={fbModels.reload}
                  onPick={(id) => save({ fallbackModel: id })} />
              </div>
            )}
          </Field>
          )}
          <PromptEditor key={guildId} value={c.summaryPrompt} defaultValue={defaultSummaryPrompt} onSave={save} />
        </Card>

        <Card title="文字起こし" desc="音声を文字に変換する方法を選びます。">
          <Field label="提供元" hint={sttDraft ? 'この提供元を使うには、下にAPIキーを登録してください。' : (STT_HELP[sttProvider] || '')}>
            <div className="relative">
              <select className={sel} value={sttProvider}
                onChange={(e) => pickStt(e.target.value)}>
                {(sttProviders || []).map((p) => (
                  <option key={p.provider} value={p.provider}>
                    {p.label || p.provider}{p.ok ? '' : ' (no key set)'}
                  </option>
                ))}
              </select>
              <Chevron />
            </div>
          </Field>

          {sttKeyed && (
            <KeyEditor provider={STT_KEY[sttProvider]} present={!!secrets[STT_KEY[sttProvider]]} onChanged={commitSttKey} autoEdit={!!sttDraft} />
          )}

          {sttDraft ? null : c.sttProvider === 'sidecar' ? (
            <>
              <HotwordEditor key={guildId} value={c.sttHotwords ?? ''} onSave={save} />
              <Field label="Whisperモデル" hint="大きいモデルほど認識精度が上がりますが、CPUでの処理に時間がかかります。">
                <div className="relative">
                  <select className={sel} value={c.whisperModel} onChange={(e) => save({ whisperModel: e.target.value })}>
                    {WHISPER.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <Chevron />
                </div>
              </Field>
              <SidecarControl sys={sys} onChanged={refreshSys} />
            </>
          ) : (
            <>
              <Field label="モデル" hint="クラウドで文字起こしに使うモデルです。">
                <div className="relative">
                  <select className={sel} value={c.sttModel || (sttModels[0] ?? '')} onChange={(e) => save({ sttModel: e.target.value })}>
                    {sttModels.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <Chevron />
                </div>
              </Field>
              {sys?.sidecar?.managed && sys?.sidecar?.running && (
                <SidecarControl sys={sys} onChanged={refreshSys} />
              )}
            </>
          )}

          <Field label="録音の言語">
            <div className="relative">
              <select className={sel} value={c.language} onChange={(e) => save({ language: e.target.value })}>
                {LANGS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
              </select>
              <Chevron />
            </div>
          </Field>
        </Card>

        <Card title="ノートの投稿" desc="Discordへの投稿先と投稿方法を選びます。">
          <Field label="ノートの投稿先">
            <div className="relative">
              <select className={sel} value={c.notesChannelId || ''} onChange={(e) => save({ notesChannelId: e.target.value || null })}>
                <option value="">(meeting's own channel)</option>
                {channels.map((ch) => <option key={ch.id} value={ch.id}>#{ch.name}</option>)}
              </select>
              <Chevron />
            </div>
          </Field>
          <Field label="要約の言語">
            <div className="relative">
              <select className={sel} value={c.summaryLanguage} onChange={(e) => save({ summary_language: e.target.value })}>
                {SUMMARY_LANGS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
              </select>
              <Chevron />
            </div>
          </Field>
          <Switch checked={c.useThread} onChange={(e) => save({ useThread: e.target.checked })}
            label="ノートをスレッドに投稿" desc="録音ごとにノートをスレッドにまとめます。" />
        </Card>

        <Card title="Botの動作">
          <Switch checked={c.autoJoin} onChange={(e) => save({ autoJoin: e.target.checked })}
            label="ボイスチャンネルに自動参加" desc="ボイスチャンネルに2人以上いるとBotが自動で参加します。" />
        </Card>
      </div>
    </Page>
  );
}
