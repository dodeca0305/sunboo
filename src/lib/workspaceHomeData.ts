import { confirmedTaxPaymentPlanRows, LINKED_TAX_PLAN_COLUMNS } from './workspaceTaxPaymentPlan.ts';
import type { SupabaseClient } from './supabase';
import type { CompanyProfile } from './companyProfile';
import {
  workspaceRowsToCompanyProfile,
  type WorkspaceCompanyRow,
  type WorkspaceCompanyProfileRow,
} from './workspaceCompanyProfile.ts';
import { loadTaxReturnRowsForEditing, taxReturnDate } from './workspaceTaxReturnData.ts';
import { loadWorkspaceProcedureStatusesForEditing } from './workspaceProcedureStatusData.ts';
import {
  WORKSPACE_DOCUMENT_TYPES,
  WORKSPACE_DOCUMENT_STATUSES,
  type WorkspaceDocumentStatusMap,
} from './workspaceDocumentStatus.ts';
import {
  monthEndDate,
  type MonthlySalesRow,
  type DailySalesActivity,
} from './monthlySalesProgress.ts';
import {
  createWorkspaceReadGuard,
  workspaceRead,
  type WorkspaceReadResult,
} from './workspaceReadGuard.ts';
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const natural = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0;
const choices = (v: unknown, values: string[]) =>
  typeof v === 'string' && values.includes(v);
const optionalDate = (v: unknown) => v === null || taxReturnDate(v);
export function validHomeProfile(p: CompanyProfile) {
  return (
    natural(p.employeeCount) &&
    (p.capital === null || natural(p.capital)) &&
    optionalDate(p.establishedDate) &&
    optionalDate(p.nextOfficerChangeDate) &&
    choices(p.stage, [
      'pre_establishment',
      'first_term',
      'second_term_or_later',
    ]) &&
    choices(p.consumptionTaxStatus, ['exempt', 'taxable']) &&
    choices(p.invoiceRegistrationStatus, ['registered', 'not_registered']) &&
    (p.taxationMethod === null ||
      choices(p.taxationMethod, ['principle', 'simplified'])) &&
    choices(p.corporateTaxInterimFiling, ['none', 'has']) &&
    choices(p.consumptionTaxInterimFrequency, ['none', '1', '3', '11']) &&
    choices(p.withholdingTaxCycle, ['monthly', 'special_exception', 'unset']) &&
    choices(p.localTaxCollectionMethod, [
      'special_collection',
      'general_collection',
    ]) &&
    choices(p.residentTaxPaymentCycle, ['unknown', 'monthly', 'special']) &&
    typeof p.eTaxEnabled === 'boolean' &&
    typeof p.eLTaxEnabled === 'boolean' &&
    (p.address === null || typeof p.address === 'string') &&
    object(p.advisors) &&
    [
      'taxAccountant',
      'laborConsultant',
      'judicialScrivener',
      'administrativeScrivener',
    ].every(
      (k) => typeof p.advisors[k as keyof typeof p.advisors] === 'boolean',
    )
  );
}
export async function loadWorkspaceCompanyForRead(
  client: SupabaseClient | null,
  id: number,
): Promise<
  | { status: 'loaded'; company: WorkspaceCompanyRow }
  | { status: 'missing' | 'unavailable' }
> {
  if (!client) return { status: 'unavailable' };
  try {
    const r = await client
      .from('workspace_companies')
      .select(
        'id, name, prefecture_code, municipality_code, corporate_type, fiscal_month',
      )
      .eq('id', id)
      .maybeSingle();
    if (r.error || r.data === undefined) return { status: 'unavailable' };
    if (r.data === null) return { status: 'missing' };
    const c = r.data;
    if (
      !object(c) ||
      c.id !== id ||
      typeof c.name !== 'string' ||
      typeof c.prefecture_code !== 'string' ||
      typeof c.municipality_code !== 'string' ||
      !choices(c.corporate_type, ['kabushiki', 'godo']) ||
      !(
        c.fiscal_month === null ||
        (Number.isInteger(c.fiscal_month) &&
          Number(c.fiscal_month) >= 1 &&
          Number(c.fiscal_month) <= 12)
      )
    )
      return { status: 'unavailable' };
    return { status: 'loaded', company: c as WorkspaceCompanyRow };
  } catch {
    return { status: 'unavailable' };
  }
}
async function profile(client: SupabaseClient, company: WorkspaceCompanyRow) {
  const r = await Promise.all([
    client
      .from('workspace_company_profiles')
      .select('*')
      .eq('company_id', company.id)
      .maybeSingle(),
    client
      .from('prefectures')
      .select('name')
      .eq('code', company.prefecture_code)
      .maybeSingle(),
    client
      .from('municipalities')
      .select('name')
      .eq('code', company.municipality_code)
      .maybeSingle(),
  ]);
  if (r.some((x) => x.error || x.data === undefined)) throw Error();
  const [p, pref, muni] = r;
  if (p.data !== null && (!object(p.data) || p.data.company_id !== company.id))
    throw Error();
  if (
    (company.prefecture_code &&
      (!object(pref.data) || typeof pref.data.name !== 'string')) ||
    (company.municipality_code &&
      (!object(muni.data) || typeof muni.data.name !== 'string'))
  )
    throw Error();
  const value = workspaceRowsToCompanyProfile(
    company,
    p.data as WorkspaceCompanyProfileRow | null,
    pref.data?.name ?? '',
    muni.data?.name ?? '',
  );
  if (!validHomeProfile(value)) throw Error();
  return { profile: value, registered: p.data !== null };
}
export const HOME_MONTHLY_COLUMNS =
  'year_month,target_revenue,actual_revenue,target_gross_profit,actual_cost_of_sales,target_operating_profit,actual_fixed_costs,cash_balance,expected_cash_inflows,expected_cash_outflows,planned_tax_payments,action_goal,revenue_model,meeting_count,conversion_rate,average_contract_value,customer_count,purchase_frequency,average_order_value';
export async function loadWorkspaceHomeSources(
  client: SupabaseClient,
  company: WorkspaceCompanyRow,
  today: string,
) {
  const id = company.id,
    month = today.slice(0, 7);
  const [
    companyProfile,
    taxReturns,
    procedureStatuses,
    documents,
    daily,
    monthly,
    taxPlans,
  ] = await Promise.all([
    workspaceRead(() => profile(client, company)),
    workspaceRead(async () => {
      const guard = createWorkspaceReadGuard(client, id);
      const rows = await loadTaxReturnRowsForEditing(guard.client, id);
      if (rows === null || guard.failed()) throw Error();
      return rows;
    }),
    workspaceRead(async () => {
      const g = createWorkspaceReadGuard(client, id);
      const rows = await loadWorkspaceProcedureStatusesForEditing(g.client, id);
      if (rows === null || g.failed()) throw Error();
      return rows;
    }),
    workspaceRead(async () => {
      const r = await client
        .from('workspace_documents')
        .select('document_type,status')
        .eq('company_id', id);
      if (
        r.error ||
        !Array.isArray(r.data) ||
        r.data.some(
          (x) =>
            !object(x) ||
            !WORKSPACE_DOCUMENT_TYPES.includes(x.document_type) ||
            !WORKSPACE_DOCUMENT_STATUSES.includes(x.status),
        ) ||
        new Set(r.data.map((x) => x.document_type)).size !== r.data.length
      )
        throw Error();
      return {
        statusMap: Object.fromEntries(
          r.data.map((x) => [x.document_type, x.status]),
        ) as WorkspaceDocumentStatusMap,
        needsUpdateCount: r.data.filter((x) => x.status === 'needs_update')
          .length,
      };
    }),
    workspaceRead(async () => {
      const r = await client
        .from('workspace_daily_sales_activities')
        .select(
          'activity_date,target_units,actual_units,action_plan,outcome_review',
        )
        .eq('company_id', id)
        .eq('activity_date', today)
        .maybeSingle();
      if (r.error || r.data === undefined) throw Error();
      if (r.data === null) return null;
      const v = r.data;
      if (
        !object(v) ||
        v.activity_date !== today ||
        !natural(v.target_units) ||
        !natural(v.actual_units) ||
        typeof v.action_plan !== 'string' ||
        !(v.outcome_review === null || typeof v.outcome_review === 'string')
      )
        throw Error();
      return {
        activityDate: v.activity_date,
        targetUnits: v.target_units,
        actualUnits: v.actual_units,
        actionPlan: v.action_plan,
        outcomeReview: v.outcome_review ?? '',
      } as DailySalesActivity;
    }),
    workspaceRead(async () => {
      const r = await client
        .from('workspace_monthly_sales')
        .select(HOME_MONTHLY_COLUMNS)
        .eq('company_id', id)
        .eq('year_month', month + '-01')
        .maybeSingle();
      if (r.error || r.data === undefined) throw Error();
      if (r.data === null) return null;
      const v = r.data;
      if (
        !object(v) ||
        v.year_month !== month + '-01' ||
        typeof v.action_goal !== 'string' ||
        !(
          v.revenue_model === null ||
          choices(v.revenue_model, ['sales_funnel', 'customer_repeat'])
        ) ||
        HOME_MONTHLY_COLUMNS.split(',')
          .filter(
            (k) => !['year_month', 'action_goal', 'revenue_model'].includes(k),
          )
          .some((k) => !number((v as Record<string, unknown>)[k]))
      )
        throw Error();
      return v as MonthlySalesRow;
    }),
    workspaceRead(async () => {
      const r = await client
        .from('workspace_tax_payment_plans')
        .select(LINKED_TAX_PLAN_COLUMNS)
        .eq('company_id', id)
        .gte('due_date', month + '-01')
        .lte('due_date', monthEndDate(month));
      if (
        r.error ||
        !Array.isArray(r.data) ||
        r.data.length >= 1000 ||
        r.data.some(
          (v) =>
            !object(v) ||
            !natural(v.procedure_id) ||
            v.procedure_id === 0 ||
            typeof v.due_date !== 'string' || !taxReturnDate(v.due_date) ||
            v.due_date < month + '-01' ||
            v.due_date > monthEndDate(month) ||
            !natural(v.amount),
        )
      )
        throw Error();
      let total = 0;
      const keys = new Set<string>();
      for (const row of confirmedTaxPaymentPlanRows(r.data)) {
        const key = row.procedure_id + ':' + row.due_date;
        if (keys.has(key)) throw Error();
        keys.add(key);
        total += row.amount;
        if (!Number.isSafeInteger(total)) throw Error();
      }
      return total;
    }),
  ]);
  return {
    companyProfile,
    taxReturns,
    procedureStatuses,
    documents,
    daily,
    monthly,
    taxPlans,
  };
}
export type WorkspaceHomeSources = Awaited<
  ReturnType<typeof loadWorkspaceHomeSources>
>;
export async function loadWorkspaceHomeDerived<T>(
  client: SupabaseClient,
  s: WorkspaceHomeSources,
  reviewAvailable: boolean,
  build: (
    client: SupabaseClient,
    inputs: {
      companyProfile: CompanyProfile;
      taxReturnProfile: {
        entries: import('./taxReturnProfile').TaxReturnEntry[];
      };
      procedureStatusMap: import('./workspaceProcedureStatus').WorkspaceProcedureStatusMap;
    },
  ) => Promise<T>,
): Promise<WorkspaceReadResult<T>> {
  if (
    !reviewAvailable ||
    s.daily.status !== 'loaded' ||
    s.companyProfile.status !== 'loaded' ||
    s.taxReturns.status !== 'loaded' ||
    s.procedureStatuses.status !== 'loaded' ||
    s.documents.status !== 'loaded' ||
    s.monthly.status !== 'loaded' ||
    s.taxPlans.status !== 'loaded'
  )
    return { status: 'unavailable' };
  const guard = createWorkspaceReadGuard(client);
  const profile = s.companyProfile.value.profile,
    rows = s.taxReturns.value,
    statuses = s.procedureStatuses.value;
  return workspaceRead(async () => {
    const { workspaceRowsToTaxReturnProfile } = await import(
      './workspaceTaxReturnProfile.ts'
    );
    const value = await build(guard.client, {
      companyProfile: profile,
      taxReturnProfile: workspaceRowsToTaxReturnProfile(rows),
      procedureStatusMap: statuses,
    });
    if (guard.failed()) throw Error('Incomplete roadmap');
    return value;
  });
}
