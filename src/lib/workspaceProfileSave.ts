import type { SupabaseClient } from './supabase';
import { companyProfileToWorkspaceUpdatePayload, workspaceRowsToCompanyProfile, type WorkspaceProfileUpdatePayload, type WorkspaceCompanyRow, type WorkspaceCompanyProfileRow } from './workspaceCompanyProfile.ts';
import { validHomeProfile, loadWorkspaceCompanyForRead } from './workspaceHomeData.ts';
export type ProfileSnapshot = {
    companyFields: WorkspaceProfileUpdatePayload['companyFields'];
    profileFields: WorkspaceProfileUpdatePayload['profileFields'] | null;
};
export type ProfileSaveIntent = {
    version: 1;
    companyId: number;
    expected: ProfileSnapshot;
    values: WorkspaceProfileUpdatePayload;
};
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export function equalProfileValue(a: unknown, b: unknown): boolean {
    if (a === b)
        return true;
    if (Array.isArray(a) || Array.isArray(b))
        return false;
    if (!record(a) || !record(b))
        return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(k => Object.hasOwn(b, k) && equalProfileValue(a[k], b[k]));
}
export function profileSnapshot(company: WorkspaceCompanyRow, row: WorkspaceCompanyProfileRow | null): ProfileSnapshot {
    const payload = companyProfileToWorkspaceUpdatePayload(workspaceRowsToCompanyProfile(company, row, '', ''));
    return { companyFields: payload.companyFields, profileFields: row === null ? null : payload.profileFields };
}
function validSnapshot(v: unknown, allowNull: boolean): v is ProfileSnapshot {
    if (!record(v) || !record(v.companyFields) || !(v.profileFields === null && allowNull) && !record(v.profileFields))
        return false;
    const c = v.companyFields;
    if (!['kabushiki', 'godo'].includes(String(c.corporate_type)) || !(c.fiscal_month === null || Number.isInteger(c.fiscal_month) && Number(c.fiscal_month) >= 1 && Number(c.fiscal_month) <= 12))
        return false;
    if (v.profileFields === null)
        return true;
    const value = workspaceRowsToCompanyProfile({ id: 1, name: '', prefecture_code: '', municipality_code: '', ...c } as WorkspaceCompanyRow, { company_id: 1, ...v.profileFields } as WorkspaceCompanyProfileRow, '', '');
    return validHomeProfile(value) && equalProfileValue(companyProfileToWorkspaceUpdatePayload(value), v);
}
export function validProfileSaveIntent(v: unknown, companyId: number): v is ProfileSaveIntent {
    return record(v) && v.version === 1 && v.companyId === companyId && Number.isSafeInteger(companyId) && companyId > 0 && validSnapshot(v.expected, true) && validSnapshot(v.values, false);
}
export const profileSaveKey = (companyId: number, actorId: string) => `sunboo:profile-save:v1:${actorId}:${companyId}`;
export async function loadProfileSnapshot(client: SupabaseClient, companyId: number): Promise<ProfileSnapshot | null> {
    try {
        const c = await loadWorkspaceCompanyForRead(client, companyId);
        if (c.status !== 'loaded')
            return null;
        const r = await client.from('workspace_company_profiles').select('*').eq('company_id', companyId).maybeSingle();
        if (r.error || r.data === undefined || r.data !== null && (!record(r.data) || r.data.company_id !== companyId))
            return null;
        const s = profileSnapshot(c.company, r.data as WorkspaceCompanyProfileRow | null);
        return validSnapshot(s, true) ? s : null;
    }
    catch {
        return null;
    }
}
export async function saveCompanyProfile(client: SupabaseClient, intent: ProfileSaveIntent): Promise<'saved' | 'conflict' | 'unavailable'> {
    if (!validProfileSaveIntent(intent, intent.companyId))
        return 'unavailable';
    try {
        const r = await client.rpc('save_workspace_company_profile', { p_company_id: intent.companyId, p_expected: intent.expected, p_values: intent.values });
        if (r.error)
            return r.error.code === '40001' ? 'conflict' : 'unavailable';
        return record(r.data) && r.data.company_id === intent.companyId && r.data.result_status === 'saved' && equalProfileValue(r.data.snapshot, intent.values) ? 'saved' : 'unavailable';
    }
    catch {
        return 'unavailable';
    }
}
export async function reconcileProfileSave(client: SupabaseClient, intent: ProfileSaveIntent): Promise<'saved' | 'unchanged' | 'conflict' | 'unavailable'> {
    const s = await loadProfileSnapshot(client, intent.companyId);
    if (!s)
        return 'unavailable';
    return equalProfileValue(s, intent.values) ? 'saved' : equalProfileValue(s, intent.expected) ? 'unchanged' : 'conflict';
}
