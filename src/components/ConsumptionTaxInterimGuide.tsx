import Image from 'next/image';
import { ChevronDown } from 'lucide-react';

export default function ConsumptionTaxInterimGuide() {
  return (
    <details className="group" data-testid="consumption-interim-field-guide">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
        <span className="form-label">今期、消費税の中間申告は何回でしたか</span>
        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-neutral-600">
          <span className="underline underline-offset-4">どこを見る？</span>
          <ChevronDown aria-hidden="true" className="h-4 w-4 group-open:rotate-180" />
        </span>
      </summary>
      <div className="space-y-3 pb-3 pt-2 text-sm text-neutral-700">
        <p className="font-medium text-neutral-900">この決算期の中間申告の記録を確認します。</p>
        <details>
          <summary className="min-h-11 cursor-pointer py-2 font-medium">中間申告書の控えを見る</summary>
          <div className="space-y-3 py-2">
            <p>書類名：「消費税及び地方消費税の中間申告書」</p>
            <p>右側の「中間申告対象期間」を確認します。同じ期間の再送・修正を重複して数えないでください。</p>
            <figure className="max-w-sm">
              <div className="relative border border-neutral-200 bg-white">
                <Image
                  src="/guides/consumption-tax-interim.png"
                  alt="消費税及び地方消費税の中間申告書の上部の見本。右側の中間申告対象期間を枠で示しています。"
                  width={1061}
                  height={740}
                  sizes="(max-width: 640px) 85vw, 384px"
                  className="h-auto w-full"
                />
                <div aria-hidden="true" className="pointer-events-none absolute left-[71.3%] top-[58.4%] h-[13.7%] w-[27%] border-2 border-neutral-900 bg-neutral-100/40" />
                <span aria-hidden="true" className="absolute left-[40%] top-[59%] bg-neutral-900 px-1.5 py-0.5 text-[10px] text-white">対象期間を確認</span>
              </div>
              <figcaption className="mt-2 text-xs text-neutral-500">国税庁の予定申告用の空様式の上部。仮決算などでは様式が異なるため、手元の申告書で対象期間の欄を確認してください。</figcaption>
            </figure>
            <a href="https://www.nta.go.jp/law/tsutatsu/kobetsu/kansetsu/951225/pdf/youshiki_036.pdf" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-xs underline underline-offset-4">見本を大きく見る（国税庁・PDF・別タブ）</a>
          </div>
        </details>
        <details>
          <summary className="min-h-11 cursor-pointer py-2 font-medium">e-Taxの記録を見る</summary>
          <div className="space-y-3 py-2">
            <p>「お知らせ・受信通知」で、この決算期の消費税の中間申告の記録を確認します。</p>
            <p>受信通知から申告書を表示する手順は、下の公式案内で確認できます。</p>
            <p className="text-xs">お知らせの件数だけで提出済みの回数とは判断しません。申告書を出さずに申告した扱いになる場合もあるため、不明なら税理士に確認してください。</p>
            <a href="https://www.e-tax.nta.go.jp/toiawase/qa/e-taxweb/43.htm" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-xs underline underline-offset-4">申告書の確認方法を見る（e-Tax公式・別タブ）</a>
          </div>
        </details>
        <p className="text-xs">確定申告書の中間納付税額だけでは回数は分かりません。記録がない・不明・選択肢に合わない場合は「なし」や回数を推測せず税理士に確認し、保存を保留してください。一般的な参考情報です。</p>
      </div>
    </details>
  );
}
