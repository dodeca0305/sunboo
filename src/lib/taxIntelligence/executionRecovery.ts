import type { SupabaseClient } from "../supabase";
import {
  taxReturnCanonical,
  taxReturnDate,
} from "../workspaceTaxReturnData.ts";
export type ExecutionIntent = {
  companyId: number;
  taxControlId: number;
  asOfDate: string;
  liquidationResidualAssetsCase: "unknown" | "applicable" | "not_applicable";
};
export type PendingExecution = { executionId: string; intent: ExecutionIntent };
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export const validExecutionId = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    v,
  );
export function validPendingExecution(
  v: unknown,
  companyId: number,
): v is PendingExecution {
  return (
    record(v) &&
    validExecutionId(v.executionId) &&
    record(v.intent) &&
    Number.isSafeInteger(companyId) &&
    companyId > 0 &&
    v.intent.companyId === companyId &&
    Number.isSafeInteger(v.intent.taxControlId) &&
    Number(v.intent.taxControlId) > 0 &&
    taxReturnDate(v.intent.asOfDate) &&
    ["unknown", "applicable", "not_applicable"].includes(
      String(v.intent.liquidationResidualAssetsCase),
    )
  );
}
export const executionMetadata = (id: string, intent: ExecutionIntent) => ({
  id,
  intent,
});
export async function requireTaxExecutionAccess(
  client: SupabaseClient,
  email: string,
  companyId: number,
) {
  const r = await client
    .from("workspace_members")
    .select("role")
    .eq("company_id", companyId)
    .eq("email", email)
    .maybeSingle();
  if (r.error || !r.data || !["owner", "member"].includes(r.data.role))
    throw Error("この会社の税務チェックを実行する権限がありません。");
}
export type ExecutionRecovery =
  | { status: "saved"; controlResultId: number; reviewCaseId: number | null }
  | { status: "missing" | "unavailable" | "conflict" };
// Read-only reconciliation: never evaluate or call a persistence RPC here.
export async function recoverTaxExecution(
  client: SupabaseClient,
  pending: PendingExecution,
): Promise<ExecutionRecovery> {
  if (!validPendingExecution(pending, pending?.intent?.companyId))
    return { status: "conflict" };
  try {
    const { companyId, taxControlId, asOfDate } = pending.intent;
    const r = await client
      .from("workspace_tax_control_results")
      .select(
        "id,company_id,tax_control_id,as_of_date,applicable,status,observed_inputs",
      )
      .eq("company_id", companyId)
      .eq("observed_inputs->_sunboo_execution->>id", pending.executionId)
      .limit(2);
    if (r.error || !Array.isArray(r.data)) return { status: "unavailable" };
    if (r.data.length === 0) return { status: "missing" };
    if (r.data.length !== 1) return { status: "conflict" };
    const row = r.data[0];
    if (
      !record(row) ||
      !Number.isSafeInteger(row.id) ||
      Number(row.id) <= 0 ||
      row.company_id !== companyId ||
      row.tax_control_id !== taxControlId ||
      row.as_of_date !== asOfDate ||
      !record(row.observed_inputs) ||
      !record(row.observed_inputs._sunboo_execution) ||
      row.observed_inputs._sunboo_execution.id !== pending.executionId ||
      taxReturnCanonical(row.observed_inputs._sunboo_execution.intent) !==
        taxReturnCanonical(pending.intent) ||
      typeof row.applicable !== "boolean" ||
      (row.applicable
        ? !["pass", "review", "unknown"].includes(String(row.status))
        : row.status !== null)
    )
      return { status: "conflict" };
    const reviews = await client
      .from("workspace_tax_review_cases")
      .select("id,company_id,control_result_id,status")
      .eq("company_id", companyId)
      .eq("control_result_id", row.id)
      .limit(2);
    if (reviews.error || !Array.isArray(reviews.data))
      return { status: "unavailable" };
    const required =
      row.applicable && ["review", "unknown"].includes(String(row.status));
    if (reviews.data.length !== (required ? 1 : 0))
      return { status: "conflict" };
    const review = reviews.data[0];
    if (
      required &&
      (!record(review) ||
        !Number.isSafeInteger(review.id) ||
        Number(review.id) <= 0 ||
        review.company_id !== companyId ||
        review.control_result_id !== row.id ||
        !["open", "resolved", "dismissed"].includes(String(review.status)))
    )
      return { status: "conflict" };
    return {
      status: "saved",
      controlResultId: Number(row.id),
      reviewCaseId: required ? Number(review.id) : null,
    };
  } catch {
    return { status: "unavailable" };
  }
}
