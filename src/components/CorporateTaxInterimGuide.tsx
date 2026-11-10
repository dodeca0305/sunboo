import Image from 'next/image';
import { ChevronDown } from 'lucide-react';

export default function CorporateTaxInterimGuide() {
  return (
    <details className="group" data-testid="corporate-interim-field-guide">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
        <span className="form-label">今期、法人税の中間申告はありましたか</span>
        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-neutral-600">
          <span className="underline underline-offset-4">どこを見る？</span>
          <ChevronDown aria-hidden="true" className="h-4 w-4 group-open:rotate-180" />
        </span>
      </summary>
      <div className="space-y-3 pb-3 pt-2 text-sm text-neutral-700">
        <p className="font-medium text-neutral-900">この決算期の確定申告書「別表一」を開きます。</p>
        <p>左側の「中間申告分の法人税額」を確認してください。</p>
        <p className="text-xs">中間申告で納付すべき金額の欄です。納付済みかどうかとは別です。</p>
        <figure className="max-w-sm">
          <div className="relative border border-neutral-200 bg-white">
            <Image
              src="/guides/corporate-tax-return-2025.png"
              alt="法人税申告書・別表一の見本。左側の中間申告分の法人税額の行を枠で示しています。"
              width={1061}
              height={1500}
              sizes="(max-width: 640px) 85vw, 384px"
              className="h-auto w-full"
            />
            <div aria-hidden="true" className="pointer-events-none absolute left-[3.4%] top-[65.5%] h-[2%] w-[46.8%] border-2 border-neutral-900 bg-neutral-100/40" />
            <span aria-hidden="true" className="absolute left-[51%] top-[65%] bg-neutral-900 px-1.5 py-0.5 text-[10px] text-white">この欄を確認</span>
          </div>
          <figcaption className="mt-2 text-xs text-neutral-500">国税庁の令和7年様式の見本。年度で様式が異なるため、手元の申告書では欄名を確認してください。</figcaption>
        </figure>
        <a
          href="https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/hojin/shinkoku/itiran2025/pdf/01-01-a.pdf"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center text-xs underline underline-offset-4"
        >見本を大きく見る（国税庁・PDF・別タブ）</a>
        <p className="text-xs">空欄・0・書類なしで判断できない場合は、「なし」と決めず、中間申告書の控えなどを税理士と確認してください。不明なまま保存しないでください。一般的な参考情報です。</p>
      </div>
    </details>
  );
}
