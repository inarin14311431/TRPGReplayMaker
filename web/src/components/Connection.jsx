import { useState } from 'react';
import { api } from '../api.js';
import { Icon } from './ui.jsx';
import { discordInviteUrl } from '../lib/discord-invite.js';

/* Shared building blocks for editing the Discord/STT connection. Used by the
   first-run Onboarding screen and the Connection card in Settings. The Discord
   token is write-only (we only ever learn whether one is set). */

function Labeled({ label, hint, children }) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-ink mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted mt-1.5">{hint}</p>}
    </div>
  );
}

/** Secret input: shows a "set / not set" badge until the user chooses to edit. */
function SecretField({ label, hint, present, value, onChange, placeholder }) {
  const [editing, setEditing] = useState(!present);
  const [reveal, setReveal] = useState(false);
  if (!editing) {
    return (
      <Labeled label={label} hint={hint}>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[13px] font-medium px-2.5 py-1.5 rounded-sm text-accent bg-accent-soft">
            <span style={{ width: 6, height: 6, borderRadius: 6, background: 'currentColor' }} />
            Set
          </span>
          <button type="button" onClick={() => setEditing(true)} className="btn btn-ghost !py-1.5">変更</button>
        </div>
      </Labeled>
    );
  }
  return (
    <Labeled label={label} hint={hint}>
      <div className="relative">
        <input
          type={reveal ? 'text' : 'password'} value={value} placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)} className="input !pr-12" autoComplete="off" spellCheck={false} />
        <button type="button" onClick={() => setReveal((r) => !r)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink text-xs">{reveal ? '非表示' : '表示'}</button>
      </div>
      {present && (
        <button type="button" onClick={() => { onChange(''); setEditing(false); }} className="text-xs text-muted hover:text-ink mt-1.5">既存のキーを使う</button>
      )}
    </Labeled>
  );
}

/**
 * Editable Discord token + client id + STT url. `conn` is the system status
 * `connection` object. Calls onSaved(result) after a successful save.
 * `compact` drops the in-card heading (Settings supplies its own).
 */
export function ConnectionForm({ conn, onSaved, submitLabel = '保存して接続' }) {
  const [token, setToken] = useState('');
  const [clientId, setClientId] = useState(conn?.discordClientId?.value || '');
  const [sttUrl, setSttUrl] = useState(conn?.sttUrl?.value || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const tokenPresent = !!conn?.discordToken?.set;
  const inviteUrl = discordInviteUrl(clientId);

  async function submit(e) {
    e?.preventDefault();
    setBusy(true); setErr(null);
    const patch = {};
    if (token.trim()) patch.discordToken = token.trim();
    if (clientId.trim() !== (conn?.discordClientId?.value || '')) patch.discordClientId = clientId.trim();
    if (sttUrl.trim() !== (conn?.sttUrl?.value || '')) patch.sttUrl = sttUrl.trim();
    if (Object.keys(patch).length === 0) { setErr('変更がありません。'); setBusy(false); return; }
    try {
      const r = await api.setConnection(patch);
      setToken('');
      onSaved?.(r);
    } catch (e2) {
      setErr(e2?.message || '保存に失敗しました。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <SecretField
        label="Discord Botのトークン"
        present={tokenPresent}
        value={token}
        onChange={setToken}
        placeholder="Bot Tokenを貼り付け"
        hint={<>Discordの <a className="text-primary hover:underline" href="https://discord.com/developers/applications" target="_blank" rel="noreferrer">Developer Portal</a> → Bot → Reset Token から取得。第三者へ共有しないでください。</>}
      />
      <Labeled label="アプリケーションID" hint="Developer Portal → General Information → Application ID をコピーしてください。">
        <input className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}
          placeholder="例：1234567890123456789" inputMode="numeric" autoComplete="off" />
      </Labeled>
      <div className="rounded-md bg-surface-2 border border-border px-3 py-3 space-y-1">
        {inviteUrl ? (
          <>
            <p className="text-xs text-muted">このアプリIDからBotの招待リンクを自動生成しました。</p>
            <a className="btn btn-ghost !py-2 no-underline inline-flex" href={inviteUrl} target="_blank" rel="noopener noreferrer">
              DiscordサーバーにBotを招待
            </a>
          </>
        ) : (
          <p className="text-xs text-muted">アプリケーションIDを入力すると、Discordへの招待リンクが表示されます。</p>
        )}
      </div>
      <details className="text-xs text-muted">
        <summary className="cursor-pointer">詳細設定：文字起こしサーバーURL（通常は変更不要）</summary>
      <Labeled label="ローカル文字起こしの接続先URL" hint="ローカルのfaster-whisperに接続するURLです。Docker版では自動で設定されます。">
        <input className="input" value={sttUrl} onChange={(e) => setSttUrl(e.target.value)}
          placeholder="http://127.0.0.1:8000" autoComplete="off" />
      </Labeled>
      </details>
      {err && <p className="text-sm text-error">{err}</p>}
      <button type="submit" disabled={busy} className="btn btn-primary !py-2.5 w-full justify-center">
        {busy ? '接続中…' : submitLabel}
      </button>
    </form>
  );
}

/** A compact live badge for the bot connection state. */
export function BotStatusBadge({ bot }) {
  const map = {
    ready: { label: '接続済み', color: 'var(--accent)', bg: 'var(--accent-soft)' },
    starting: { label: '接続中…', color: 'var(--warn)', bg: 'var(--warn-soft)' },
    error: { label: 'エラー', color: 'var(--error)', bg: 'var(--error-soft)' },
    stopped: { label: '未接続', color: 'var(--muted)', bg: 'var(--surface-3)' },
  };
  const s = map[bot?.state] || map.stopped;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full" style={{ color: s.color, background: s.bg }}>
      <span style={{ width: 6, height: 6, borderRadius: 6, background: s.color }} />
      {s.label}{bot?.user?.tag ? ` · ${bot.user.tag}` : ''}
    </span>
  );
}

export { Icon };
