import type { SupabaseClient } from '@supabase/supabase-js';

export type WorkspaceTaxReviewCaseStatus = 'open' | 'resolved' | 'dismissed';
export type WorkspaceTaxReviewResultStatus = 'review' | 'unknown';
export type WorkspaceTaxReviewSeverity = 'info' | 'warning' | 'error' | 'critical';

export type WorkspaceTaxReviewItem = {
  caseId: number;
  companyId: number;
  caseStatus: WorkspaceTaxReviewCaseStatus;
  title: string;
  issueSummary: string;
  resolutionSummary: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;

  controlResultId: number;
  resultStatus: WorkspaceTaxReviewResultStatus;
  reasonCode: string;
  reasonSummary: string;
  asOfDate: string;
  evaluatedAt: string;
  evaluatorVersion: string;

  taxControlId: number;
  controlCode: string;
  controlVersionNo: number;
  controlTitle: string;
  severity: WorkspaceTaxReviewSeverity;
};

type ReviewCaseRow = {
  id: number;
  company_id: number;
  control_result_id: number;
  status: WorkspaceTaxReviewCaseStatus;
  title: string;
  issue_summary: string;
  resolution_summary: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

type ControlResultRow = {
  id: number;
  company_id: number;
  tax_control_id: number;
  status: WorkspaceTaxReviewResultStatus;
  reason_code: string;
  reason_summary: string;
  as_of_date: string;
  evaluated_at: string;
  evaluator_version: string;
};

type TaxControlRow = {
  id: number;
  control_code: string;
  version_no: number;
  title: string;
  default_severity: WorkspaceTaxReviewSeverity;
};

const CASE_STATUS_ORDER: Record<WorkspaceTaxReviewCaseStatus, number> = {
  open: 0,
  resolved: 1,
  dismissed: 2,
};

export async function loadWorkspaceTaxReviewItems(
  supabase: SupabaseClient,
  companyId: number,
): Promise<WorkspaceTaxReviewItem[]> {
  const { data: caseData, error: caseError } = await supabase
    .from('workspace_tax_review_cases')
    .select(
      'id, company_id, control_result_id, status, title, issue_summary, resolution_summary, resolved_by, resolved_at, created_at, updated_at',
    )
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false });

  if (caseError) {
    throw new Error(`ReviewCaseの取得に失敗しました: ${caseError.message}`);
  }

  const cases = (caseData as ReviewCaseRow[] | null) ?? [];
  if (cases.length === 0) return [];

  const resultIds = [...new Set(cases.map((row) => row.control_result_id))];

  const { data: resultData, error: resultError } = await supabase
    .from('workspace_tax_control_results')
    .select(
      'id, company_id, tax_control_id, status, reason_code, reason_summary, as_of_date, evaluated_at, evaluator_version',
    )
    .eq('company_id', companyId)
    .in('id', resultIds);

  if (resultError) {
    throw new Error(`ControlResultの取得に失敗しました: ${resultError.message}`);
  }

  const results = (resultData as ControlResultRow[] | null) ?? [];
  const resultById = new Map(results.map((row) => [row.id, row]));

  const controlIds = [...new Set(results.map((row) => row.tax_control_id))];

  const { data: controlData, error: controlError } = await supabase
    .from('tax_controls')
    .select('id, control_code, version_no, title, default_severity')
    .in('id', controlIds);

  if (controlError) {
    throw new Error(`TaxControlの取得に失敗しました: ${controlError.message}`);
  }

  const controls = (controlData as TaxControlRow[] | null) ?? [];
  const controlById = new Map(controls.map((row) => [row.id, row]));

  const items = cases.map((caseRow): WorkspaceTaxReviewItem => {
    const result = resultById.get(caseRow.control_result_id);
    if (!result) {
      throw new Error(
        `ReviewCase ${caseRow.id} のControlResult ${caseRow.control_result_id}を参照できません。`,
      );
    }

    const control = controlById.get(result.tax_control_id);
    if (!control) {
      throw new Error(
        `ControlResult ${result.id} のTaxControl ${result.tax_control_id}を参照できません。`,
      );
    }

    return {
      caseId: caseRow.id,
      companyId: caseRow.company_id,
      caseStatus: caseRow.status,
      title: caseRow.title,
      issueSummary: caseRow.issue_summary,
      resolutionSummary: caseRow.resolution_summary,
      resolvedBy: caseRow.resolved_by,
      resolvedAt: caseRow.resolved_at,
      createdAt: caseRow.created_at,
      updatedAt: caseRow.updated_at,

      controlResultId: result.id,
      resultStatus: result.status,
      reasonCode: result.reason_code,
      reasonSummary: result.reason_summary,
      asOfDate: result.as_of_date,
      evaluatedAt: result.evaluated_at,
      evaluatorVersion: result.evaluator_version,

      taxControlId: control.id,
      controlCode: control.control_code,
      controlVersionNo: control.version_no,
      controlTitle: control.title,
      severity: control.default_severity,
    };
  });

  return items.sort((a, b) => {
    const statusDiff = CASE_STATUS_ORDER[a.caseStatus] - CASE_STATUS_ORDER[b.caseStatus];
    if (statusDiff !== 0) return statusDiff;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}
