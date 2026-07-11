import type {
  ConsumptionTaxInterimFrequency, ConsumptionTaxStatus, InterimFilingStatus,
  InvoiceRegistrationStatus, TaxationMethod,
} from './companyProfile';
import type { AmountValue, TaxReturnEntry, TaxReturnProfile } from './taxReturnProfile';

// ── Company Workspace — TaxReturnProfile境界変換（Sprint 35）─────────────
// workspace_tax_return_profiles（Sprint35 migration）のDB行と、既存の TaxReturnProfile /
// TaxReturnEntry 型（src/lib/taxReturnProfile.ts、(site)側でlocalStorage運用中）を相互変換する
// 境界関数。TaxReturnEntry型自体・既存Engine（Timeline Producer・State Engine）は一切変更しない
// （workspaceCompanyProfile.tsと同じ設計方針）。
//
// id型の差異のみ吸収する： DB行は SERIAL（number）、TaxReturnEntry.id は string（(site)側は
// crypto.randomUUID()を使うため）。Workspace側ではDBのidをそのまま文字列化して使う。

export type WorkspaceTaxReturnProfileRow = {
  id: number;
  company_id: number;
  fiscal_year: string;
  fiscal_year_start_date: string | null;
  fiscal_year_end_date: string;
  filed_date: string | null;
  capital_at_filing: number | null;
  taxable_sales_amount: AmountValue | null;
  consumption_tax_status: string;
  taxation_method: string | null;
  invoice_registration_status: string;
  corporate_tax_amount: AmountValue | null;
  consumption_tax_amount: AmountValue | null;
  corporate_tax_interim_filing_actual: string;
  consumption_tax_interim_frequency_actual: string;
  financial_statement_published: boolean;
  withholding_tax_cycle_actual: string | null;
  employee_count_at_fiscal_year_end: number | null;
  created_at: string;
  updated_at: string;
};

// DB行[] → TaxReturnProfile（読み取り）。行が0件（まだ決算実績が無い会社）でも
// 有効な空のTaxReturnProfileを返す（taxReturnProfile.tsのloadTaxReturnProfileと同じ契約）。
export function workspaceRowsToTaxReturnProfile(rows: WorkspaceTaxReturnProfileRow[]): TaxReturnProfile {
  const entries: TaxReturnEntry[] = rows
    .map((row) => ({
      id: String(row.id),
      fiscalYear: row.fiscal_year,
      fiscalYearStartDate: row.fiscal_year_start_date,
      fiscalYearEndDate: row.fiscal_year_end_date,
      filedDate: row.filed_date,
      capitalAtFiling: row.capital_at_filing,
      taxableSalesAmount: row.taxable_sales_amount,
      consumptionTaxStatus: row.consumption_tax_status as ConsumptionTaxStatus,
      taxationMethod: row.taxation_method as TaxationMethod | null,
      invoiceRegistrationStatus: row.invoice_registration_status as InvoiceRegistrationStatus,
      corporateTaxAmount: row.corporate_tax_amount,
      consumptionTaxAmount: row.consumption_tax_amount,
      corporateTaxInterimFilingActual: row.corporate_tax_interim_filing_actual as InterimFilingStatus,
      consumptionTaxInterimFrequencyActual: row.consumption_tax_interim_frequency_actual as ConsumptionTaxInterimFrequency,
      financialStatementPublished: row.financial_statement_published,
      withholdingTaxCycleActual: row.withholding_tax_cycle_actual as 'monthly' | 'special_exception' | null,
      employeeCountAtFiscalYearEnd: row.employee_count_at_fiscal_year_end,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
    .sort((a, b) => a.fiscalYearEndDate.localeCompare(b.fiscalYearEndDate));

  return { entries };
}

export type WorkspaceTaxReturnEntryWritePayload = Omit<WorkspaceTaxReturnProfileRow, 'id' | 'company_id' | 'created_at' | 'updated_at'>;

// TaxReturnEntryの入力欄（id/createdAt/updatedAtを除く）→ DB書き込みpayload。
// 新規作成・更新のいずれもこの形をそのままinsert/updateに渡せる。
export function taxReturnEntryDraftToWorkspaceWritePayload(
  draft: Omit<TaxReturnEntry, 'id' | 'createdAt' | 'updatedAt'>,
): WorkspaceTaxReturnEntryWritePayload {
  return {
    fiscal_year: draft.fiscalYear,
    fiscal_year_start_date: draft.fiscalYearStartDate,
    fiscal_year_end_date: draft.fiscalYearEndDate,
    filed_date: draft.filedDate,
    capital_at_filing: draft.capitalAtFiling,
    taxable_sales_amount: draft.taxableSalesAmount,
    consumption_tax_status: draft.consumptionTaxStatus,
    taxation_method: draft.taxationMethod,
    invoice_registration_status: draft.invoiceRegistrationStatus,
    corporate_tax_amount: draft.corporateTaxAmount,
    consumption_tax_amount: draft.consumptionTaxAmount,
    corporate_tax_interim_filing_actual: draft.corporateTaxInterimFilingActual,
    consumption_tax_interim_frequency_actual: draft.consumptionTaxInterimFrequencyActual,
    financial_statement_published: draft.financialStatementPublished,
    withholding_tax_cycle_actual: draft.withholdingTaxCycleActual,
    employee_count_at_fiscal_year_end: draft.employeeCountAtFiscalYearEnd,
  };
}
