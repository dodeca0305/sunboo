import Image from 'next/image';

// 国税庁・令和7年様式（2026年3月期の例）。入力値や期限の推定には使用しない。
export default function CorporateTaxAmountGuide() {
  return (
    <div className="space-y-3 text-sm text-neutral-700" data-testid="corporate-tax-amount-guide">
      <p className="font-medium text-neutral-900">法人税申告書「別表一」を開きます。</p>
      <p>左側の「差引所得に対する法人税額」の金額を確認してください。</p>
      <p className="text-xs">中間申告分を差し引く前の欄です。</p>
      <figure className="max-w-sm">
        <div className="relative border border-neutral-200 bg-white">
          <Image
            src="/guides/corporate-tax-return-2025.png"
            alt="法人税申告書・別表一の見本。左側の差引所得に対する法人税額の行を枠で示しています。"
            width={1061}
            height={1500}
            sizes="(max-width: 640px) 85vw, 384px"
            className="h-auto w-full"
          />
          <div aria-hidden="true" className="pointer-events-none absolute left-[3.4%] top-[63.5%] h-[2.1%] w-[46.8%] border-2 border-neutral-900 bg-neutral-100/40" />
          <span aria-hidden="true" className="absolute left-[51%] top-[63%] bg-neutral-900 px-1.5 py-0.5 text-[10px] text-white">この行の金額</span>
        </div>
        <figcaption className="mt-2 text-xs text-neutral-500">国税庁の令和7年様式の見本。年度で様式が異なるため、手元の申告書では欄名を確認してください。</figcaption>
      </figure>
      <a
        href="https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/hojin/shinkoku/itiran2025/pdf/01-01-a.pdf"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center text-xs underline underline-offset-4"
      >見本を大きく見る（国税庁・PDF・別タブ）</a>
      <p className="text-xs">書類が手元にない・欄が見つからない場合は、推測せず税理士に確認してください。一般的な参考情報です。</p>
    </div>
  );
}
