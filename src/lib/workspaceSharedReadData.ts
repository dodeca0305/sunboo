import type { SupabaseClient } from './supabase';
import {
  workspaceRowsToCompanyProfile,
  type WorkspaceCompanyRow,
  type WorkspaceCompanyProfileRow,
} from './workspaceCompanyProfile.ts';
import { validHomeProfile } from './workspaceHomeData.ts';
import { validTaxReturnRow } from './workspaceTaxReturnData.ts';
import {
  workspaceRowsToTaxReturnProfile,
  type WorkspaceTaxReturnProfileRow,
} from './workspaceTaxReturnProfile.ts';
import {
  workspaceProcedureOccurrenceKey,
  WORKSPACE_PROCEDURE_STATUSES,
  type WorkspaceProcedureStatusMap,
} from './workspaceProcedureStatus.ts';
import { createPlanningReadGuard } from './workspacePlanningReadGuard.ts';
import {
  workspaceRead,
  type WorkspaceReadResult,
} from './workspaceReadGuard.ts';
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const positive = (v: unknown) => Number.isSafeInteger(v) && Number(v) > 0;
const allowed = ['company', 'profile', 'roadmap', 'tax_returns'];
export type SharedInput<T> = WorkspaceReadResult<T> | { status: 'not_shared' };
export async function loadSharedWorkspaceRead(
  client: SupabaseClient | null,
  token: string,
) {
  if (!/^[a-f0-9]{64}$/.test(token)) return { status: 'invalid' as const };
  if (!client) return { status: 'unavailable' as const };
  let payload: unknown;
  try {
    const r = await client.rpc('get_shared_workspace_view', { p_token: token });
    if (r.error || r.data === undefined)
      return { status: 'unavailable' as const };
    payload = r.data;
  } catch {
    return { status: 'unavailable' as const };
  }
  if (payload === null) return { status: 'invalid' as const };
  if (
    !record(payload) ||
    !Array.isArray(payload.shared_sections) ||
    payload.shared_sections.some(
      (s) => typeof s !== 'string' || !allowed.includes(s),
    ) ||
    new Set(payload.shared_sections).size !== payload.shared_sections.length
  )
    return { status: 'unavailable' as const };
  const sections = payload.shared_sections as string[];
  if (!sections.includes('company')) return { status: 'not_shared' as const };
  const c = payload.company;
  if (
    !record(c) ||
    !positive(c.id) ||
    typeof c.name !== 'string' ||
    typeof c.prefecture_code !== 'string' ||
    typeof c.municipality_code !== 'string' ||
    !['kabushiki', 'godo'].includes(String(c.corporate_type)) ||
    !(
      c.fiscal_month === null ||
      (Number.isInteger(c.fiscal_month) &&
        Number(c.fiscal_month) >= 1 &&
        Number(c.fiscal_month) <= 12)
    )
  )
    return { status: 'unavailable' as const };
  const company = c as WorkspaceCompanyRow;
  const profile: SharedInput<ReturnType<typeof workspaceRowsToCompanyProfile>> =
    !sections.includes('profile')
      ? { status: 'not_shared' }
      : await workspaceRead(async () => {
          if (
            payload.profile === undefined ||
            (payload.profile !== null &&
              (!record(payload.profile) ||
                payload.profile.company_id !== company.id))
          )
            throw Error('Shared profile unavailable');
          const results = await Promise.all([
            client
              .from('prefectures')
              .select('code,name')
              .eq('code', company.prefecture_code)
              .maybeSingle(),
            client
              .from('municipalities')
              .select('code,name')
              .eq('code', company.municipality_code)
              .maybeSingle(),
          ]);
          if (results.some((r) => r.error || r.data === undefined))
            throw Error('Location unavailable');
          for (const [r, code] of [
            [results[0], company.prefecture_code],
            [results[1], company.municipality_code],
          ] as const)
            if (
              code &&
              (!record(r.data) ||
                r.data.code !== code ||
                typeof r.data.name !== 'string')
            )
              throw Error('Location unavailable');
          const p = workspaceRowsToCompanyProfile(
            company,
            payload.profile as WorkspaceCompanyProfileRow | null,
            results[0].data?.name ?? '',
            results[1].data?.name ?? '',
          );
          if (!validHomeProfile(p)) throw Error('Invalid profile');
          return p;
        });
  const statuses: SharedInput<WorkspaceProcedureStatusMap> = !sections.includes(
    'roadmap',
  )
    ? { status: 'not_shared' }
    : await workspaceRead(async () => {
        if (!Array.isArray(payload.statuses))
          throw Error('Statuses unavailable');
        const map: WorkspaceProcedureStatusMap = {};
        for (const r of payload.statuses) {
          if (
            !record(r) ||
            !positive(r.procedure_id) ||
            typeof r.occurrence_key !== 'string' ||
            !r.occurrence_key ||
            !WORKSPACE_PROCEDURE_STATUSES.includes(r.status as never)
          )
            throw Error('Invalid shared status');
          const key = workspaceProcedureOccurrenceKey(
            Number(r.procedure_id),
            r.occurrence_key,
          );
          if (Object.hasOwn(map, key)) throw Error('Duplicate status');
          map[key] = r.status as WorkspaceProcedureStatusMap[string];
        }
        return map;
      });
  const taxReturns: SharedInput<
    ReturnType<typeof workspaceRowsToTaxReturnProfile>
  > = !sections.includes('tax_returns')
    ? { status: 'not_shared' }
    : await workspaceRead(async () => {
        if (!Array.isArray(payload.tax_returns))
          throw Error('Shared financial entries unavailable');
        const ids = new Set(),
          dates = new Set();
        for (const row of payload.tax_returns) {
          if (
            !validTaxReturnRow(row, company.id) ||
            ids.has(row.id) ||
            dates.has(row.fiscal_year_end_date)
          )
            throw Error('Invalid shared financial entries');
          ids.add(row.id);
          dates.add(row.fiscal_year_end_date);
        }
        return workspaceRowsToTaxReturnProfile(
          payload.tax_returns as WorkspaceTaxReturnProfileRow[],
        );
      });
  return {
    status: 'loaded' as const,
    company,
    sections,
    profile,
    statuses,
    taxReturns,
  };
}
export type SharedWorkspaceRead = Awaited<
  ReturnType<typeof loadSharedWorkspaceRead>
>;
export async function loadSharedRoadmap<T>(
  client: SupabaseClient,
  view: Extract<SharedWorkspaceRead, { status: 'loaded' }>,
  build: (
    c: SupabaseClient,
    p: ReturnType<typeof workspaceRowsToCompanyProfile>,
    t: ReturnType<typeof workspaceRowsToTaxReturnProfile>,
  ) => Promise<T>,
): Promise<WorkspaceReadResult<T>> {
  if (view.profile.status !== 'loaded' || view.taxReturns.status !== 'loaded')
    return { status: 'unavailable' };
  const p = view.profile.value,
    t = view.taxReturns.value;
  return workspaceRead(async () => {
    const guard = createPlanningReadGuard(client);
    const result = await build(guard.client, p, t);
    if (guard.failed()) throw Error('Incomplete shared plan');
    return result;
  });
}
