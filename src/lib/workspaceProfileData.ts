import type { SupabaseClient } from './supabase';
import { validHomeProfile } from './workspaceHomeData.ts';
import { profileSnapshot } from './workspaceProfileSave.ts';
import type { CompanyProfile } from './companyProfile';
import { workspaceRowsToCompanyProfile, type WorkspaceCompanyRow, type WorkspaceCompanyProfileRow } from './workspaceCompanyProfile.ts';

// 編集画面専用。読み取り専用画面の既存の縮退動作は変更しない。
export async function loadWorkspaceProfileEditor(
  client: Pick<SupabaseClient, 'from'>,
  company: WorkspaceCompanyRow,
) {
  try {
    const results = await Promise.all([
      client.from('workspace_company_profiles').select('*').eq('company_id', company.id).maybeSingle(),
      client.from('prefectures').select('name').eq('code', company.prefecture_code).maybeSingle(),
      client.from('municipalities').select('name').eq('code', company.municipality_code).maybeSingle(),
    ]);
    if (results.some(result => result.error || result.data === undefined)) return null;
    const [profile, prefecture, municipality] = results;
    // nullかつerrorなしだけが「正常な未登録」。失敗時の既定値によるupsertを防ぐ。
    if (profile.data !== null && (!profile.data || Array.isArray(profile.data) || profile.data.company_id !== company.id)) return null;
    if (!prefecture.data || !municipality.data || typeof prefecture.data.name !== 'string' || typeof municipality.data.name !== 'string') return null;
    const value=workspaceRowsToCompanyProfile(
      company,
      profile.data as WorkspaceCompanyProfileRow | null,
      (prefecture.data as { name: string } | null)?.name ?? '',
      (municipality.data as { name: string } | null)?.name ?? '',
    );
    if (!validHomeProfile(value)) return null;
    return {profile:value,snapshot:profileSnapshot(company,profile.data as WorkspaceCompanyProfileRow|null)};
  } catch {
    return null;
  }
}

export async function loadWorkspaceProfileForEditing(client:Pick<SupabaseClient,'from'>,company:WorkspaceCompanyRow):Promise<CompanyProfile|null>{
 return (await loadWorkspaceProfileEditor(client,company))?.profile??null;
}
