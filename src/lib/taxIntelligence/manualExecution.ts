import { requireTaxExecutionAccess } from "./executionRecovery.ts";
import type { SupabaseClient } from "../supabase";
import {
  executeProductionTaxControl,
  type ExecuteProductionTaxControlInput,
} from "./productionExecution.ts";

// UIの表示条件に依存せず、保存の直前に会社単位の権限を検証する。
export async function executeManualTaxControl(
  supabase: SupabaseClient,
  email: string,
  input: ExecuteProductionTaxControlInput,
  execute = executeProductionTaxControl,
) {
  await requireTaxExecutionAccess(supabase, email, input.companyId);
  return execute(supabase, input);
}
