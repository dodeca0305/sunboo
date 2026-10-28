import type { SupabaseClient } from '@supabase/supabase-js';
import { loadWorkspaceTaxReviewItems } from './reviewCases.ts';

// 会社ホームの「税務レビュー要約」用の集計。新しい税務判断は持たず、既存データを読むだけ。
// 未対応レビュー数（tax-review画面と同じloader）と、現在有効な税務チェック（承認済み・有効なControl）の評価状況は別々に取得・
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
  // 現在有効な税務チェック（承認済み・有効なControl）の評価状況。取得失敗時はnull。
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

// PostgRESTの返却上限（max-rows）を超えても取りこぼさないよう、range()で全ページを読む。
// 並びを固定（末尾にid）しないとページ境界で行が重複・欠落しうる。
export const SUMMARY_PAGE_SIZE = 1000;

async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  pageSize: number,
  isDone: (rows: T[]) => boolean = () => false,
): Promise<T[]> {
  if (!Number.isSafeInteger(pageSize) || pageSize <= 0) {
    throw new Error(`pageSize must be a positive integer: ${pageSize}`);
  }
  const all: T[] = [];
  // サーバー側上限（max-rows）がpageSizeより小さいと、要求より少ない行しか返らない。
  // 要求幅(pageSize)ではなく実際に受け取った件数だけoffsetを進めないと、その間の行を飛ばす。
  for (let from = 0; ; ) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = (data as T[] | null) ?? [];
    all.push(...page);
    // 空ページになるまで続ける（page.length>0なら必ずoffsetが進むので無限ループしない）
    if (page.length === 0 || isDone(all)) break;
    from += page.length;
  }
  return all;
}

async function loadControlEvaluation(
  supabase: SupabaseClient,
  companyId: number,
  pageSize: number,
): Promise<ControlEvaluationSummary> {
  const controls = await fetchAllPages<SummaryControlRow>(
    (from, to) =>
      supabase
        .from('tax_controls')
        .select('id')
        .eq('status', 'approved')
        .eq('is_enabled', true)
        .order('id', { ascending: true })
        .range(from, to),
    pageSize,
  );
  if (controls.length === 0) return summarizeControlEvaluation([], []);

  const controlIds = controls.map((control) => control.id);
  // 最新順（as_of_date → evaluated_at → id の降順）で読み、全Controlの最新結果が出揃った時点で打ち切る。
  const results = await fetchAllPages<SummaryResultRow>(
    (from, to) =>
      supabase
        .from('workspace_tax_control_results')
        .select('id, tax_control_id, applicable, status, as_of_date, evaluated_at')
        .eq('company_id', companyId)
        .in('tax_control_id', controlIds)
        .order('as_of_date', { ascending: false })
        .order('evaluated_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to),
    pageSize,
    (rows) => new Set(rows.map((row) => row.tax_control_id)).size >= controlIds.length,
  );

  return summarizeControlEvaluation(controls, results);
}

export async function loadWorkspaceTaxReviewSummary(
  supabase: SupabaseClient,
  companyId: number,
  pageSize: number = SUMMARY_PAGE_SIZE,
): Promise<WorkspaceTaxReviewSummary> {
  const [reviews, evaluation] = await Promise.allSettled([
    loadWorkspaceTaxReviewItems(supabase, companyId),
    loadControlEvaluation(supabase, companyId, pageSize),
  ]);
  return {
    openReviewCount:
      reviews.status === 'fulfilled'
        ? reviews.value.filter((item) => item.caseStatus === 'open').length
        : null,
    controlEvaluation: evaluation.status === 'fulfilled' ? evaluation.value : null,
  };
}
