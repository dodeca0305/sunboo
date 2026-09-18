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
