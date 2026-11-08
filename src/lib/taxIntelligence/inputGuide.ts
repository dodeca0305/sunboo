import type { SupabaseClient } from '../supabase';
import type { CompanyProfile } from '../companyProfile';
import type { TaxReturnEntry } from '../taxReturnProfile';
import type { WorkspaceCompanyRow } from '../workspaceCompanyProfile';
import { loadExecutionProfile, loadExecutionTaxReturns } from './productionInputs.ts';
import { TI_TAX_001_EFFECTIVE_FROM } from './productionEvaluators.ts';

export type TaxInputStep = {
  kind: 'profile' | 'new-return' | 'filed-date' | 'complete' | 'outside-scope';
  title: string;
  reason: string;
  label: string;
  href: string;
};
export type TaxInputGuide = { status: 'unavailable' } | { status: 'loaded'; step: TaxInputStep };
type TaxInputEntry = Pick<TaxReturnEntry, 'id' | 'fiscalYearEndDate' | 'filedDate'>;

// Describes existing editor inputs, not tax liability or a new evaluation.
export function taxInputStep(companyId: number,
  profile: Pick<CompanyProfile, 'fiscalMonth'>,
  entries: TaxInputEntry[]): TaxInputStep {
  const base = `/admin/workspaces/${companyId}`;
  if (profile.fiscalMonth === null) return {
    kind: 'profile', title: '会社の決算月を入力してください', reason: '手続きの時期を案内するために使います。',
    label: '決算月の入力欄へ', href: `${base}/profile#company-profile-fiscalMonth`,
  };
  const latest = entries.reduce<TaxInputEntry | null>((previous, entry) =>
    !previous || entry.fiscalYearEndDate > previous.fiscalYearEndDate ? entry : previous, null);
  if (!latest) return {
    kind: 'new-return', title: '過去の申告書があれば、決算日を登録してください',
    reason: '過去の実績は未登録です。申告済みの実績がある場合だけ登録してください。',
    label: '決算日の入力欄へ', href: `${base}/tax-returns?entry=new&field=fiscalYearEndDate`,
  };
  if (latest.fiscalYearEndDate < TI_TAX_001_EFFECTIVE_FROM) return {
    kind: 'outside-scope', title: 'この決算期はチェックの対象外です',
    reason: `対象は${TI_TAX_001_EFFECTIVE_FROM}以降の決算日です。`,
    label: '登録済みの決算情報を見る', href: `${base}/tax-returns`,
  };
  if (latest.filedDate === null) return {
    kind: 'filed-date', title: '申告済みなら、申告日を入力してください',
    reason: `決算日 ${latest.fiscalYearEndDate} の申告日が未登録です。`,
    label: 'この決算期の申告日の入力欄へ', href: `${base}/tax-returns?entry=${encodeURIComponent(latest.id)}&field=filedDate`,
  };
  return {
    kind: 'complete', title: '申告日まで登録されています',
    reason: `決算日 ${latest.fiscalYearEndDate} ／ 申告日 ${latest.filedDate}`,
    label: '登録済みの決算情報を見る', href: `${base}/tax-returns`,
  };
}

export async function loadTaxInputGuide(client: SupabaseClient, company: WorkspaceCompanyRow): Promise<TaxInputGuide> {
  try {
    const [profile, returns] = await Promise.all([
      loadExecutionProfile(client, company), loadExecutionTaxReturns(client, company.id),
    ]);
    return { status: 'loaded', step: taxInputStep(company.id, profile, returns.entries) };
  } catch {
    return { status: 'unavailable' };
  }
}
