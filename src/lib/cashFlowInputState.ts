// 資金繰り4項目の「未入力」と「0円」を区別するための入力状態。
// DBスキーマには入力有無の列が無く、保存済みの0は既定値か明示入力か区別できない。
// そのため保存済み0は未入力扱いとし、再訪時は再入力が必要（この制約は意図的）。
export const CASH_FLOW_FIELDS = [
  'cashBalance',
  'expectedCashInflows',
  'expectedCashOutflows',
  'plannedTaxPayments',
] as const;

export type CashFlowField = (typeof CASH_FLOW_FIELDS)[number];
export type CashFlowInputState = Record<CashFlowField, number | null>;

export const CASH_FLOW_FIELD_LABELS: Record<CashFlowField, string> = {
  cashBalance: '現在の預金残高',
  expectedCashInflows: '今月の入金予定',
  expectedCashOutflows: '今月の支出予定',
  plannedTaxPayments: 'その他の納税予定',
};

export function isValidCashFlowValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function emptyCashFlowInputState(): CashFlowInputState {
  return {
    cashBalance: null,
    expectedCashInflows: null,
    expectedCashOutflows: null,
    plannedTaxPayments: null,
  };
}

// 読み込み済みの月データから初期化する。正の値だけを入力済みとみなし、0は未入力扱い。
export function initCashFlowInputState(
  entry: Partial<Record<CashFlowField, number>> | null | undefined,
): CashFlowInputState {
  const state = emptyCashFlowInputState();
  if (!entry) return state;
  for (const field of CASH_FLOW_FIELDS) {
    const value = entry[field];
    if (isValidCashFlowValue(value) && value > 0) state[field] = value;
  }
  return state;
}

export function updateCashFlowInput(
  state: CashFlowInputState,
  field: CashFlowField,
  value: number | null,
): CashFlowInputState {
  return { ...state, [field]: isValidCashFlowValue(value) ? value : null };
}

export function missingCashFlowFields(state: CashFlowInputState): CashFlowField[] {
  return CASH_FLOW_FIELDS.filter((field) => !isValidCashFlowValue(state[field]));
}

export function isCashFlowInputReady(state: CashFlowInputState): boolean {
  return missingCashFlowFields(state).length === 0;
}
