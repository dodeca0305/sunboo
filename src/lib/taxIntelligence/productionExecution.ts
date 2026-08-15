import type { SupabaseClient } from '../supabase';
import type { CompanyProfile } from '../companyProfile.ts';
import type { TaxReturnProfile } from '../taxReturnProfile.ts';
import type {
  WorkspaceCompanyRow,
} from '../workspaceCompanyProfile.ts';
import {
  loadProductionTaxControlRuntime,
} from './productionExecutionContext.ts';
import {
  evaluateProductionTaxControl,
} from './productionEvaluators.ts';
import type {
  CorporateTaxFilingContext,
  ProductionTaxControlEvaluation,
} from './types.ts';

export type ExecuteProductionTaxControlInput = {
  companyId: number;
  taxControlId: number;
  asOfDate: string;
  corporateTaxFilingContext?: CorporateTaxFilingContext;
};

export type ExecuteProductionTaxControlResult = {
  controlResultId: number;
  reviewCaseId: number | null;
  evaluation: ProductionTaxControlEvaluation;
};

type PersistedEvaluationRow = {
  control_result_id: number;
  review_case_id: number | null;
};

export type ProductionTaxControlExecutorDependencies = {
  loadWorkspaceCompany: (
    supabase: SupabaseClient,
    companyId: number,
  ) => Promise<WorkspaceCompanyRow | null>;

  loadWorkspaceCompanyProfile: (
    supabase: SupabaseClient,
    company: WorkspaceCompanyRow,
  ) => Promise<CompanyProfile>;

  loadWorkspaceTaxReturnProfile: (
    supabase: SupabaseClient,
    companyId: number,
  ) => Promise<TaxReturnProfile>;

  loadProductionTaxControlRuntime:
    typeof loadProductionTaxControlRuntime;

  evaluateProductionTaxControl:
    typeof evaluateProductionTaxControl;
};

async function loadDefaultDependencies():
  Promise<ProductionTaxControlExecutorDependencies> {
  const workspaceLoader =
    await import('../workspaceLoader.ts');

  return {
    loadWorkspaceCompany:
      workspaceLoader.loadWorkspaceCompany,
    loadWorkspaceCompanyProfile:
      workspaceLoader.loadWorkspaceCompanyProfile,
    loadWorkspaceTaxReturnProfile:
      workspaceLoader.loadWorkspaceTaxReturnProfile,
    loadProductionTaxControlRuntime,
    evaluateProductionTaxControl,
  };
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00Z`);

  return (
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function requiresReviewCase(
  evaluation: ProductionTaxControlEvaluation,
): boolean {
  return (
    evaluation.applicable &&
    (
      evaluation.status === 'review' ||
      evaluation.status === 'unknown'
    )
  );
}

function validateEvaluation(
  evaluation: ProductionTaxControlEvaluation,
): void {
  if (!evaluation.applicable) {
    if (evaluation.status !== null) {
      throw new Error(
        '対象外のProduction Tax Control評価はstatus=nullである必要があります。',
      );
    }

    return;
  }

  if (
    evaluation.status !== 'pass' &&
    evaluation.status !== 'review' &&
    evaluation.status !== 'unknown'
  ) {
    throw new Error(
      '対象Production Tax Control評価には有効なstatusが必要です。',
    );
  }
}

export async function executeProductionTaxControl(
  supabase: SupabaseClient,
  input: ExecuteProductionTaxControlInput,
  dependencies?:
    ProductionTaxControlExecutorDependencies,
): Promise<ExecuteProductionTaxControlResult> {
  if (
    !Number.isInteger(input.companyId) ||
    input.companyId <= 0
  ) {
    throw new Error('companyIdは正の整数である必要があります。');
  }

  if (
    !Number.isInteger(input.taxControlId) ||
    input.taxControlId <= 0
  ) {
    throw new Error(
      'taxControlIdは正の整数である必要があります。',
    );
  }

  if (!isIsoDate(input.asOfDate)) {
    throw new Error(
      'asOfDateは有効なYYYY-MM-DD形式である必要があります。',
    );
  }

  const resolvedDependencies =
    dependencies ??
    await loadDefaultDependencies();

  const company =
    await resolvedDependencies.loadWorkspaceCompany(
      supabase,
      input.companyId,
    );

  if (!company) {
    throw new Error(
      `Workspace company ${input.companyId} が存在しません。`,
    );
  }

  const [
    companyProfile,
    taxReturnProfile,
    runtime,
  ] = await Promise.all([
    resolvedDependencies.loadWorkspaceCompanyProfile(
      supabase,
      company,
    ),
    resolvedDependencies.loadWorkspaceTaxReturnProfile(
      supabase,
      input.companyId,
    ),
    resolvedDependencies.loadProductionTaxControlRuntime(
      supabase,
      input.taxControlId,
    ),
  ]);

  const evaluation =
    resolvedDependencies.evaluateProductionTaxControl(
      runtime.evaluatorKey,
      {
        companyProfile,
        taxReturnProfile,
        corporateTaxFilingContext:
          input.corporateTaxFilingContext,
      },
      runtime.executionContext,
    );

  validateEvaluation(evaluation);

  const reviewRequired =
    requiresReviewCase(evaluation);

  const { data, error } = await supabase.rpc(
    'persist_workspace_tax_control_evaluation',
    {
      p_company_id: input.companyId,
      p_tax_control_id: runtime.taxControlId,
      p_as_of_date: input.asOfDate,
      p_applicable: evaluation.applicable,
      p_status: evaluation.status,
      p_reason_code: evaluation.reasonCode,
      p_reason_summary: evaluation.reasonSummary,
      p_observed_inputs: evaluation.observedInputs,
      p_source_version_snapshot:
        evaluation.sourceVersionSnapshot,
      p_evaluator_version: evaluation.evaluatorVersion,
      p_review_title: reviewRequired
        ? `${runtime.controlCode}: ${runtime.controlTitle}`
        : null,
      p_review_issue_summary: reviewRequired
        ? evaluation.reasonSummary
        : null,
    },
  );

  if (error) {
    throw new Error(
      `ControlResult / ReviewCaseの保存に失敗しました: ${error.message}`,
    );
  }

  const rows =
    (data as PersistedEvaluationRow[] | null) ?? [];

  if (rows.length !== 1) {
    throw new Error(
      `評価保存RPCの戻り値が不正です: ${rows.length} rows`,
    );
  }

  const persisted = rows[0];

  if (
    !Number.isInteger(
      persisted.control_result_id,
    ) ||
    persisted.control_result_id <= 0
  ) {
    throw new Error(
      '評価保存RPCから有効なControlResult IDが返されませんでした。',
    );
  }

  if (reviewRequired) {
    if (
      !Number.isInteger(persisted.review_case_id) ||
      (persisted.review_case_id ?? 0) <= 0
    ) {
      throw new Error(
        'REVIEW/UNKNOWN評価なのにReviewCase IDが返されませんでした。',
      );
    }
  } else if (persisted.review_case_id !== null) {
    throw new Error(
      'PASS/対象外評価なのにReviewCase IDが返されました。',
    );
  }

  return {
    controlResultId:
      persisted.control_result_id,
    reviewCaseId:
      persisted.review_case_id,
    evaluation,
  };
}
