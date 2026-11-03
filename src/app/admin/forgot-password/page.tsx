'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { requestPasswordRecovery } from '@/lib/passwordRecovery';
export default function ForgotPasswordPage() {
    const [email, setEmail] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [sent, setSent] = useState(false);
    const lock = useRef(false);
    async function submit(e: React.FormEvent) {
        e.preventDefault();
        if (lock.current || sent)
            return;
        lock.current = true;
        setBusy(true);
        setMessage('');
        try {
            const client = createBrowserSupabase();
            const result = client ? await requestPasswordRecovery(client, email, window.location.origin) : 'rejected';
            if (result === 'sent') {
                setSent(true);
                setMessage('登録がある場合は、再設定用のメールが届きます。このブラウザでメールのリンクを開き、新しいパスワードを設定してください。');
            }
            else if (result === 'unknown') {
                setSent(true);
                setMessage('送信結果を確認できません。自動で再送しません。まず届いたメールを確認してください。届かない場合は時間をおいてこの画面を開き直してください。');
            }
            else
                setMessage('送信処理を完了できませんでした。メールアドレスと接続を確認し、時間をおいてお試しください。');
        }
        finally {
            lock.current = false;
            setBusy(false);
        }
    }
    return <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4"><section className="card w-full max-w-md space-y-4">
 <h1 className="text-lg font-bold">パスワードの再設定</h1><p className="text-sm">登録済みのメールアドレスへ、再設定用リンクを送ります。管理者権限や会社の情報は変更しません。</p>
 {message && <p role="status" className="text-sm">{message}</p>}
 <form onSubmit={submit} className="space-y-4"><label className="form-label" htmlFor="recovery-email">登録メールアドレス</label><input id="recovery-email" className="form-input" type="email" autoComplete="email" required disabled={busy || sent} value={email} onChange={e => setEmail(e.target.value)}/><button type="submit" className="btn-primary" disabled={busy || sent}>{busy ? '送信中…' : '再設定メールを送る'}</button></form>
 <p className="text-xs">メールのリンクは、送信した同じブラウザ・プロフィールで開いてください。迷惑メールフォルダもご確認ください。</p><Link className="btn-secondary" href="/admin/login">ログイン画面へ</Link>
 </section></main>;
}
