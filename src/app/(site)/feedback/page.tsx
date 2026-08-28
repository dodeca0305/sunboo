'use client';

import Link from 'next/link';
import { CheckCircle2, Mail, Send } from 'lucide-react';
import { FormEvent, useState } from 'react';

export default function FeedbackPage() {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError('');

    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.get('name'),
        email: form.get('email'),
        message: form.get('message'),
        website: form.get('website'),
      }),
    });
    const result = (await response.json()) as { error?: string };
    setSending(false);

    if (!response.ok) {
      setError(result.error ?? '送信に失敗しました。');
      return;
    }
    setSent(true);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <div className="mb-8 text-center">
        <Mail className="mx-auto h-8 w-8 text-sunboo-orange" />
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-gray-900">ご意見を送る</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">
          使いにくい点や分かりにくい点、不具合などをお知らせください。
        </p>
      </div>

      {sent ? (
        <section className="card text-center" role="status">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
          <h2 className="mt-3 font-semibold text-gray-900">送信しました</h2>
          <p className="mt-2 text-sm text-gray-500">ご意見ありがとうございます。</p>
          <Link href="/" className="btn-primary mt-6 inline-flex">トップへ戻る</Link>
        </section>
      ) : (
        <form onSubmit={handleSubmit} className="card space-y-5">
          <div>
            <label htmlFor="name" className="form-label">お名前</label>
            <input id="name" name="name" required maxLength={100} autoComplete="name" className="form-input" />
          </div>
          <div>
            <label htmlFor="email" className="form-label">メールアドレス</label>
            <input id="email" name="email" type="email" required maxLength={254} autoComplete="email" className="form-input" />
            <p className="mt-1 text-xs text-gray-500">返信が必要な場合に使用します。</p>
          </div>
          <div>
            <label htmlFor="message" className="form-label">ご意見・不具合の内容</label>
            <textarea id="message" name="message" required maxLength={5000} rows={8} className="form-input resize-y" />
          </div>
          <div className="hidden" aria-hidden="true">
            <label htmlFor="website">ウェブサイト</label>
            <input id="website" name="website" tabIndex={-1} autoComplete="off" />
          </div>
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <button type="submit" disabled={sending} className="btn-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-60">
            <Send className="h-4 w-4" />
            {sending ? '送信中…' : '送信する'}
          </button>
        </form>
      )}
    </div>
  );
}
