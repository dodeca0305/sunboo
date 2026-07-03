export const OFFICE_TYPES: { value: string; label: string }[] = [
  { value: 'tax_office', label: '税務署' },
  { value: 'prefectural_tax', label: '都道府県税' },
  { value: 'municipal_tax', label: '市区町村税' },
  { value: 'pension_office', label: '年金事務所' },
  { value: 'labor_standards', label: '労基署' },
  { value: 'hello_work', label: 'ハローワーク' },
];

export const LINK_STATUSES: { value: string; label: string }[] = [
  { value: 'unchecked', label: '未確認' },
  { value: 'ok', label: '正常' },
  { value: 'broken', label: 'リンク切れ' },
  { value: 'redirected', label: 'リダイレクト' },
];

export const PROCEDURE_CATEGORIES: { value: string; label: string }[] = [
  { value: 'tax', label: '税務' },
  { value: 'labor', label: '労務' },
  { value: 'insurance', label: '社保' },
  { value: 'registration', label: '登録' },
  { value: 'other', label: 'その他' },
];

export const TIMING_TYPES: { value: string; label: string }[] = [
  { value: 'at_establishment', label: '設立時イベント起算（期限自動計算なし）' },
  { value: 'hiring_event', label: '雇用時イベント起算（期限自動計算なし）' },
  { value: 'fiscal_offset', label: '決算月からのオフセット（{"months": 数値}）' },
  { value: 'fixed_date', label: '毎年固定日（{"month": 月, "day": 日}）' },
  { value: 'period', label: '毎年期間（{"startMonth","startDay","endMonth","endDay"}）' },
  { value: 'monthly_10th', label: '毎月10日' },
];

export function officeTypeLabel(value: string): string {
  return OFFICE_TYPES.find((o) => o.value === value)?.label ?? value;
}

export function linkStatusLabel(value: string | null | undefined): string {
  return LINK_STATUSES.find((s) => s.value === (value ?? 'unchecked'))?.label ?? '未確認';
}
