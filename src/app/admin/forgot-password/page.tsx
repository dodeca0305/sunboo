'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createRecoveryRequestClient } from '@/lib/supabase/recoveryRequest';
import { RECOVERY_REQUEST_KEY, RECOVERY_REQUEST_LOCK, parseRecoveryAttempt, requestRecoverySafely } from '@/lib/recoveryRequestGuard';

function snapshot() {
    try { return window.localStorage.getItem(RECOVERY_REQUEST_KEY); }
    catch { return 'unavailable'; }
}
function subscribe(notify: () => void) {
    window.addEventListener('storage', notify);
    window.addEventListener('sunboo:recovery-request', notify);
    return () => { window.removeEventListener('storage', notify); window.removeEventListener('sunboo:recovery-request', notify); };
}
const messages = {
    sending: '送信中、または前回の送信結果を確認できない状態です。再送せず、届いた最新のメールを先に確認してください。',
    sent: '登録がある場合は、再設定用のメールが届きます。同じブラウザ・プロフィールで最新のメールのリンクを1回開いてください。',
    unknown: '送信結果を確認できません。メールが届いている可能性があります。自動で再送せず、最新のメールを先に確認してください。',
    rejected: '送信は受け付けられませんでした。メールアドレスや接続を確認してください。先に届いたメールの確認情報は、この拒否では変更していません。',
    rate_limited: '認証サービスのメール送信制限により、今回の依頼は拒否されました。先に届いたメールの確認情報は保持しています。上限をアプリから解除することはできません。',
};

export default function ForgotPasswordPage() {
    const raw = useSyncExternalStore(subscribe, snapshot, () => 'loading');
    const [email, setEmail] = useState(''), [busy, setBusy] = useState(false), [resend, setResend] = useState(false);
    const [message, setMessage] = useState(''), [now, setNow] = useState(0);
    const lock = useRef(false);
    useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
    let attempt = null, unavailable = raw === 'loading';
    try { if (!unavailable) attempt = parseRecoveryAttempt(raw); } catch { unavailable = true; }
    const wait = attempt ? Math.max(0, Math.ceil((attempt.notBefore - now) / 1000)) : 0;
    const disabled = busy || unavailable || (!!attempt && (wait > 0 || !resend));
    async function submit(e: React.FormEvent) {
        e.preventDefault();
        if (lock.current || disabled) return;
        lock.current = true;
        setBusy(true);
        setMessage('');
        try {
            if (!navigator.locks) { setMessage('このブラウザでは複数タブの送信を安全に制御できません。最新のChromeでお試しください。'); return; }
            const result = await requestRecoverySafely({
                storage: localStorage,
                exclusive: async work => await navigator.locks.request(RECOVERY_REQUEST_LOCK, { ifAvailable: true }, held => held ? work() : Promise.resolve('blocked' as const)),
                prepare: createRecoveryRequestClient,
                now: () => Date.now(), id: () => crypto.randomUUID(),
            }, { email, origin: window.location.origin, resend });
            setMessage(result === 'blocked' ? 'このブラウザでは、すでにメールを依頼しています。他のタブと最新のメールを確認してください。' : result === 'unavailable' ? '送信状態を安全に保存・確認できないため停止しました。自動で再送しません。保存領域やブラウザの設定を確認してください。' : '');
        } catch {
            setMessage('送信状態を安全に確認できないため停止しました。自動で再送しません。ブラウザの設定を確認してください。');
        } finally {
            window.dispatchEvent(new Event('sunboo:recovery-request'));
            setNow(Date.now()); setResend(false); lock.current = false; setBusy(false);
        }
    }
    return <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4"><section className="card w-full max-w-md space-y-4">
        <h1 className="text-lg font-bold">パスワードの再設定</h1>
        <p className="text-sm">登録済みのメールアドレスへ、再設定用リンクを送ります。管理者権限や会社の情報は変更しません。</p>
        {(message || attempt || unavailable) && <p role="status" className="text-sm">{message || (unavailable ? '送信状態を確認中、または保存領域を利用できません。確認できるまで送信を停止します。' : attempt ? messages[attempt.outcome] : '')}</p>}
        {attempt && <div className="space-y-2 text-sm">
            <p>依頼日時：{new Date(attempt.attemptedAt).toLocaleString('ja-JP')}。この依頼の記録は再読み込み・同じサイトの別タブでも保持します。</p>
            {now === 0 ? <p>再依頼までの時間を確認しています。</p> : wait > 0 ? <p>再依頼の確認は、あと{Math.ceil(wait / 60)}分を目安に表示します。時間が経っても自動送信しません。{attempt.outcome === 'rate_limited' && '認証サービスの正確な解除時刻や、次回の送信成功を保証するものではありません。'}</p> : <label className="flex gap-2"><input type="checkbox" checked={resend} onChange={e => setResend(e.target.checked)}/>最新のメールを確認しました。再依頼すると以前のメールが使えなくなる可能性を理解し、新しいメールを依頼します。</label>}
        </div>}
        <form onSubmit={submit} className="space-y-4"><label className="form-label" htmlFor="recovery-email">登録メールアドレス</label><input id="recovery-email" className="form-input" type="email" autoComplete="email" required disabled={disabled} value={email} onChange={e => setEmail(e.target.value)}/><button type="submit" className="btn-primary" disabled={disabled}>{busy ? '送信中…' : attempt ? '新しい再設定メールを依頼する' : '再設定メールを送る'}</button></form>
        <p className="text-xs">メールのリンクは、依頼した同じブラウザ・プロフィールで開いてください。迷惑メールフォルダもご確認ください。保存領域を消して再送し直さず、先に最新のメールを確認してください。</p>
        <Link className="btn-secondary" href="/admin/login">ログイン画面へ</Link>
    </section></main>;
}
