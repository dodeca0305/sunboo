import type { SupabaseClient } from '../supabase';
import { executeProductionTaxControl, type ExecuteProductionTaxControlInput } from './productionExecution.ts';

// UIの表示条件に依存せず、保存の直前に会社単位の権限を検証する。
export async function executeManualTaxControl(
  supabase: SupabaseClient,
  email: string,
  input: ExecuteProductionTaxControlInput,
  execute = executeProductionTaxControl,
) {
  const { data: member, error } = await supabase.from('workspace_members')
    .select('role').eq('company_id', input.companyId).eq('email', email).maybeSingle();
  if (error || !member || !['owner', 'member'].includes(member.role)) {
    throw new Error('この会社の税務チェックを実行する権限がありません。');
  }
  return execute(supabase, input);
}
