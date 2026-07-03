import type { BrowserSupabaseClient } from './supabase/browser';

export type ImportSummary = {
  total: number;
  succeeded: number;
  failed: number;
  errors: string[];
};

type MunicipalityCsvRow = { pref_code: string; pref_name: string; muni_code: string; muni_name: string };
type JurisdictionOfficeCsvRow = {
  muni_code: string;
  office_type: string;
  name: string;
  address?: string;
  phone?: string;
  website_url?: string;
  map_url?: string;
};
type OfficialLinkCsvRow = {
  muni_code: string;
  office_type: string;
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

export async function importJurisdictionOffices(
  supabase: BrowserSupabaseClient,
  rows: JurisdictionOfficeCsvRow[],
): Promise<ImportSummary> {
  const errors: string[] = [];
  const validRows = rows.filter((r) => r.muni_code?.trim() && r.office_type?.trim() && r.name?.trim());

  const { data: muniData, error: muniFetchError } = await supabase.from('municipalities').select('id, code');
  if (muniFetchError) errors.push(`市区町村の取得に失敗: ${muniFetchError.message}`);

  const muniIdByCode = new Map(((muniData as { id: number; code: string }[] | null) ?? []).map((m) => [m.code, m.id]));

  const officeRows: {
    municipality_id: number;
    office_type: string;
    name: string;
    address: string | null;
    phone: string | null;
    website_url: string | null;
    map_url: string | null;
  }[] = [];

  for (const r of validRows) {
    const muniId = muniIdByCode.get(r.muni_code.trim());
    if (!muniId) {
      errors.push(`市区町村コード ${r.muni_code} が見つかりません（先に municipalities.csv を取り込んでください）`);
      continue;
    }
    officeRows.push({
      municipality_id: muniId,
      office_type: r.office_type.trim(),
      name: r.name.trim(),
      address: emptyToNull(r.address),
      phone: emptyToNull(r.phone),
      website_url: emptyToNull(r.website_url),
      map_url: emptyToNull(r.map_url),
    });
  }

  let succeeded = 0;
  if (officeRows.length > 0) {
    const { error, count } = await supabase
      .from('jurisdiction_offices')
      .upsert(officeRows, { onConflict: 'municipality_id,office_type', count: 'exact' });
    if (error) {
      errors.push(`管轄機関の登録に失敗: ${error.message}`);
    } else {
      succeeded = count ?? officeRows.length;
    }
  }

  return { total: rows.length, succeeded, failed: rows.length - succeeded, errors };
}

export async function importOfficialLinks(
  supabase: BrowserSupabaseClient,
  rows: OfficialLinkCsvRow[],
): Promise<ImportSummary> {
  const errors: string[] = [];
  const validRows = rows.filter((r) => r.muni_code?.trim() && r.office_type?.trim());

  const [{ data: muniData, error: muniFetchError }, { data: officeData, error: officeFetchError }] = await Promise.all([
    supabase.from('municipalities').select('id, code'),
    supabase.from('jurisdiction_offices').select('id, municipality_id, office_type'),
  ]);
  if (muniFetchError) errors.push(`市区町村の取得に失敗: ${muniFetchError.message}`);
  if (officeFetchError) errors.push(`管轄機関の取得に失敗: ${officeFetchError.message}`);

  const muniIdByCode = new Map(((muniData as { id: number; code: string }[] | null) ?? []).map((m) => [m.code, m.id]));
  const officeIdByKey = new Map(
    ((officeData as { id: number; municipality_id: number; office_type: string }[] | null) ?? []).map((o) => [
      `${o.municipality_id}:${o.office_type}`,
      o.id,
    ]),
  );

  let succeeded = 0;
  const results = await Promise.all(
    validRows.map(async (r) => {
      const muniId = muniIdByCode.get(r.muni_code.trim());
      if (!muniId) return { ok: false, message: `市区町村コード ${r.muni_code} が見つかりません` };

      const officeId = officeIdByKey.get(`${muniId}:${r.office_type.trim()}`);
      if (!officeId) {
        return {
          ok: false,
          message: `${r.muni_code} / ${r.office_type} の管轄機関が見つかりません（先に jurisdiction_offices.csv を取り込んでください）`,
        };
      }

      const status = emptyToNull(r.official_url_status) ?? 'unchecked';
      const { error } = await supabase
        .from('jurisdiction_offices')
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
