'use client';

import Link from 'next/link';
import { useId, useState, type ReactNode } from 'react';

export default function TaxReviewActionPicker({
  companyId,
  canEdit,
  consultationSubject,
  children,
  execution,
}: {
  companyId: number;
  canEdit: boolean;
  consultationSubject: string;
  children: ReactNode;
  execution?: ReactNode;
}) {
  const id = useId();
  const [choice, setChoice] = useState('');

  return (
    <div className="space-y-3" data-testid="tax-review-action-picker">
      <label htmlFor={id} className="form-label">何をしますか？</label>
      <select id={id} className="form-select w-full" value={choice} onChange={(event) => setChoice(event.target.value)}>
        <option value="">選んでください</option>
        <option value="consult">税理士に相談する</option>
        {canEdit && <option value="input">足りない情報を入力する</option>}
        <option value="reason">詳しい理由を見る</option>
        {canEdit && execution && <option value="execute">自分でチェックする（結果を保存）</option>}
      </select>

      <div hidden={choice !== 'consult'} className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
        <p className="font-semibold text-blue-950">税理士に確認すること</p>
        <p className="text-sunboo-ink">{consultationSubject}</p>
        <ul className="list-disc space-y-1 pl-5 text-sunboo-ink">
          <li>自社に対応が必要か</li>
          <li>期限と、お願いする範囲</li>
        </ul>
        <p className="text-xs text-sunboo-ink-muted">連絡・依頼は、ご自身で行ってください。</p>
      </div>

      {canEdit && (
        <div hidden={choice !== 'input'} className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
          <p className="font-semibold text-blue-950">入力する画面を選んでください</p>
          <div className="flex flex-wrap gap-2">
            <Link href={`/admin/workspaces/${companyId}/profile`} className="btn-secondary">会社プロフィール</Link>
            <Link href={`/admin/workspaces/${companyId}/tax-returns`} className="btn-secondary">過去の決算・申告情報</Link>
          </div>
        </div>
      )}

      <div hidden={choice !== 'reason'} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        {children}
      </div>

      {/* Keep entered check values when the user temporarily reads another option. */}
      {canEdit && execution && <div hidden={choice !== 'execute'}>{execution}</div>}
    </div>
  );
}
