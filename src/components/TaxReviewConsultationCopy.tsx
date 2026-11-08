'use client';

import { useState } from 'react';

export default function TaxReviewConsultationCopy({ text }: { text: string }) {
  const [notice, setNotice] = useState<'copied' | 'failed' | null>(null);
  async function copy() {
    setNotice(null);
    try {
      await navigator.clipboard.writeText(text);
      setNotice('copied');
    } catch {
      setNotice('failed');
    }
  }
  return (
    <div className="space-y-2">
      <button type="button" className="btn-secondary" onClick={copy}>税理士に送る確認内容をコピー</button>
      <p className="text-xs text-sunboo-ink-muted">メールなどに貼り付けて、ご自身で連絡してください。</p>
      {notice === 'copied' && <p role="status" className="text-sm text-blue-900">確認内容をコピーしました。送信はしていません。</p>}
      {notice === 'failed' && <p role="alert" className="text-sm text-red-900">コピーできませんでした。「詳しい理由」の内容を確認してください。</p>}
    </div>
  );
}
