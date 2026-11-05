import type { WithholdingTaxCycle, ResidentTaxPaymentCycle } from './companyProfile';

// 表示だけを統一。国税と地方税の値・承認・期限の違いを混ぜない。
export const WITHHOLDING_CYCLE_LABEL: Record<WithholdingTaxCycle, string> = {
  monthly: '毎月納める',
  special_exception: '年2回まとめて納める（納期の特例）',
  unset: 'わからない・未確認',
};
export const RESIDENT_TAX_CYCLE_LABEL: Record<ResidentTaxPaymentCycle, string> = {
  monthly: '毎月納める',
  special: '年2回まとめて納める（自治体の承認済み）',
  unknown: 'わからない・未確認',
};
export const WITHHOLDING_FREQUENCY_TITLE = '源泉所得税を納める回数';
export const RESIDENT_TAX_FREQUENCY_TITLE = '住民税（給与から天引きする分）を納める回数';
export const WITHHOLDING_FREQUENCY_HELP = '年2回まとめて納めるのは、税務署への申請による「納期の特例」を利用している場合です。分からない場合は「わからない・未確認」のまま、納付書や税理士に確認してください。';
export const RESIDENT_TAX_FREQUENCY_HELP = '年2回まとめて納めるのは、市区町村への申請が承認されている場合です。従業員数だけでは選べません。未承認・未確認の場合は「わからない・未確認」のままにしてください。';
