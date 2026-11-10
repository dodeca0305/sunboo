import Image from 'next/image';
import type { TaxationMethod } from '@/lib/companyProfile';

// 画面で選ばれた課税方式に応じた空様式の見本。税額や課税方式を推定しない。
export default function ConsumptionTaxAmountGuide({ taxationMethod }: { taxationMethod: TaxationMethod | null }) {
  return (
    <div data-testid="consumption-tax-amount-guide">
      {taxationMethod === null ? (
        <div className="space-y-3 text-sm text-neutral-700" data-testid="consumption-tax-guide-choice">
          <p>手元の申告書に合う見本を選んでください。</p>
          <details>
            <summary className="min-h-11 cursor-pointer py-2 font-medium">一般用の見本</summary>
            <ConsumptionTaxForm taxationMethod="principle" />
          </details>
          <details>
            <summary className="min-h-11 cursor-pointer py-2 font-medium">簡易課税用の見本</summary>
            <ConsumptionTaxForm taxationMethod="simplified" />
          </details>
        </div>
      ) : <ConsumptionTaxForm taxationMethod={taxationMethod} />}
    </div>
  );
}

function ConsumptionTaxForm({ taxationMethod }: { taxationMethod: TaxationMethod }) {
  const simplified = taxationMethod === 'simplified';
  const formLabel = simplified ? '簡易課税用' : '一般用';
  const formFile = simplified ? 'simplified' : 'general';
  const originalFile = simplified ? 'youshiki_008.pdf' : 'youshiki_003.pdf';
  return (
    <div className="space-y-3 text-sm text-neutral-700">
      <p className="font-medium text-neutral-900">消費税の申告書「第一表」を開きます。</p>
      <p>上側の「差引税額」の金額を確認してください。</p>
      <p className="text-xs">地方消費税を含めず、中間納付税額を差し引く前の欄です。</p>
      <figure className="max-w-sm">
        <div className="relative border border-neutral-200 bg-white">
          <Image
            src={`/guides/consumption-tax-return-${formFile}.png`}
            alt={`消費税申告書・第一表（${formLabel}）の見本。上側の差引税額の行を枠で示しています。`}
            width={1061}
            height={1500}
            sizes="(max-width: 640px) 85vw, 384px"
            className="h-auto w-full"
          />
          <div aria-hidden="true" className="pointer-events-none absolute left-[4.3%] top-[57.3%] h-[2.1%] w-[52.6%] border-2 border-neutral-900 bg-neutral-100/40" />
          <span aria-hidden="true" className="absolute left-[58%] top-[57%] bg-neutral-900 px-1.5 py-0.5 text-[10px] text-white">この行の金額</span>
        </div>
        <figcaption className="mt-2 text-xs text-neutral-500">国税庁の{formLabel}の見本（令和5年10月以後終了課税期間用）。時期・課税方式で様式が異なるため、手元の申告書では欄名を確認してください。</figcaption>
      </figure>
      <a
        href={`https://www.nta.go.jp/law/tsutatsu/kobetsu/kansetsu/951225/pdf/${originalFile}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center text-xs underline underline-offset-4"
      >見本を大きく見る（国税庁・PDF・別タブ）</a>
      <p className="text-xs">書類が手元にない・欄が見つからない場合は、推測せず税理士に確認してください。一般的な参考情報です。</p>
    </div>
  );
}
