import { ChevronDown } from 'lucide-react';

export type PublicationAnswer = 'unknown' | 'true' | 'false';
export const PUBLICATION_CONFIRMATION_MESSAGE = '公開したか分からない場合は、税理士・会社の担当者に確認してから保存してください。';

export default function FinancialPublicationField({ value, onChange }: {
  value: PublicationAnswer;
  onChange: (value: PublicationAnswer) => void;
}) {
  return (
    <div className="space-y-2" data-testid="financial-publication-field">
      <label htmlFor="financial-publication-answer" className="form-label">この決算の内容を公開しましたか？</label>
      <select
        id="financial-publication-answer"
        className="form-select"
        value={value}
        aria-describedby={value === 'unknown' ? 'financial-publication-help financial-publication-pending' : 'financial-publication-help'}
        onChange={(event) => onChange(event.target.value as PublicationAnswer)}
      >
        <option value="unknown">わからない・確認する</option>
        <option value="true">公開した（実施済み）</option>
        <option value="false">公開していない（未実施）</option>
      </select>
      <details className="group" id="financial-publication-help">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm text-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
          <span className="underline underline-offset-4">何を確認する？</span>
          <ChevronDown aria-hidden="true" className="h-4 w-4 group-open:rotate-180" />
        </summary>
        <div className="space-y-3 pb-2 text-sm text-neutral-700">
          <p>「決算公告」のことです。税務署への申告とは別の手続きです。</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>官報・新聞：この決算の公告が載った紙面や控えを確認</li>
            <li>インターネット：会社の決算公告ページで、対象の決算期を確認</li>
          </ul>
          <p className="text-xs">決算書を作っただけ・申告しただけでは、公告したとは限りません。掲載が見つからない場合も、未実施と決めず担当者に確認してください。</p>
          <a href="https://j-net21.smrj.go.jp/solution/qa/accounting/Q0536.html" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-xs underline underline-offset-4">決算公告の説明を見る（中小機構・別タブ）</a>
        </div>
      </details>
      {value === 'unknown' && (
        <p id="financial-publication-pending" className="border-l-2 border-neutral-800 pl-3 text-xs text-neutral-700" role="status">{PUBLICATION_CONFIRMATION_MESSAGE}</p>
      )}
    </div>
  );
}
