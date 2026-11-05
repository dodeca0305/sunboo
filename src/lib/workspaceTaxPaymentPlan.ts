import { workspaceProcedureOccurrenceKey } from './workspaceProcedureStatus.ts';

export type WorkspaceTaxPaymentPlanRow = {
  procedure_id: number;
  due_date: string;
  amount: number;
};

export type WorkspaceTaxPaymentPlanMap = Record<string, number>;

export function workspaceTaxPaymentPlanKey(procedureId: number, dueDate: string): string {
  return workspaceProcedureOccurrenceKey(procedureId, dueDate);
}

export function taxPaymentPlanRowsToMap(rows: WorkspaceTaxPaymentPlanRow[]): WorkspaceTaxPaymentPlanMap {
  return Object.fromEntries(rows.map((row) => [
    workspaceTaxPaymentPlanKey(row.procedure_id, row.due_date),
    Math.max(0, row.amount ?? 0),
  ]));
}

export function sumTaxPaymentPlansByMonth(rows: WorkspaceTaxPaymentPlanRow[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const row of rows) {
    const yearMonth = row.due_date.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) continue;
    totals[yearMonth] = (totals[yearMonth] ?? 0) + Math.max(0, row.amount ?? 0);
  }
  return totals;
}

// 分類名や表示名から納付を推測しない。申告と納付を扱う既存手続きだけを対象とする。
const PAYMENT_PROCEDURE_CODES = new Set([
  'WITHHOLDING_TAX', 'RESIDENT_TAX_WITHHOLDING',
  'CORP_TAX_RETURN', 'CONSUMPTION_TAX_RETURN',
  'PREFECTURAL_RESIDENT_TAX_RETURN', 'PREFECTURAL_BUSINESS_TAX_RETURN',
  'MUNICIPAL_RESIDENT_TAX_RETURN',
]);
export function canPlanTaxPayment(code: string): boolean {
  return PAYMENT_PROCEDURE_CODES.has(code);
}

export type LinkedTaxPaymentPlanRow = WorkspaceTaxPaymentPlanRow & {
  procedures: { code: string } | null;
};
// inner join は使わない。参照先の取得不能で行が消えると誤って0円になる。
export const LINKED_TAX_PLAN_COLUMNS = 'procedure_id,due_date,amount,procedures(code)';
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
export function confirmedTaxPaymentPlanRows(rows: unknown[]): WorkspaceTaxPaymentPlanRow[] {
  return rows.filter((row): row is LinkedTaxPaymentPlanRow => {
    if (!record(row) || !Number.isSafeInteger(row.procedure_id) || Number(row.procedure_id) <= 0
      || typeof row.due_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.due_date)
      || typeof row.amount !== 'number' || !record(row.procedures) || typeof row.procedures.code !== 'string'
      || !Number.isSafeInteger(row.amount) || row.amount < 0) {
      throw new Error('Tax payment plan cannot be confirmed');
    }
    if (canPlanTaxPayment(row.procedures.code)) return true;
    // 旧画面で申告だけの手続きに登録した金額は消さない・納付月を推測しない。
    // 正しい合計が不明なため、0扱いや部分合計も返さず集計を停止する。
    if (row.amount > 0) throw new Error('Tax payment date needs review');
    return false;
  });
}
