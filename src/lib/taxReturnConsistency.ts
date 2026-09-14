import type { CompanyProfile } from './companyProfile';
import type { TaxReturnEntry } from './taxReturnProfile';

export type TaxReturnConsistencyIssue = {
  field: 'consumptionTaxStatus' | 'invoiceRegistrationStatus' | 'fiscalMonth';
  message: string;
};

const CONSUMPTION_TAX_LABEL = {
  exempt: '免税事業者',
  taxable: '課税事業者',
} as const;

const INVOICE_LABEL = {
  not_registered: '未登録',
  registered: '登録済み',
} as const;

/**
 * 会社プロフィールと保存した決算実績の食い違いを検出する。
 * 申告実績を自動的に正とはせず、利用者が確認できる警告だけを返す。
 */
export function detectTaxReturnConsistencyIssues(
  profile: CompanyProfile,
  entry: TaxReturnEntry,
): TaxReturnConsistencyIssue[] {
  const issues: TaxReturnConsistencyIssue[] = [];

  if (profile.consumptionTaxStatus !== entry.consumptionTaxStatus) {
    issues.push({
      field: 'consumptionTaxStatus',
      message: `消費税ステータスが、会社プロフィールの「${CONSUMPTION_TAX_LABEL[profile.consumptionTaxStatus]}」と申告実績の「${CONSUMPTION_TAX_LABEL[entry.consumptionTaxStatus]}」で異なります。`,
    });
  }

  if (profile.invoiceRegistrationStatus !== entry.invoiceRegistrationStatus) {
    issues.push({
      field: 'invoiceRegistrationStatus',
      message: `インボイス登録状況が、会社プロフィールの「${INVOICE_LABEL[profile.invoiceRegistrationStatus]}」と申告実績の「${INVOICE_LABEL[entry.invoiceRegistrationStatus]}」で異なります。`,
    });
  }

  const fiscalMonth = Number(entry.fiscalYearEndDate.slice(5, 7));
  if (
    profile.fiscalMonth !== null &&
    Number.isInteger(fiscalMonth) &&
    fiscalMonth >= 1 &&
    fiscalMonth <= 12 &&
    profile.fiscalMonth !== fiscalMonth
  ) {
    issues.push({
      field: 'fiscalMonth',
      message: `決算月が、会社プロフィールの「${profile.fiscalMonth}月」と申告実績の決算日「${fiscalMonth}月」で異なります。`,
    });
  }

  return issues;
}
