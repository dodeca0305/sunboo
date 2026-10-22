import type { SupabaseClient } from '@supabase/supabase-js';
import { loadWorkspaceTaxReviewItems } from './reviewCases.ts';

// 会社ホームの「税務レビュー要約」用の集計。新しい税務判断は持たず、既存データを読むだけ。
// 未対応レビュー数（tax-review画面と同じloader）と、承認済み有効Controlの評価状況は別々に取得・
// 別々に失敗しうる値として返す（片方の取得失敗でもう片方を隠さない・0件を「問題なし」と断定しない）。

export type ControlEvaluationSummary = {
  approvedEnabledControlCount: number;
  evaluatedCount: number;
  unevaluatedCount: number;
  passCount: number;
  reviewCount: number;
  unknownCount: number;
  notApplicableCount: number;
  latestEvaluatedAt: string | null;
};

export type WorkspaceTaxReviewSummary = {
  // tax-review画面と同範囲（status='open'の全ReviewCase）。取得失敗時はnull。
  openReviewCount: number | null;
  // 承認済み有効Controlの評価状況。取得失敗時はnull。
  controlEvaluation: ControlEvaluationSummary | null;
};

export type SummaryControlRow = { id: number };

export type SummaryResultRow = {
  id: number;
  tax_control_id: number;
  applicable: boolean;
  status: 'pass' | 'review' | 'unknown' | null;
  as_of_date: string;
  evaluated_at: string;
};

function isNewer(a: SummaryResultRow, b: SummaryResultRow): boolean {
  if (a.as_of_date !== b.as_of_date) return a.as_of_date > b.as_of_date;
  if (a.evaluated_at !== b.evaluated_at) return a.evaluated_at > b.evaluated_at;
  return a.id > b.id;
}

// Controlごとに最新1件（as_of_date → evaluated_at → id）だけを数える。
// Controlを母集団にするため、結果が無いControlは「未評価」として残る（結果とのinner joinで見失わない）。
export function summarizeControlEvaluation(
  controls: SummaryControlRow[],
  results: SummaryResultRow[],
): ControlEvaluationSummary {
  const targetIds = new Set(controls.map((control) => control.id));
  const latestByControl = new Map<number, SummaryResultRow>();
  for (const result of results) {
    if (!targetIds.has(result.tax_control_id)) continue;
    const current = latestByControl.get(result.tax_control_id);
    if (!current || isNewer(result, current)) latestByControl.set(result.tax_control_id, result);
  }

  const summary: ControlEvaluationSummary = {
    approvedEnabledControlCount: targetIds.size,
    evaluatedCount: latestByControl.size,
    unevaluatedCount: targetIds.size - latestByControl.size,
    passCount: 0,
    reviewCount: 0,
    unknownCount: 0,
    notApplicableCount: 0,
    latestEvaluatedAt: null,
  };
  for (const result of latestByControl.values()) {
    if (!result.applicable) summary.notApplicableCount += 1;
    else if (result.status === 'pass') summary.passCount += 1;
    else if (result.status === 'review') summary.reviewCount += 1;
    else summary.unknownCount += 1;
    if (!summary.latestEvaluatedAt || result.evaluated_at > summary.latestEvaluatedAt) {
      summary.latestEvaluatedAt = result.evaluated_at;
    }
  }
  return summary;
}

async function loadControlEvaluation(
  supabase: SupabaseClient,
  companyId: number,
): Promise<ControlEvaluationSummary> {
  const { data: controlData, error: controlError } = await supabase
    .from('tax_controls')
    .select('id')
    .eq('status', 'approved')
    .eq('is_enabled', true);
  if (controlError) throw new Error(controlError.message);

  const controls = (controlData as SummaryControlRow[] | null) ?? [];
  if (controls.length === 0) return summarizeControlEvaluation([], []);

  const { data: resultData, error: resultError } = await supabase
    .from('workspace_tax_control_results')
    .select('id, tax_control_id, applicable, status, as_of_date, evaluated_at')
    .eq('company_id', companyId)
    .in('tax_control_id', controls.map((control) => control.id));
  if (resultError) throw new Error(resultError.message);

  return summarizeControlEvaluation(controls, (resultData as SummaryResultRow[] | null) ?? []);
}

export async function loadWorkspaceTaxReviewSummary(
  supabase: SupabaseClient,
  companyId: number,
): Promise<WorkspaceTaxReviewSummary> {
  const [reviews, evaluation] = await Promise.allSettled([
    loadWorkspaceTaxReviewItems(supabase, companyId),
    loadControlEvaluation(supabase, companyId),
  ]);
  return {
    openReviewCount:
      reviews.status === 'fulfilled'
        ? reviews.value.filter((item) => item.caseStatus === 'open').length
        : null,
    controlEvaluation: evaluation.status === 'fulfilled' ? evaluation.value : null,
  };
}
