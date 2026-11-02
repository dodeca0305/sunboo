import type { SupabaseClient } from "../supabase";
import type {
  WorkspaceCompanyRow,
  WorkspaceCompanyProfileRow,
} from "../workspaceCompanyProfile";
import { workspaceRowsToCompanyProfile } from "../workspaceCompanyProfile.ts";
import {
  loadWorkspaceCompanyForRead,
  validHomeProfile,
} from "../workspaceHomeData.ts";
import { validTaxReturnRow } from "../workspaceTaxReturnData.ts";
import { workspaceRowsToTaxReturnProfile } from "../workspaceTaxReturnProfile.ts";
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export async function loadExecutionCompany(client: SupabaseClient, id: number) {
  const result = await loadWorkspaceCompanyForRead(client, id);
  if (result.status === "unavailable")
    throw Error("会社情報を取得できません。再読み込みしてください。");
  return result.status === "loaded" ? result.company : null;
}
export async function loadExecutionProfile(
  client: SupabaseClient,
  company: WorkspaceCompanyRow,
) {
  const results = await Promise.all([
    client
      .from("workspace_company_profiles")
      .select("*")
      .eq("company_id", company.id)
      .maybeSingle(),
    client
      .from("prefectures")
      .select("code,name")
      .eq("code", company.prefecture_code)
      .maybeSingle(),
    client
      .from("municipalities")
      .select("code,name")
      .eq("code", company.municipality_code)
      .maybeSingle(),
  ]);
  if (results.some((r) => r.error || r.data === undefined))
    throw Error("プロフィール・所在地を取得できません。");
  const [p, pref, muni] = results;
  if (p.data !== null && (!record(p.data) || p.data.company_id !== company.id))
    throw Error("プロフィールを確認できません。");
  for (const [result, code] of [
    [pref, company.prefecture_code],
    [muni, company.municipality_code],
  ] as const) {
    if (
      code &&
      (!record(result.data) ||
        result.data.code !== code ||
        typeof result.data.name !== "string")
    )
      throw Error("所在地を取得できません。");
  }
  const profile = workspaceRowsToCompanyProfile(
    company,
    p.data as WorkspaceCompanyProfileRow | null,
    pref.data?.name ?? "",
    muni.data?.name ?? "",
  );
  if (!validHomeProfile(profile))
    throw Error("プロフィールの内容を確認できません。");
  return profile;
}
export async function loadExecutionTaxReturns(
  client: SupabaseClient,
  id: number,
) {
  const rows: import("../workspaceTaxReturnProfile").WorkspaceTaxReturnProfileRow[] =
    [];
  const ids = new Set<number>(),
    dates = new Set<string>();
  for (let offset = 0; ; ) {
    const r = await client
      .from("workspace_tax_return_profiles")
      .select("*")
      .eq("company_id", id)
      .order("id")
      .range(offset, offset + 499);
    if (r.error || !Array.isArray(r.data))
      throw Error("決算実績を取得できません。再読み込みしてください。");
    for (const row of r.data) {
      if (
        !validTaxReturnRow(row, id) ||
        ids.has(row.id) ||
        dates.has(row.fiscal_year_end_date)
      )
        throw Error("決算実績の内容を確認できません。");
      ids.add(row.id);
      dates.add(row.fiscal_year_end_date);
      rows.push(row);
    }
    if (r.data.length === 0) break;
    offset += r.data.length;
  }
  return workspaceRowsToTaxReturnProfile(rows);
}
