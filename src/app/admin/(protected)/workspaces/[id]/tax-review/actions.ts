"use server";
import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { executeManualTaxControl } from "@/lib/taxIntelligence/manualExecution";
import { ExecutionOutcomeUnknown } from "@/lib/taxIntelligence/productionExecution";
import {
  recoverTaxExecution,
  requireTaxExecutionAccess,
  validPendingExecution,
  type PendingExecution,
} from "@/lib/taxIntelligence/executionRecovery";
export type EvaluationActionState = {
  status: "success" | "error" | "unknown" | "missing";
  message: string;
};
export async function runTaxControlAction(
  pending: PendingExecution,
  mode: "execute" | "verify",
): Promise<EvaluationActionState> {
  const session = await getAdminSession();
  if (!session)
    return { status: "error", message: "管理者として再ログインしてください。" };
  if (
    !validPendingExecution(pending, pending?.intent?.companyId) ||
    !["execute", "verify"].includes(mode)
  )
    return { status: "error", message: "実行要求を確認できません。" };
  const supabase = await createServerSupabase();
  if (!supabase)
    return {
      status: "unknown",
      message: "データベースに接続できません。保存結果の確認が必要です。",
    };
  try {
    const { companyId, taxControlId, asOfDate, liquidationResidualAssetsCase } =
      pending.intent;
    await requireTaxExecutionAccess(supabase, session.email, companyId);
    // Always check a pending result before evaluating again; this path is read-only.
    const recovered = await recoverTaxExecution(supabase, pending);
    if (recovered.status === "saved") {
      revalidatePath(`/admin/workspaces/${companyId}/tax-review`);
      return {
        status: "success",
        message: `保存済みの評価結果 #${recovered.controlResultId} を確認しました。`,
      };
    }
    if (recovered.status !== "missing")
      return {
        status: "unknown",
        message: "保存結果を確認できません。再送せず再確認してください。",
      };
    if (mode === "verify")
      return {
        status: "missing",
        message:
          "この実行IDの保存結果は見つかりませんでした。同じIDで再試行できます。",
      };
    const today = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Tokyo",
    }).format(new Date());
    if (asOfDate > today)
      return {
        status: "error",
        message:
          "未来の基準日では実行できません。端末の日付を確認してください。",
      };
    const result = await executeManualTaxControl(supabase, session.email, {
      executionId: pending.executionId,
      companyId,
      taxControlId,
      asOfDate,
      corporateTaxFilingContext: { liquidationResidualAssetsCase },
    });
    revalidatePath(`/admin/workspaces/${companyId}`);
    revalidatePath(`/admin/workspaces/${companyId}/tax-review`);
    return {
      status: "success",
      message: `評価結果を保存しました。${result.evaluation.reasonSummary}`,
    };
  } catch (error) {
    return {
      status: error instanceof ExecutionOutcomeUnknown ? "unknown" : "error",
      message: error instanceof ExecutionOutcomeUnknown ? "保存結果を確認できません。再送せず「保存結果を確認」を選んでください。" : error instanceof Error ? error.message : "評価に失敗しました。",
    };
  }
}
