import type { SupabaseClient } from './supabase';
import type { WorkspaceCompanyRow } from './workspaceCompanyProfile';
import {
  loadExecutionProfile,
  loadExecutionTaxReturns,
} from './taxIntelligence/productionInputs.ts';
import { loadWorkspaceProcedureStatusesForEditing } from './workspaceProcedureStatusData.ts';
import { createPlanningReadGuard } from './workspacePlanningReadGuard.ts';
import {
  workspaceRead,
  type WorkspaceReadResult,
} from './workspaceReadGuard.ts';
import type { CompanyProfile } from './companyProfile';
import type { TaxReturnProfile } from './taxReturnProfile';
import type { WorkspaceProcedureStatusMap } from './workspaceProcedureStatus';
export async function planningRead<T>(
  client: SupabaseClient,
  companyId: number,
  load: (client: SupabaseClient) => Promise<T | null>,
): Promise<WorkspaceReadResult<T>> {
  return workspaceRead(async () => {
    const guard = createPlanningReadGuard(client, companyId);
    const value = await load(guard.client);
    if (value === null || guard.failed())
      throw Error('Incomplete planning read');
    return value;
  });
}
export async function loadPlanningSources(
  client: SupabaseClient,
  company: WorkspaceCompanyRow,
) {
  const [profile, taxReturns, statuses] = await Promise.all([
    workspaceRead(() => loadExecutionProfile(client, company)),
    workspaceRead(() => loadExecutionTaxReturns(client, company.id)),
    planningRead(client, company.id, (c) =>
      loadWorkspaceProcedureStatusesForEditing(c, company.id),
    ),
  ]);
  return { profile, taxReturns, statuses };
}
export type PlanningSources = Awaited<ReturnType<typeof loadPlanningSources>>;
export async function loadPlanningDerived<T>(
  client: SupabaseClient,
  companyId: number,
  sources: PlanningSources,
  build: (
    c: SupabaseClient,
    inputs: {
      companyProfile: CompanyProfile;
      taxReturnProfile: TaxReturnProfile;
      procedureStatusMap: WorkspaceProcedureStatusMap;
    },
  ) => Promise<T>,
): Promise<WorkspaceReadResult<T>> {
  if (
    sources.profile.status !== 'loaded' ||
    sources.taxReturns.status !== 'loaded'
  )
    return { status: 'unavailable' };
  const profile = sources.profile.value,
    returns = sources.taxReturns.value;
  return planningRead(client, companyId, (c) =>
    build(c, {
      companyProfile: profile,
      taxReturnProfile: returns,
      // Statuses do not determine schedules. Never expose a fallback as a loaded status map.
      procedureStatusMap:
        sources.statuses.status === 'loaded' ? sources.statuses.value : {},
    }),
  );
}
