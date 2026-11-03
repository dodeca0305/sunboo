import type { SupabaseClient } from './supabase';

export type CompanyCreationValues = {
  name: string;
  prefecture_code: string;
  municipality_code: string;
  corporate_type: 'kabushiki' | 'godo';
  fiscal_month: number;
};
export type CompanyCreationIntent = {
  requestId: string;
  values: CompanyCreationValues;
};
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

export function validCompanyCreationIntent(v: unknown): v is CompanyCreationIntent {
  if (!record(v) || typeof v.requestId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v.requestId) ||
      !record(v.values)) return false;
  const p = v.values;
  return typeof p.name === 'string' && p.name.trim() !== '' &&
    typeof p.prefecture_code === 'string' && p.prefecture_code !== '' &&
    typeof p.municipality_code === 'string' && p.municipality_code !== '' &&
    ['kabushiki', 'godo'].includes(String(p.corporate_type)) &&
    Number.isInteger(p.fiscal_month) && Number(p.fiscal_month) >= 1 && Number(p.fiscal_month) <= 12;
}
export type CompanyCreationResult =
  | { status: 'saved'; companyId: number }
  | { status: 'not_found' | 'deleted' | 'unavailable' };

// A missing/invalid acknowledgement is an unknown outcome, never permission to resend.
export async function createOrConfirmCompany(
  client: SupabaseClient,
  intent: CompanyCreationIntent,
  mode: 'create' | 'confirm',
): Promise<CompanyCreationResult> {
  if (!validCompanyCreationIntent(intent)) return { status: 'unavailable' };
  try {
    const r = await client.rpc('create_workspace_company', {
      p_request_id: intent.requestId,
      p_values: intent.values,
      p_mode: mode,
    });
    if (r.error || !Array.isArray(r.data) || r.data.length !== 1)
      return { status: 'unavailable' };
    const row = r.data[0];
    if (!record(row) || row.request_id !== intent.requestId)
      return { status: 'unavailable' };
    if (['created', 'existing'].includes(String(row.result_status)) &&
        Number.isSafeInteger(row.company_id) && Number(row.company_id) > 0)
      return { status: 'saved', companyId: Number(row.company_id) };
    if (['not_found', 'deleted'].includes(String(row.result_status)) && row.company_id === null)
      return { status: row.result_status as 'not_found' | 'deleted' };
    return { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}

export async function loadCreationMunicipalities(client: SupabaseClient, code: string) {
  try {
    const p = await client.from('prefectures').select('id,code').eq('code', code).maybeSingle();
    if (p.error || !record(p.data) || !Number.isSafeInteger(p.data.id) || p.data.code !== code)
      return null;
    const prefectureId = p.data.id;
    const r = await client.from('municipalities').select('code,name,prefecture_id')
      .eq('prefecture_id', prefectureId).order('code');
    if (r.error || !Array.isArray(r.data) || r.data.length >= 1000 ||
        r.data.some(v => !record(v) || typeof v.code !== 'string' || typeof v.name !== 'string' ||
          v.prefecture_id !== prefectureId) ||
        new Set(r.data.map(v => v.code)).size !== r.data.length)
      return null;
    return r.data.map(v => ({ code: v.code as string, name: v.name as string }));
  } catch {
    return null;
  }
}
