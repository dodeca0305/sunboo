import type { SupabaseClient } from './supabase';
import { taxPaymentPlanRowsToMap, type WorkspaceTaxPaymentPlanMap } from './workspaceTaxPaymentPlan.ts';

// nullは取得不可、空Mapは正常な未登録。取得できなかった額を0として編集させない。
export async function loadWorkspaceTaxPaymentPlansForEditing(
  client: Pick<SupabaseClient, 'from'>,
  companyId: number,
): Promise<WorkspaceTaxPaymentPlanMap | null> {
  try {
    const { data, error } = await client.from('workspace_tax_payment_plans')
      .select('procedure_id, due_date, amount').eq('company_id', companyId);
    if (error || !Array.isArray(data)) return null;
    if (data.some(row => !row || !Number.isInteger(row.procedure_id) || row.procedure_id <= 0
      || typeof row.due_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.due_date)
      || !Number.isSafeInteger(row.amount) || row.amount < 0)) return null;
    return taxPaymentPlanRowsToMap(data);
  } catch {
    return null;
  }
}
