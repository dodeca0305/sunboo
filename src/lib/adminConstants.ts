export const OFFICE_TYPES: { value: string; label: string }[] = [
  { value: 'tax_office', label: '税務署' },
  { value: 'prefectural_tax', label: '都道府県税' },
  { value: 'municipal_tax', label: '市区町村税' },
  { value: 'pension_office', label: '年金事務所' },
  { value: 'labor_standards', label: '労基署' },
  { value: 'hello_work', label: 'ハローワーク' },
  { value: 'legal_affairs_bureau', label: '法務局' },
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
  { value: 'legal', label: '法務・登記' },
  { value: 'other', label: 'その他' },
];

export const TIMING_TYPES: { value: string; label: string }[] = [
  { value: 'at_establishment', label: '設立時イベント起算（期限自動計算なし）' },
  { value: 'hiring_event', label: '雇用時イベント起算（期限自動計算なし）' },
  { value: 'event_based', label: '任意イベント起算（期限自動計算なし）' },
  { value: 'fiscal_offset', label: '決算月からのオフセット（{"months": 数値}）' },
  { value: 'fixed_date', label: '毎年固定日（{"month": 月, "day": 日}）' },
  { value: 'period', label: '毎年期間（{"startMonth","startDay","endMonth","endDay"}）' },
  { value: 'monthly_10th', label: '毎月10日' },
];

export const CORPORATE_TYPES: { value: string; label: string }[] = [
  { value: '', label: '未指定（両方に適用）' },
  { value: 'kabushiki', label: '株式会社のみ' },
  { value: 'godo', label: '合同会社のみ' },
];

export function officeTypeLabel(value: string): string {
  return OFFICE_TYPES.find((o) => o.value === value)?.label ?? value;
}

export function linkStatusLabel(value: string | null | undefined): string {
  return LINK_STATUSES.find((s) => s.value === (value ?? 'unchecked'))?.label ?? '未確認';
}

// ── ルールエンジン（Phase 2.5）─────────────────────────────────
// field はここに無い値も自由に入力できる（ルール追加だけで新しい条件を使えるようにするため）。
// これらは入力補助のための「よく使う候補」に過ぎない。
export const RULE_CONDITION_FIELDS: { value: string; label: string }[] = [
  { value: 'event_type_code', label: 'イベント種別（company_establishment / employee_hired / officer_change）' },
  { value: 'corporate_type', label: '法人種別（kabushiki / godo）' },
  { value: 'has_employees', label: '従業員の有無（true / false）' },
  { value: 'prefecture_code', label: '都道府県コード（例: 40 = 福岡県、13 = 東京都）' },
];

export const RULE_OPERATORS: { value: string; label: string }[] = [
  { value: 'eq', label: '等しい（eq）' },
  { value: 'neq', label: '等しくない（neq）' },
  { value: 'in', label: 'いずれかに含まれる（in、値は配列）' },
  { value: 'not_in', label: 'いずれにも含まれない（not_in、値は配列）' },
  { value: 'gt', label: 'より大きい（gt）' },
  { value: 'gte', label: '以上（gte）' },
  { value: 'lt', label: 'より小さい（lt）' },
  { value: 'lte', label: '以下（lte）' },
];

export const RULE_ACTION_TYPES: { value: string; label: string; hint: string }[] = [
  { value: 'add_procedure', label: '必要手続きを追加', hint: '対象手続きを選択してください（実行内容データは不要）' },
  { value: 'show_warning', label: '警告を表示', hint: '実行内容データ（JSON）例: {"message": "文言", "severity": "info"}（severityはinfoかwarning）' },
  { value: 'change_office', label: '提出先を変更', hint: '対象手続きを選択し、実行内容データ（JSON）例: {"office_type": "prefectural_tax"}' },
  { value: 'change_deadline', label: '期限を変更', hint: '対象手続きを選択し、実行内容データ（JSON）例: {"days_from_event": 30}' },
];

export function ruleOperatorLabel(value: string): string {
  return RULE_OPERATORS.find((o) => o.value === value)?.label ?? value;
}

export function ruleActionTypeLabel(value: string): string {
  return RULE_ACTION_TYPES.find((a) => a.value === value)?.label ?? value;
}
