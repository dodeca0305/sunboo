import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import type { WorkspaceTaxReviewSummary } from '@/lib/taxIntelligence/reviewSummary';

// 会社ホームの「税務レビュー要約」。判定・集計は src/lib/taxIntelligence/reviewSummary.ts が担い、
// ここは表示のみ。「未対応レビュー」(tax-review画面と同範囲)と「承認済み有効Controlの評価状況」は
// 別の指標として並べ、0件・未評価を「問題なし」と読ませない。

export default function WorkspaceTaxReviewSummaryCard({
  companyId,
  summary,
}: {
  companyId: number;
  // nullは取得処理そのものの失敗
  summary: WorkspaceTaxReviewSummary | null;
}) {
  const evaluation = summary?.controlEvaluation ?? null;
  const openCount = summary?.openReviewCount ?? null;

  return (
    <section className="card space-y-3">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sunboo-ink-muted" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-sunboo-ink">税務レビュー要約</p>
          <p className="mt-1 text-xs leading-relaxed text-sunboo-ink-muted">
            Tax Intelligenceの確認状況です。件数が0でも税務上の問題が無いことを示すものではありません。
          </p>
        </div>
        <Link href={`/admin/workspaces/${companyId}/tax-review`} className="btn-secondary shrink-0 text-xs">
          税務レビューを開く
        </Link>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-sunboo-ink-muted">未対応レビュー（税務レビュー画面と同範囲）</dt>
          <dd className="mt-1 text-sm text-sunboo-ink" data-testid="tax-summary-open">
            {openCount === null ? '取得できませんでした。税務レビュー画面で確認してください。' : `${openCount}件`}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-sunboo-ink-muted">承認済み有効Controlの評価状況</dt>
          <dd className="mt-1 text-sm text-sunboo-ink" data-testid="tax-summary-evaluation">
            {evaluation === null ? (
              '取得できませんでした。'
            ) : evaluation.approvedEnabledControlCount === 0 ? (
              '評価対象の承認済みControlはありません（判定は行われていません）'
            ) : (
              <>
                対象 {evaluation.approvedEnabledControlCount}件 / 評価済み {evaluation.evaluatedCount}件
                {evaluation.unevaluatedCount > 0 && <>（未評価 {evaluation.unevaluatedCount}件）</>}
                <span className="mt-0.5 block text-xs text-sunboo-ink-muted">
                  最新結果: 問題なし {evaluation.passCount} / 要確認 {evaluation.reviewCount} / 判定不能 {evaluation.unknownCount}
                  {evaluation.notApplicableCount > 0 && <> / 対象外 {evaluation.notApplicableCount}</>}
                </span>
              </>
            )}
          </dd>
        </div>
      </dl>

      <p className="text-xs leading-relaxed text-sunboo-ink-muted">
        一般的な参考情報です。税務上の判断は税理士など専門家にご確認ください。
      </p>
    </section>
  );
}
