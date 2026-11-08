import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { Logo } from '../components/ui.jsx';

// Shown when the signed-in account still uses its seeded default password. The
// backend blocks the rest of the API (403 PASSWORD_CHANGE_REQUIRED) until this
// is done, so this is a hard gate, not a dismissible nudge.
export default function ForcePasswordChange() {
  const { user, refresh, logout } = useAuth();
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setErr(null);
    if (next !== confirm) { setErr('パスワードが一致しません。'); return; }
    if (next.length < 8) { setErr('パスワードは8文字以上にしてください。'); return; }
    setBusy(true);
    try {
      // mustChangePassword accounts don't need the current password.
      await api.changePassword('', next);
      await refresh(); // clears mustChangePassword → gate falls through to the app
    } catch (e2) {
      setErr(e2?.message || 'パスワードを設定できませんでした。');
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg text-ink flex items-center justify-center p-6">
      <div className="w-full max-w-[400px]">
        <div className="flex items-center justify-center gap-3 mb-8">
          <Logo size={40} />
          <span className="font-display text-2xl font-extrabold tracking-tight">TRPGReplayMaker</span>
        </div>
        <div className="card p-7">
          <h1 className="font-display text-[22px] font-extrabold leading-tight mb-1">新しいパスワードを設定</h1>
          <p className="text-sm text-muted mb-6">
            {user?.username ? <><code className="text-muted">{user.username}</code> は </> : 'このアカウントは'}
            初期パスワードを使用中です。新しいパスワードを設定してください。
          </p>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="fpc-new" className="block text-[13px] font-medium text-ink mb-1.5">新しいパスワード</label>
              <input id="fpc-new" className="input" type="password" value={next} autoFocus autoComplete="new-password"
                onChange={(e) => setNext(e.target.value)} placeholder="8文字以上" />
            </div>
            <div>
              <label htmlFor="fpc-confirm" className="block text-[13px] font-medium text-ink mb-1.5">パスワード（確認）</label>
              <input id="fpc-confirm" className="input" type="password" value={confirm} autoComplete="new-password"
                onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" />
            </div>
            {err && <p className="text-sm text-error bg-error-soft rounded-sm px-3 py-2">{err}</p>}
            <button type="submit" disabled={busy || next.length < 8}
              className="btn btn-primary !py-2.5 w-full justify-center">
              {busy ? '保存中…' : 'パスワードを設定して続ける'}
            </button>
          </form>
        </div>
        <button onClick={logout} className="block mx-auto text-[12px] text-faint hover:text-muted mt-5">
          Sign out
        </button>
      </div>
    </div>
  );
}
