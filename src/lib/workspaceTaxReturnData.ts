import type { SupabaseClient } from './supabase';
import type { WorkspaceCompanyRow } from './workspaceCompanyProfile';
import { loadWorkspaceProfileForEditing } from './workspaceProfileData.ts';
import {
  type WorkspaceTaxReturnProfileRow,
  type WorkspaceTaxReturnEntryWritePayload,
} from './workspaceTaxReturnProfile.ts';
import {
  TAXABLE_SALES_BUCKETS,
  CORPORATE_TAX_BUCKETS,
  CONSUMPTION_TAX_BUCKETS,
} from './taxReturnProfile.ts';
const positiveId = (v: unknown): v is number =>
  Number.isSafeInteger(v) && Number(v) > 0;
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const nonnegative = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0;
const timestamp = (v: unknown) =>
  typeof v === 'string' && Number.isFinite(Date.parse(v));
export function taxReturnDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 10) === v;
}
function amount(v: unknown, buckets: readonly { id: string }[]) {
  if (v === null) return true;
  if (!record(v)) return false;
  return v.precision === 'exact'
    ? (v.exactValue === null || nonnegative(v.exactValue)) &&
        v.rangeBucketId === null
    : v.precision === 'range' &&
        v.exactValue === null &&
        (v.rangeBucketId === null ||
          buckets.some((b) => b.id === v.rangeBucketId));
}
export function validTaxReturnPayload(
  v: unknown,
): v is WorkspaceTaxReturnEntryWritePayload {
  if (!record(v)) return false;
  return (
    typeof v.fiscal_year === 'string' &&
    v.fiscal_year.trim() !== '' &&
    taxReturnDate(v.fiscal_year_end_date) &&
    (v.fiscal_year_start_date === null ||
      taxReturnDate(v.fiscal_year_start_date)) &&
    (v.filed_date === null || taxReturnDate(v.filed_date)) &&
    (v.capital_at_filing === null || nonnegative(v.capital_at_filing)) &&
    (v.employee_count_at_fiscal_year_end === null ||
      nonnegative(v.employee_count_at_fiscal_year_end)) &&
    amount(v.taxable_sales_amount, TAXABLE_SALES_BUCKETS) &&
    amount(v.corporate_tax_amount, CORPORATE_TAX_BUCKETS) &&
    amount(v.consumption_tax_amount, CONSUMPTION_TAX_BUCKETS) &&
    ['exempt', 'taxable'].includes(String(v.consumption_tax_status)) &&
    (v.taxation_method === null ||
      ['principle', 'simplified'].includes(String(v.taxation_method))) &&
    ['registered', 'not_registered'].includes(
      String(v.invoice_registration_status),
    ) &&
    ['none', 'has'].includes(String(v.corporate_tax_interim_filing_actual)) &&
    ['none', '1', '3', '11'].includes(
      String(v.consumption_tax_interim_frequency_actual),
    ) &&
    typeof v.financial_statement_published === 'boolean' &&
    (v.withholding_tax_cycle_actual === null ||
      ['monthly', 'special_exception'].includes(
        String(v.withholding_tax_cycle_actual),
      ))
  );
}
export function validTaxReturnRow(
  v: unknown,
  companyId: number,
): v is WorkspaceTaxReturnProfileRow {
  return (
    record(v) &&
    positiveId(v.id) &&
    v.company_id === companyId &&
    timestamp(v.created_at) &&
    timestamp(v.updated_at) &&
    validTaxReturnPayload(v)
  );
}
export async function loadTaxReturnRowsForEditing(
  client: Pick<SupabaseClient, 'from'>,
  companyId: number,
): Promise<WorkspaceTaxReturnProfileRow[] | null> {
  try {
    const rows: WorkspaceTaxReturnProfileRow[] = [];
    const ids = new Set<number>(),
      dates = new Set<string>();
    for (let offset = 0; ; offset += 1000) {
      const r = await client
        .from('workspace_tax_return_profiles')
        .select('*')
        .eq('company_id', companyId)
        .order('id')
        .range(offset, offset + 999);
      if (r.error || !Array.isArray(r.data)) return null;
      for (const row of r.data) {
        if (
          !validTaxReturnRow(row, companyId) ||
          ids.has(row.id) ||
          dates.has(row.fiscal_year_end_date)
        )
          return null;
        ids.add(row.id);
        dates.add(row.fiscal_year_end_date);
        rows.push(row);
      }
      if (r.data.length < 1000) return rows;
    }
  } catch {
    return null;
  }
}
export async function loadTaxReturnEditor(
  client: Pick<SupabaseClient, 'from'> | null,
  companyId: number,
) {
  if (!client) return { status: 'unavailable' as const };
  try {
    const c = await client
      .from('workspace_companies')
      .select(
        'id, name, prefecture_code, municipality_code, corporate_type, fiscal_month',
      )
      .eq('id', companyId)
      .maybeSingle();
    if (c.error || c.data === undefined)
      return { status: 'unavailable' as const };
    if (c.data === null) return { status: 'missing' as const };
    if (
      !record(c.data) ||
      c.data.id !== companyId ||
      typeof c.data.name !== 'string' ||
      !['kabushiki', 'godo'].includes(String(c.data.corporate_type)) ||
      typeof c.data.prefecture_code !== 'string' ||
      typeof c.data.municipality_code !== 'string' ||
      !(
        c.data.fiscal_month === null ||
        (Number.isInteger(c.data.fiscal_month) &&
          Number(c.data.fiscal_month) >= 1 &&
          Number(c.data.fiscal_month) <= 12)
      )
    )
      return { status: 'unavailable' as const };
    const company = c.data as WorkspaceCompanyRow;
    const [companyProfile, rows] = await Promise.all([
      loadWorkspaceProfileForEditing(client, company),
      loadTaxReturnRowsForEditing(client, companyId),
    ]);
    if (
      !companyProfile ||
      rows === null ||
      !nonnegative(companyProfile.employeeCount) ||
      !['exempt', 'taxable'].includes(companyProfile.consumptionTaxStatus) ||
      !['registered', 'not_registered'].includes(
        companyProfile.invoiceRegistrationStatus,
      )
    )
      return { status: 'unavailable' as const };
    return { status: 'loaded' as const, company, companyProfile, rows };
  } catch {
    return { status: 'unavailable' as const };
  }
}
export function taxReturnPayload(
  row: WorkspaceTaxReturnProfileRow,
): WorkspaceTaxReturnEntryWritePayload {
  // Explicitly pick the writable keys so response metadata never enters comparisons or writes.
  const {
    fiscal_year,
    fiscal_year_start_date,
    fiscal_year_end_date,
    filed_date,
    capital_at_filing,
    taxable_sales_amount,
    consumption_tax_status,
    taxation_method,
    invoice_registration_status,
    corporate_tax_amount,
    consumption_tax_amount,
    corporate_tax_interim_filing_actual,
    consumption_tax_interim_frequency_actual,
    financial_statement_published,
    withholding_tax_cycle_actual,
    employee_count_at_fiscal_year_end,
  } = row;
  return {
    fiscal_year,
    fiscal_year_start_date,
    fiscal_year_end_date,
    filed_date,
    capital_at_filing,
    taxable_sales_amount,
    consumption_tax_status,
    taxation_method,
    invoice_registration_status,
    corporate_tax_amount,
    consumption_tax_amount,
    corporate_tax_interim_filing_actual,
    consumption_tax_interim_frequency_actual,
    financial_statement_published,
    withholding_tax_cycle_actual,
    employee_count_at_fiscal_year_end,
  };
}
export function taxReturnCanonical(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(taxReturnCanonical).join(',') + ']';
  if (record(v))
    return (
      '{' +
      Object.keys(v)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + taxReturnCanonical(v[k]))
        .join(',') +
      '}'
    );
  return JSON.stringify(v) ?? 'null';
}
export type TaxReturnSaveIntent =
  | {
      version: 1;
      companyId: number;
      id: number | null;
      kind: 'save';
      payload: WorkspaceTaxReturnEntryWritePayload;
    }
  | { version: 1; companyId: number; id: number; kind: 'delete' };
export function validTaxReturnIntent(
  v: unknown,
  companyId: number,
): v is TaxReturnSaveIntent {
  return (
    positiveId(companyId) &&
    record(v) &&
    v.version === 1 &&
    v.companyId === companyId &&
    (v.kind === 'delete'
      ? positiveId(v.id)
      : v.kind === 'save' &&
        (v.id === null || positiveId(v.id)) &&
        validTaxReturnPayload(v.payload))
  );
}
export function reconcileTaxReturnIntent(
  rows: WorkspaceTaxReturnProfileRow[],
  intent: TaxReturnSaveIntent,
): 'saved' | 'different' {
  if (intent.kind === 'delete')
    return rows.some((r) => r.id === intent.id) ? 'different' : 'saved';
  const row = rows.find((r) =>
    intent.id === null
      ? r.fiscal_year_end_date === intent.payload.fiscal_year_end_date
      : r.id === intent.id,
  );
  return row &&
    taxReturnCanonical(taxReturnPayload(row)) ===
      taxReturnCanonical(intent.payload)
    ? 'saved'
    : 'different';
}
export async function saveTaxReturn(
  client: SupabaseClient,
  intent: TaxReturnSaveIntent,
  updatedAt?: string,
): Promise<WorkspaceTaxReturnProfileRow | null> {
  try {
    if (!validTaxReturnIntent(intent, intent.companyId)) return null;
    let query;
    if (intent.kind === 'delete') {
      if (!updatedAt) return null;
      query = client
        .from('workspace_tax_return_profiles')
        .delete()
        .eq('company_id', intent.companyId)
        .eq('id', intent.id)
        .eq('updated_at', updatedAt);
    } else if (intent.id === null)
      query = client
        .from('workspace_tax_return_profiles')
        .insert({ company_id: intent.companyId, ...intent.payload });
    else {
      if (!updatedAt) return null;
      query = client
        .from('workspace_tax_return_profiles')
        .update(intent.payload)
        .eq('company_id', intent.companyId)
        .eq('id', intent.id)
        .eq('updated_at', updatedAt);
    }
    const r = await query.select('*').single();
    if (
      r.error ||
      !validTaxReturnRow(r.data, intent.companyId) ||
      (intent.id !== null && r.data.id !== intent.id)
    )
      return null;
    if (
      intent.kind === 'save' &&
      taxReturnCanonical(taxReturnPayload(r.data)) !==
        taxReturnCanonical(intent.payload)
    )
      return null;
    return r.data;
  } catch {
    return null;
  }
}
