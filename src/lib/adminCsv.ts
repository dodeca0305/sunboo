import type { BrowserSupabaseClient } from './supabase/browser';

export type ImportSummary = {
  total: number;
  succeeded: number;
  failed: number;
  errors: string[];
};

type MunicipalityCsvRow = { pref_code: string; pref_name: string; muni_code: string; muni_name: string };
type OrganizationOfficeCsvRow = {
  org_type_code: string;
  org_name: string;
  office_name: string;
  muni_codes: string; // パイプ区切り（例: 401315|401323）
  postal_code?: string;
  address?: string;
  phone?: string;
  fax?: string;
  email?: string;
  website_url?: string;
  official_url?: string;
  e_filing_url?: string;
  download_page_url?: string;
  map_url?: string;
  business_hours?: string;
  notes?: string;
};
type OfficialLinkCsvRow = {
  org_type_code: string;
  office_name: string;
  official_url?: string;
  official_url_status?: string;
  fallback_url?: string;
};

function emptyToNull(v: string | undefined): string | null {
  const trimmed = (v ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

export async function importMunicipalities(
  supabase: BrowserSupabaseClient,
  rows: MunicipalityCsvRow[],
): Promise<ImportSummary> {
  const errors: string[] = [];
  const validRows = rows.filter((r) => r.pref_code?.trim() && r.muni_code?.trim());

  const prefRows = Array.from(
    new Map(validRows.map((r) => [r.pref_code.trim(), { code: r.pref_code.trim(), name: r.pref_name.trim() }])).values(),
  );

  const { error: prefError } = await supabase.from('prefectures').upsert(prefRows, { onConflict: 'code' });
  if (prefError) errors.push(`都道府県の登録に失敗: ${prefError.message}`);

  const { data: prefData, error: prefFetchError } = await supabase.from('prefectures').select('id, code');
  if (prefFetchError) errors.push(`都道府県の取得に失敗: ${prefFetchError.message}`);

  const prefIdByCode = new Map(((prefData as { id: number; code: string }[] | null) ?? []).map((p) => [p.code, p.id]));

  const muniRows = validRows
    .map((r) => {
      const prefId = prefIdByCode.get(r.pref_code.trim());
      if (!prefId) return null;
      return { prefecture_id: prefId, code: r.muni_code.trim(), name: r.muni_name.trim() };
    })
    .filter((r): r is { prefecture_id: number; code: string; name: string } => r !== null);

  let succeeded = 0;
  if (muniRows.length > 0) {
    const { error: muniError, count } = await supabase
      .from('municipalities')
      .upsert(muniRows, { onConflict: 'code', count: 'exact' });
    if (muniError) {
      errors.push(`市区町村の登録に失敗: ${muniError.message}`);
    } else {
      succeeded = count ?? muniRows.length;
    }
  }

  return { total: rows.length, succeeded, failed: rows.length - succeeded, errors };
}

export async function importOrganizationOffices(
  supabase: BrowserSupabaseClient,
  rows: OrganizationOfficeCsvRow[],
): Promise<ImportSummary> {
  const errors: string[] = [];
  const validRows = rows.filter((r) => r.org_type_code?.trim() && r.org_name?.trim() && r.office_name?.trim());

  const [{ data: muniData, error: muniFetchError }, { data: typeData, error: typeFetchError }] = await Promise.all([
    supabase.from('municipalities').select('id, code'),
    supabase.from('organization_types').select('id, code'),
  ]);
  if (muniFetchError) errors.push(`市区町村の取得に失敗: ${muniFetchError.message}`);
  if (typeFetchError) errors.push(`機関種別の取得に失敗: ${typeFetchError.message}`);

  const muniIdByCode = new Map(((muniData as { id: number; code: string }[] | null) ?? []).map((m) => [m.code, m.id]));
  const typeIdByCode = new Map(((typeData as { id: number; code: string }[] | null) ?? []).map((t) => [t.code, t.id]));

  let succeeded = 0;

  for (const r of validRows) {
    const typeId = typeIdByCode.get(r.org_type_code.trim());
    if (!typeId) {
      errors.push(`機関種別 ${r.org_type_code} が見つかりません`);
      continue;
    }

    const { data: orgData, error: orgError } = await supabase
      .from('organizations')
      .upsert({ organization_type_id: typeId, name: r.org_name.trim() }, { onConflict: 'organization_type_id,name' })
      .select('id')
      .single();
    if (orgError || !orgData) {
      errors.push(`${r.org_name}: 統括組織の登録に失敗: ${orgError?.message ?? '不明なエラー'}`);
      continue;
    }
    const organizationId = (orgData as { id: number }).id;

    const { data: officeData, error: officeError } = await supabase
      .from('organization_offices')
      .upsert(
        {
          organization_id: organizationId,
          name: r.office_name.trim(),
          postal_code: emptyToNull(r.postal_code),
          address: emptyToNull(r.address),
          phone: emptyToNull(r.phone),
          fax: emptyToNull(r.fax),
          email: emptyToNull(r.email),
          website_url: emptyToNull(r.website_url),
          official_url: emptyToNull(r.official_url),
          e_filing_url: emptyToNull(r.e_filing_url),
          download_page_url: emptyToNull(r.download_page_url),
          map_url: emptyToNull(r.map_url),
          business_hours: emptyToNull(r.business_hours),
          notes: emptyToNull(r.notes),
        },
        { onConflict: 'organization_id,name' },
      )
      .select('id')
      .single();
    if (officeError || !officeData) {
      errors.push(`${r.office_name}: 窓口の登録に失敗: ${officeError?.message ?? '不明なエラー'}`);
      continue;
    }
    const officeId = (officeData as { id: number }).id;

    const muniCodes = (r.muni_codes ?? '')
      .split('|')
      .map((c) => c.trim())
      .filter(Boolean);
    const jurisdictionRows: { municipality_id: number; organization_type_id: number; organization_office_id: number }[] = [];
    for (const code of muniCodes) {
      const muniId = muniIdByCode.get(code);
      if (!muniId) {
        errors.push(`市区町村コード ${code}（${r.office_name}）が見つかりません（先に municipalities.csv を取り込んでください）`);
        continue;
      }
      jurisdictionRows.push({ municipality_id: muniId, organization_type_id: typeId, organization_office_id: officeId });
    }

    if (jurisdictionRows.length > 0) {
      const { error: jurisError } = await supabase
        .from('jurisdictions')
        .upsert(jurisdictionRows, { onConflict: 'municipality_id,organization_type_id' });
      if (jurisError) {
        errors.push(`${r.office_name}: 対応市区町村の登録に失敗: ${jurisError.message}`);
        continue;
      }
    }

    succeeded += 1;
  }

  return { total: rows.length, succeeded, failed: rows.length - succeeded, errors };
}

export async function importOfficialLinks(
  supabase: BrowserSupabaseClient,
  rows: OfficialLinkCsvRow[],
): Promise<ImportSummary> {
  const errors: string[] = [];
  const validRows = rows.filter((r) => r.org_type_code?.trim() && r.office_name?.trim());

  const { data: officeData, error: officeFetchError } = await supabase
    .from('organization_offices')
    .select('id, name, organizations(organization_types(code))');
  if (officeFetchError) errors.push(`管轄機関の取得に失敗: ${officeFetchError.message}`);

  type RawOffice = { id: number; name: string; organizations: { organization_types: { code: string } | null } | null };
  const officeIdByKey = new Map(
    ((officeData as unknown as RawOffice[] | null) ?? [])
      .filter((o) => o.organizations?.organization_types?.code)
      .map((o) => [`${o.organizations!.organization_types!.code}:${o.name}`, o.id]),
  );

  let succeeded = 0;
  const results = await Promise.all(
    validRows.map(async (r) => {
      const officeId = officeIdByKey.get(`${r.org_type_code.trim()}:${r.office_name.trim()}`);
      if (!officeId) {
        return {
          ok: false,
          message: `${r.org_type_code} / ${r.office_name} の管轄機関が見つかりません（先に organization_offices.csv を取り込んでください）`,
        };
      }

      const status = emptyToNull(r.official_url_status) ?? 'unchecked';
      const { error } = await supabase
        .from('organization_offices')
        .update({
          official_url: emptyToNull(r.official_url),
          official_url_status: status,
          official_url_checked_at: new Date().toISOString(),
          fallback_url: emptyToNull(r.fallback_url),
        })
        .eq('id', officeId);

      if (error) return { ok: false, message: error.message };
      return { ok: true, message: '' };
    }),
  );

  for (const r of results) {
    if (r.ok) succeeded += 1;
    else errors.push(r.message);
  }

  return { total: rows.length, succeeded, failed: rows.length - succeeded, errors };
}
