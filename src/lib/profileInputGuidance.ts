import type { CompanyProfile } from './companyProfile';

// 入力案内だけに使う。判定基準・保存可否・初期値は変更しない。
export const PROFILE_GUIDANCE_FIELDS = [
  { key: 'fiscalMonth', label: '決算月', reason: '手続きの時期を案内するため' },
  { key: 'establishedDate', label: '設立日', reason: '設立からの期間を確認するため' },
  { key: 'capital', label: '資本金', reason: '会社の基本情報として案内に使うため' },
] as const;
export type MissingProfileInput = typeof PROFILE_GUIDANCE_FIELDS[number];
export const profileInputId = (key: string) => `company-profile-${key}`;
export function missingProfileInputs(profile: Pick<CompanyProfile, 'fiscalMonth' | 'establishedDate' | 'capital'>): MissingProfileInput[] {
  // 読み取り失敗を渡さないこと。正常に取得したnullだけを未入力とする。
  return PROFILE_GUIDANCE_FIELDS.filter(field => profile[field.key] === null);
}
