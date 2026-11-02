import type { SupabaseClient } from '@supabase/supabase-js';
export type OfficeValues = {
  id?: number;
  organization_id?: number;
  organization_type_id: number | '';
  organization_name: string;
  name: string;
  municipality_ids: number[];
} & Record<string, unknown>;
export type OfficeSnapshot = {
  office: Record<string, unknown>;
  organization: Record<string, unknown>;
  jurisdictions: {
    id: number;
    municipality_id: number;
    organization_type_id: number;
    organization_office_id: number;
  }[];
};
export const officeTextFields = [
  'postal_code',
  'address',
  'phone',
  'fax',
  'email',
  'website_url',
  'official_url',
  'fallback_url',
  'e_filing_url',
  'download_page_url',
  'map_url',
  'business_hours',
  'notes',
] as const;
const id = (v: unknown): v is number =>
  Number.isSafeInteger(v) && Number(v) > 0;
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
export function validOfficeSnapshot(v: unknown): v is OfficeSnapshot {
  if (
    !object(v) ||
    !object(v.office) ||
    !object(v.organization) ||
    !Array.isArray(v.jurisdictions)
  )
    return false;
  const o = v.office,
    g = v.organization;
  return (
    id(o.id) &&
    id(g.id) &&
    o.organization_id === g.id &&
    id(g.organization_type_id) &&
    typeof g.name === 'string' &&
    typeof o.name === 'string' &&
    typeof o.updated_at === 'string' &&
    typeof o.created_at === 'string' &&
    (o.official_url_status === null ||
      ['unchecked', 'ok', 'broken', 'redirected'].includes(
        String(o.official_url_status),
      )) &&
    officeTextFields.every((k) => o[k] === null || typeof o[k] === 'string') &&
    v.jurisdictions.every(
      (j) =>
        object(j) &&
        id(j.id) &&
        id(j.municipality_id) &&
        id(j.organization_type_id) &&
        j.organization_office_id === o.id,
    ) &&
    new Set(v.jurisdictions.map((j) => j.id)).size === v.jurisdictions.length &&
    new Set(v.jurisdictions.map((j) => j.municipality_id)).size ===
      v.jurisdictions.length
  );
}
export async function readOffice(
  client: SupabaseClient,
  officeId: number,
): Promise<
  | { status: 'loaded'; snapshot: OfficeSnapshot }
  | { status: 'missing' }
  | { status: 'unavailable' }
> {
  try {
    const [o, j] = await Promise.all([
      client
        .from('organization_offices')
        .select('*, organizations(*)')
        .eq('id', officeId)
        .maybeSingle(),
      client
        .from('jurisdictions')
        .select('*')
        .eq('organization_office_id', officeId)
        .order('id'),
    ]);
    if (o.error || j.error || !Array.isArray(j.data) || o.data === undefined)
      return { status: 'unavailable' };
    if (o.data === null) return { status: 'missing' };
    const { organizations, ...office } = o.data;
    const snapshot = {
      office,
      organization: organizations,
      jurisdictions: j.data,
    };
    return validOfficeSnapshot(snapshot) && snapshot.office.id === officeId
      ? { status: 'loaded', snapshot }
      : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}
async function readMunicipalities(client: SupabaseClient) {
  const rows: {
    id: number;
    code: string;
    name: string;
    prefectures: unknown;
  }[] = [];
  const seen = new Set<number>();
  for (let offset = 0; ; offset += 1000) {
    const result = await client
      .from('municipalities')
      .select('id, code, name, prefectures(name)')
      .order('code')
      .range(offset, offset + 999);
    if (result.error || !Array.isArray(result.data))
      return { data: null, error: true };
    for (const row of result.data) {
      if (!id(row.id) || seen.has(row.id)) return { data: null, error: true };
      seen.add(row.id);
      rows.push(row);
    }
    if (result.data.length < 1000) return { data: rows, error: false };
  }
}
export async function loadOfficeEditor(
  client: SupabaseClient | null,
  officeId: number | null,
) {
  if (!client) return { status: 'unavailable' as const };
  try {
    const [m, t, o] = await Promise.all([
      readMunicipalities(client),
      client
        .from('organization_types')
        .select('id, code, name')
        .eq('is_active', true)
        .order('sort_order'),
      officeId === null ? Promise.resolve(null) : readOffice(client, officeId),
    ]);
    if (
      m.error ||
      t.error ||
      !Array.isArray(m.data) ||
      !Array.isArray(t.data) ||
      o?.status === 'unavailable'
    )
      return { status: 'unavailable' as const };
    if (
      !m.data.every(
        (r) =>
          id(r.id) &&
          typeof r.code === 'string' &&
          typeof r.name === 'string' &&
          object(r.prefectures) &&
          typeof r.prefectures.name === 'string',
      ) ||
      !t.data.every(
        (r) =>
          id(r.id) && typeof r.code === 'string' && typeof r.name === 'string',
      )
    )
      return { status: 'unavailable' as const };
    if (o?.status === 'missing') return { status: 'missing' as const };
    const municipalities = m.data.map((r) => ({
      id: r.id as number,
      code: r.code as string,
      name: r.name as string,
      prefecture_name: (r.prefectures as unknown as { name: string }).name,
    }));
    const organizationTypes = t.data as {
      id: number;
      code: string;
      name: string;
    }[];
    if (
      new Set(municipalities.map((r) => r.id)).size !== municipalities.length ||
      new Set(organizationTypes.map((r) => r.id)).size !==
        organizationTypes.length
    )
      return { status: 'unavailable' as const };
    const snapshot = o?.status === 'loaded' ? o.snapshot : null;
    if (
      snapshot &&
      (!organizationTypes.some(
        (t) => t.id === snapshot.organization.organization_type_id,
      ) ||
        snapshot.jurisdictions.some(
          (j) =>
            j.organization_type_id !==
              snapshot.organization.organization_type_id ||
            !municipalities.some((m) => m.id === j.municipality_id),
        ))
    )
      return { status: 'unavailable' as const };
    return {
      status: 'loaded' as const,
      municipalities,
      organizationTypes,
      snapshot,
    };
  } catch {
    return { status: 'unavailable' as const };
  }
}
export function officeConfiguration(s: OfficeSnapshot) {
  return {
    name: String(s.office.name),
    organization_name: String(s.organization.name),
    organization_type_id: Number(s.organization.organization_type_id),
    official_url_status: String(s.office.official_url_status ?? 'unchecked'),
    ...Object.fromEntries(
      officeTextFields.map((k) => [k, String(s.office[k] ?? '')]),
    ),
    municipality_ids: s.jurisdictions
      .map((j) => j.municipality_id)
      .sort((a, b) => a - b),
  };
}
export function configurationFromValues(v: OfficeValues) {
  return {
    name: v.name.trim(),
    organization_name: v.organization_name.trim(),
    organization_type_id: v.organization_type_id,
    official_url_status: String(v.official_url_status),
    ...Object.fromEntries(officeTextFields.map((k) => [k, String(v[k])])),
    municipality_ids: [...v.municipality_ids].sort((a, b) => a - b),
  };
}
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (object(v))
    return (
      '{' +
      Object.keys(v)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonical(v[k]))
        .join(',') +
      '}'
    );
  return JSON.stringify(v) ?? 'null';
}
export type OfficeSaveIntent = {
  version: 1;
  id: number | null;
  configuration: ReturnType<typeof configurationFromValues>;
};
export function validOfficeIntent(v: unknown): v is OfficeSaveIntent {
  if (
    !object(v) ||
    v.version !== 1 ||
    (v.id !== null && !id(v.id)) ||
    !object(v.configuration)
  )
    return false;
  const c = v.configuration;
  return (
    typeof c.name === 'string' &&
    c.name.trim() !== '' &&
    typeof c.organization_name === 'string' &&
    c.organization_name.trim() !== '' &&
    id(c.organization_type_id) &&
    officeTextFields.every((k) => typeof c[k] === 'string') &&
    ['unchecked', 'ok', 'broken', 'redirected'].includes(
      String(c.official_url_status),
    ) &&
    Array.isArray(c.municipality_ids) &&
    c.municipality_ids.every(id)
  );
}
export async function reconcileOfficeSave(
  client: SupabaseClient,
  intent: OfficeSaveIntent,
): Promise<'saved' | 'different' | 'unavailable'> {
  try {
    let officeId = intent.id;
    if (officeId === null) {
      const r = await client
        .from('organization_offices')
        .select('id, organizations!inner(name,organization_type_id)')
        .eq('name', intent.configuration.name)
        .eq('organizations.name', intent.configuration.organization_name)
        .eq(
          'organizations.organization_type_id',
          intent.configuration.organization_type_id,
        )
        .maybeSingle();
      if (r.error || r.data === undefined) return 'unavailable';
      if (r.data === null) return 'different';
      if (!id(r.data.id)) return 'unavailable';
      officeId = r.data.id;
    }
    const r = await readOffice(client, officeId);
    if (r.status === 'unavailable') return 'unavailable';
    if (r.status === 'missing') return 'different';
    return canonical(officeConfiguration(r.snapshot)) ===
      canonical(intent.configuration)
      ? 'saved'
      : 'different';
  } catch {
    return 'unavailable';
  }
}
