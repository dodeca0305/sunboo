// 決算見込（会社・年度ごとの試算）。純粋な検証と計算だけを持つ。
// 税額の計算ではない。税金・償却費は入力された仮定のまま扱い、申告・実績・月次・共有には一切つなげない。
export const FORECAST_MAX = 9007199254740991;
export const FORECAST_MAX_SPAN_DAYS = 731;

export const FORECAST_MONEY_KEYS = [
  'sales', 'cogs', 'opex', 'other_income', 'other_expense', 'special_gain', 'special_loss', 'tax_expense',
  'opening_cash', 'opening_retained_earnings', 'capital', 'borrowing', 'collections', 'cogs_paid', 'opex_paid', 'tax_paid', 'equipment',
] as const;
export type ForecastMoneyKey = (typeof FORECAST_MONEY_KEYS)[number];
export type ForecastInputs = Record<ForecastMoneyKey, number | null>;
export type ForecastValues = ForecastInputs & { is_fictional: boolean };
export type ForecastKey = { fiscal_start: string; fiscal_end: string; scenario_name: string };
export type ForecastSnapshot = ForecastKey & ForecastValues & { version: number; updated_at: string };

export const FORECAST_FIELD_LABEL: Record<ForecastMoneyKey, string> = {
  sales: '売上高', cogs: '売上原価', opex: '販売費・一般管理費', other_income: '営業外収益', other_expense: '営業外費用',
  special_gain: '特別利益', special_loss: '特別損失', tax_expense: '税金費用（仮定）',
  opening_cash: '期首の現金預金', opening_retained_earnings: '期首の繰越利益（マイナス可）', capital: '資本金', borrowing: '新規借入',
  collections: '売上の入金額', cogs_paid: '売上原価の支払額', opex_paid: '経費の支払額', tax_paid: '税金の支払額（仮定）', equipment: '設備の購入額',
};

export const emptyForecastInputs = (): ForecastInputs =>
  Object.fromEntries(FORECAST_MONEY_KEYS.map(k => [k, null])) as ForecastInputs;
export const emptyForecastValues = (): ForecastValues => ({ ...emptyForecastInputs(), is_fictional: false });

export function validForecastDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 10) === v;
}
export function validForecastPeriod(start: unknown, end: unknown): boolean {
  if (!validForecastDate(start) || !validForecastDate(end)) return false;
  if (start < '2000-01-01' || end > '2100-12-31' || start > end) return false;
  return (Date.parse(end + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86400000 <= FORECAST_MAX_SPAN_DAYS;
}
export function validScenarioName(v: unknown): v is string {
  return typeof v === 'string' && v === v.trim() && [...v].length >= 1 && [...v].length <= 60 && !/[\u0000-\u001f\u007f-\u009f]/.test(v);
}
export function validForecastMoney(key: ForecastMoneyKey, v: unknown): v is number | null {
  if (v === null) return true;
  if (typeof v !== 'number' || !Number.isSafeInteger(v)) return false;
  return key === 'opening_retained_earnings' ? true : v >= 0;
}
export function validForecastKey(v: unknown): v is ForecastKey {
  const r = v as Record<string, unknown> | null;
  return !!r && typeof r === 'object' && validForecastPeriod(r.fiscal_start, r.fiscal_end) && validScenarioName(r.scenario_name);
}
export function validForecastValues(v: unknown): v is ForecastValues {
  const r = v as Record<string, unknown> | null;
  return !!r && typeof r === 'object' && !Array.isArray(r) && typeof r.is_fictional === 'boolean'
    && FORECAST_MONEY_KEYS.every(k => validForecastMoney(k, r[k]));
}
export const forecastValues = (v: ForecastValues): ForecastValues =>
  ({ ...Object.fromEntries(FORECAST_MONEY_KEYS.map(k => [k, v[k]])), is_fictional: v.is_fictional }) as ForecastValues;
export const sameForecastValues = (a: ForecastValues, b: ForecastValues) =>
  JSON.stringify(forecastValues(a)) === JSON.stringify(forecastValues(b));
export const forecastKeyId = (k: ForecastKey) => `${k.fiscal_start}|${k.fiscal_end}|${k.scenario_name}`;

// 登録済みの決算月から「提案」する期間。決算月が未登録なら空（日付を勝手に仮定しない）。
export function proposeForecastPeriod(fiscalMonth: number | null, today: string): { start: string; end: string } | null {
  if (fiscalMonth === null || !Number.isInteger(fiscalMonth) || fiscalMonth < 1 || fiscalMonth > 12 || !validForecastDate(today)) return null;
  const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  let y = Number(today.slice(0, 4));
  if (lastDay(y, fiscalMonth) < today) y += 1;
  const end = lastDay(y, fiscalMonth);
  const prev = Date.parse(lastDay(y - 1, fiscalMonth) + 'T00:00:00Z') + 86400000;
  const start = new Date(prev).toISOString().slice(0, 10);
  return validForecastPeriod(start, end) ? { start, end } : null;
}

// ── 計算（BigIntで桁あふれなし。入力が欠けた項目だけ null＝計算できない。0を代用しない）──
export type CalcRow = { key: string; label: string; formula: string; value: bigint | null; missing: string[] };
type RowDef = { key: string; label: string; formula: string; deps: string[]; fn: (g: (k: string) => bigint) => bigint };
const R = (key: string, label: string, formula: string, deps: string[], fn: RowDef['fn']): RowDef => ({ key, label, formula, deps, fn });
const ROWS: RowDef[] = [
  R('operating_income', '営業利益', '売上高 − 売上原価 − 販売費・一般管理費', ['sales', 'cogs', 'opex'], g => g('sales') - g('cogs') - g('opex')),
  R('pretax_income', '税引前利益', '営業利益 + 営業外収益 − 営業外費用 + 特別利益 − 特別損失', ['operating_income', 'other_income', 'other_expense', 'special_gain', 'special_loss'],
    g => g('operating_income') + g('other_income') - g('other_expense') + g('special_gain') - g('special_loss')),
  R('net_income', '当期純利益', '税引前利益 − 税金費用（仮定）', ['pretax_income', 'tax_expense'], g => g('pretax_income') - g('tax_expense')),
  R('ending_cash', '期末の現金預金', '期首 + 新規借入 + 入金 − 原価支払 − 経費支払 − 税支払 − 設備購入 + 営業外・特別の損益（現金で決済と仮定）',
    ['opening_cash', 'borrowing', 'collections', 'cogs_paid', 'opex_paid', 'tax_paid', 'equipment', 'other_income', 'other_expense', 'special_gain', 'special_loss'],
    g => g('opening_cash') + g('borrowing') + g('collections') - g('cogs_paid') - g('opex_paid') - g('tax_paid') - g('equipment')
      + g('other_income') - g('other_expense') + g('special_gain') - g('special_loss')),
  R('receivables', '売掛金', '売上高 − 売上の入金額', ['sales', 'collections'], g => g('sales') - g('collections')),
  R('equipment_asset', '設備（減価償却は含めない）', '設備の購入額', ['equipment'], g => g('equipment')),
  R('total_assets', '資産合計', '現金預金 + 売掛金 + 設備', ['ending_cash', 'receivables', 'equipment_asset'], g => g('ending_cash') + g('receivables') + g('equipment_asset')),
  R('unpaid', '未払（原価・経費）', '(売上原価 − 原価支払) + (販売費・一般管理費 − 経費支払)', ['cogs', 'cogs_paid', 'opex', 'opex_paid'], g => g('cogs') - g('cogs_paid') + g('opex') - g('opex_paid')),
  R('loans', '借入金', '新規借入', ['borrowing'], g => g('borrowing')),
  R('tax_payable', '未払税金', '税金費用（仮定） − 税金の支払額（仮定）', ['tax_expense', 'tax_paid'], g => g('tax_expense') - g('tax_paid')),
  R('total_liabilities', '負債合計', '未払 + 借入金 + 未払税金', ['unpaid', 'loans', 'tax_payable'], g => g('unpaid') + g('loans') + g('tax_payable')),
  R('equity', '純資産', '資本金 + 期首の繰越利益 + 当期純利益', ['capital', 'opening_retained_earnings', 'net_income'], g => g('capital') + g('opening_retained_earnings') + g('net_income')),
  R('difference', '貸借の差額', '資産合計 − 負債合計 − 純資産（調整で隠さず、そのまま表示）', ['total_assets', 'total_liabilities', 'equity'], g => g('total_assets') - g('total_liabilities') - g('equity')),
];

export function calculateForecast(inputs: ForecastInputs): CalcRow[] {
  const values = new Map<string, bigint | null>();
  const missing = new Map<string, string[]>();
  for (const k of FORECAST_MONEY_KEYS) {
    values.set(k, inputs[k] === null ? null : BigInt(inputs[k] as number));
    missing.set(k, inputs[k] === null ? [FORECAST_FIELD_LABEL[k]] : []);
  }
  const out: CalcRow[] = [];
  for (const def of ROWS) {
    const miss = [...new Set(def.deps.flatMap(d => missing.get(d) ?? []))];
    const value = miss.length === 0 ? def.fn(k => values.get(k) as bigint) : null;
    values.set(def.key, value); missing.set(def.key, miss);
    out.push({ key: def.key, label: def.label, formula: def.formula, value, missing: miss });
  }
  return out;
}
export const forecastCalcValue = (rows: CalcRow[], key: string) => rows.find(r => r.key === key)?.value ?? null;
const ZERO = BigInt(0);
export const formatYen = (v: bigint) => `${v < ZERO ? '−' : ''}¥${(v < ZERO ? -v : v).toLocaleString('ja-JP')}`;
