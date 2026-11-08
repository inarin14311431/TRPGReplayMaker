import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { Page, PageHead } from '../components/Page.jsx';
import { Avatar, Icon, Empty } from '../components/ui.jsx';

function Card({ title, desc, children, action }) {
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-ink">{title}</h2>
          {desc && <p className="text-xs text-muted mt-0.5">{desc}</p>}
        </div>
        {action}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, children, hint }) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-ink mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted mt-1.5">{hint}</p>}
    </div>
  );
}

/* ── Change your own password ─────────────────────────────────────────────── */
function PasswordCard({ user, onChanged }) {
  const mustChange = user?.mustChangePassword;
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setErr(null); setMsg(null);
    if (next !== confirm) { setErr('新しいパスワードが一致しません。'); return; }
    if (next.length < 8) { setErr('新しいパスワードは8文字以上にしてください。'); return; }
    setBusy(true);
    try {
      await api.changePassword(current, next);
      setCurrent(''); setNext(''); setConfirm('');
      setMsg('パスワードを更新しました。');
      onChanged?.();
    } catch (e2) {
      setErr(e2?.message || 'パスワードを変更できませんでした。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="自分のパスワード" desc={mustChange ? '初期パスワードを使用中です。新しいパスワードを設定してください。' : 'アカウントのパスワードを変更します。'}>
      {mustChange && (
        <div className="text-sm text-warn bg-warn-soft rounded-sm px-3 py-2">
          初期パスワードを使用中です。変更してください。
        </div>
      )}
      <form onSubmit={submit} className="space-y-4">
        {!mustChange && (
          <Field label="現在のパスワード">
            <input className="input" type="password" value={current} autoComplete="current-password"
              onChange={(e) => setCurrent(e.target.value)} />
          </Field>
        )}
        <Field label="新しいパスワード">
          <input className="input" type="password" value={next} autoComplete="new-password"
            onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="新しいパスワード（確認）">
          <input className="input" type="password" value={confirm} autoComplete="new-password"
            onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        {err && <p className="text-sm text-error">{err}</p>}
        {msg && <p className="text-sm text-accent">{msg}</p>}
        <button type="submit" disabled={busy || !next} className="btn btn-primary !py-2">
          {busy ? '保存中…' : 'パスワードを変更'}
        </button>
      </form>
    </Card>
  );
}

/* ── Add a new user (admin) ───────────────────────────────────────────────── */
function AddUserForm({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await api.createUser({ username: username.trim(), email: email.trim() || null, password, isAdmin });
      setUsername(''); setEmail(''); setPassword(''); setIsAdmin(false); setOpen(false);
      onCreated?.();
    } catch (e2) {
      setErr(e2?.message || 'ユーザーを作成できませんでした。');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn btn-primary !py-1.5">
        <Icon.UserPlus width={15} height={15} />ユーザーを追加
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="w-full mt-4 pt-4 border-t border-border grid sm:grid-cols-2 gap-3">
      <Field label="ユーザー名"><input className="input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="jane" autoComplete="off" /></Field>
      <Field label="メールアドレス（任意）"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" autoComplete="off" /></Field>
      <Field label="パスワード"><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="4文字以上" autoComplete="new-password" /></Field>
      <div className="flex items-end">
        <label className="flex items-center gap-2 text-[13px] text-ink cursor-pointer select-none pb-2.5">
          <input type="checkbox" className="pcheck" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
          Administrator
        </label>
      </div>
      {err && <p className="text-sm text-error sm:col-span-2">{err}</p>}
      <div className="sm:col-span-2 flex items-center gap-2">
        <button type="submit" disabled={busy || !username.trim() || !password} className="btn btn-primary !py-2">{busy ? '作成中…' : 'ユーザーを作成'}</button>
        <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost !py-2">キャンセル</button>
      </div>
    </form>
  );
}

function UserRow({ u, me, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [resetting, setResetting] = useState(false);
  const [pw, setPw] = useState('');

  async function act(fn) {
    setBusy(true); setErr(null);
    try { await fn(); onChanged?.(); }
    catch (e) { setErr(e?.message || '操作に失敗しました。'); }
    finally { setBusy(false); }
  }

  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        <Avatar name={u.username} size={32} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-ink truncate">{u.username}</span>
            {u.isAdmin && <span className="chip !bg-primary-soft !text-primary"><Icon.Shield width={11} height={11} />管理者</span>}
            {u.id === me?.id && <span className="text-[11px] text-muted">you</span>}
          </div>
          {u.email && <p className="text-xs text-muted truncate">{u.email}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setResetting((r) => !r)} disabled={busy} className="btn btn-ghost !py-1.5">パスワードを再設定</button>
          {!u.isAdmin && <button onClick={() => act(() => api.updateUser(u.id, { isAdmin: true }))} disabled={busy} className="btn btn-ghost !py-1.5">管理者にする</button>}
          {u.isAdmin && u.id !== me?.id && <button onClick={() => act(() => api.updateUser(u.id, { isAdmin: false }))} disabled={busy} className="btn btn-ghost !py-1.5">管理者権限を外す</button>}
          {u.id !== me?.id && (
            <button onClick={() => { if (window.confirm(`Delete ${u.username}?`)) act(() => api.deleteUser(u.id)); }}
              disabled={busy} className="btn btn-ghost !py-1.5 !text-error" title="ユーザーを削除"><Icon.Trash width={15} height={15} /></button>
          )}
        </div>
      </div>
      {resetting && (
        <div className="flex items-center gap-2 mt-3 ml-11">
          <input className="input flex-1" type="password" value={pw} placeholder="新しいパスワード（8文字以上）"
            onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
          <button onClick={() => act(async () => { await api.resetUserPassword(u.id, pw); setPw(''); setResetting(false); })}
            disabled={busy || pw.length < 8} className="btn btn-primary !py-2">保存</button>
          <button onClick={() => { setResetting(false); setPw(''); }} className="btn btn-ghost !py-2">キャンセル</button>
        </div>
      )}
      {err && <p className="text-xs text-error mt-1.5 ml-11">{err}</p>}
    </div>
  );
}

function UsersCard({ me }) {
  const [users, setUsers] = useState(null);
  const [err, setErr] = useState(null);
  function reload() { api.users().then((r) => setUsers(r.users)).catch((e) => setErr(e?.message || 'ユーザー一覧を読み込めませんでした')); }
  useEffect(() => { reload(); }, []);

  return (
    <Card title="ユーザー" desc="この画面にログインできるユーザーです。" action={<AddUserForm onCreated={reload} />}>
      {err ? (
        <p className="text-sm text-error">{err}</p>
      ) : !users ? (
        <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-12 skeleton rounded-md" />)}</div>
      ) : users.length === 0 ? (
        <Empty icon={Icon.Users} title="ユーザーがいません" />
      ) : (
        <div className="divide-y divide-border">
          {users.map((u) => <UserRow key={u.id} u={u} me={me} onChanged={reload} />)}
        </div>
      )}
    </Card>
  );
}

export default function Account() {
  const { user, refresh } = useAuth();
  return (
    <Page max="720px">
      <PageHead title="アカウント" subtitle="ログイン情報を管理します。管理者はユーザーも管理できます。" />
      <div className="space-y-5">
        <PasswordCard user={user} onChanged={refresh} />
        {user?.isAdmin && <UsersCard me={user} />}
      </div>
    </Page>
  );
}
