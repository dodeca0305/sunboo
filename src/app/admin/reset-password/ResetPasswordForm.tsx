'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { recoveryKey, recoveryPendingKey, updateRecoveredPassword } from '@/lib/passwordRecovery';
export default function ResetPasswordForm() {
    const [user, setUser] = useState<{
        id: string;
        email: string;
    } | null>(null), [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState(''), [busy, setBusy] = useState(false), [saved, setSaved] = useState(false), [pending, setPending] = useState(false), [message, setMessage] = useState('リンクを確認しています…');
    const lock = useRef(false);
    useEffect(() => {
        let active = true;
        const client = createBrowserSupabase();
        if (!client) {
            const frame = requestAnimationFrame(() => setMessage('認証に接続できません。再設定メールを依頼し直してください。'));
            return () => cancelAnimationFrame(frame);
        }
        const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
            if (event === 'PASSWORD_RECOVERY' && session?.user.id) {
                try {
                    sessionStorage.setItem(recoveryKey(session.user.id), 'active');
                    sessionStorage.removeItem(recoveryPendingKey(session.user.id));
                }
                catch { /* The submit step requires storage before changing credentials. */ }
            }
        });
        void (async () => {
            try {
                const r = await client.auth.getUser();
                if (!active)
                    return;
                window.history.replaceState(null, '', '/admin/reset-password');
                const u = r.data.user;
                if (r.error || !u?.email || sessionStorage.getItem(recoveryKey(u.id)) !== 'active') {
                    setMessage('リンクが無効・期限切れか、送信時と異なるブラウザです。再設定メールを依頼し直してください。');
                    return;
                }
                setUser({ id: u.id, email: u.email });
                const unknown = sessionStorage.getItem(recoveryPendingKey(u.id)) === 'unknown';
                setPending(unknown);
                setMessage(unknown ? '前回の変更結果を確認できません。再送せず、新しいパスワードでログインを確認してください。' : 'メールの認証を確認しました。新しいパスワードを入力してください。');
            }
            catch {
                if (active)
                    setMessage('再設定リンクを確認できません。接続を確認し、同じブラウザで再設定メールを依頼し直してください。');
            }
        })();
        return () => { active = false; subscription.unsubscribe(); };
    }, []);
    async function submit(e: React.FormEvent) {
        e.preventDefault();
        if (lock.current || !user || pending || saved)
            return;
        if (password.length < 12 || password !== confirmation) {
            setMessage('12文字以上のパスワードを、確認欄にも同じように入力してください。');
            return;
        }
        lock.current = true;
        setBusy(true);
        setMessage('');
        try {
            sessionStorage.setItem(recoveryPendingKey(user.id), 'unknown');
            setPending(true);
            const client = createBrowserSupabase();
            if (!client)
                throw Error();
            const result = await updateRecoveredPassword(client, user.id, password);
            if (result === 'saved') {
                sessionStorage.removeItem(recoveryKey(user.id));
                sessionStorage.removeItem(recoveryPendingKey(user.id));
                setSaved(true);
                setMessage('パスワードを変更しました。ログイン画面から、新しいパスワードでログインしてください。');
                try {
                    await client.auth.signOut({ scope: 'local' });
                }
                catch { /* A confirmed password change must not be retried if sign-out fails. */ }
            }
            else if (result === 'rejected') {
                sessionStorage.removeItem(recoveryPendingKey(user.id));
                setPending(false);
                setMessage('変更は完了していません。パスワードの条件やリンクの有効期限を確認してください。');
            }
            else
                setMessage('変更結果を確認できません。無条件に再送せず、ログイン画面から新しいパスワードを確認してください。');
        }
        catch {
            setMessage('変更結果を確認できません。再送せず、ログイン画面で確認してください。');
        }
        finally {
            setPassword('');
            setConfirmation('');
            lock.current = false;
            setBusy(false);
        }
    }
    return <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4"><section className="card w-full max-w-md space-y-4"><h1 className="text-lg font-bold">新しいパスワードを設定</h1><p role="status" className="text-sm">{message}</p>
 {user && !saved && <><p className="text-sm">対象アカウント：{user.email}</p><form onSubmit={submit} className="space-y-4"><fieldset disabled={busy || pending} className="space-y-4"><label className="form-label" htmlFor="new-password">新しいパスワード（12文字以上）</label><input id="new-password" type="password" autoComplete="new-password" minLength={12} required className="form-input" value={password} onChange={e => setPassword(e.target.value)}/><label className="form-label" htmlFor="confirm-password">新しいパスワード（確認）</label><input id="confirm-password" type="password" autoComplete="new-password" minLength={12} required className="form-input" value={confirmation} onChange={e => setConfirmation(e.target.value)}/><button type="submit" className="btn-primary" disabled={busy || pending}>{busy ? '変更中…' : 'パスワードを変更する'}</button></fieldset></form></>}
 <div className="flex flex-wrap gap-2"><Link className="btn-secondary" href="/admin/forgot-password">再設定メールを依頼する</Link><Link className="btn-secondary" href="/admin/login">ログイン画面へ</Link></div>
 </section></main>;
}
