import type { SupabaseClient } from '@/lib/supabase';
import type { LinkStatus } from '@/lib/types';
import type {
  CompanyLocation,
  OfficeSource,
  ProcedureSubmissionRule,
  SubmissionJurisdiction,
  SubmissionOffice,
} from './types';

// ── データアクセス（Phase2: 福岡県パイロット）───────────────────────
// submission_offices / office_sources / submission_jurisdictions / procedure_submission_rules への
// Supabase問い合わせのみを担当する。判定ロジック（resolve.ts / stateModel.ts）は一切含まない
// （UIへ直接ロジックを書かず、共通サービスとして型定義・判定関数・データアクセス・状態変換・
// 公開表示用の説明生成を分離する、という今回の実装方針）。

type RawJurisdictionRow = {
  id: number;
  office_id: number;
  office_category: string;
  scope_type: string;
  municipality_scope_id: number | null;
  prefecture_scope_id: number | null;
  is_primary: boolean;
  priority: number;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
};

type RawOfficeRow = {
  id: number;
  office_category: string;
  organization_name: string | null;
  name: string;
  postal_code: string | null;
  address: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
  website_url: string | null;
  official_url: string | null;
  e_filing_url: string | null;
  download_page_url: string | null;
  map_url: string | null;
  business_hours: string | null;
  notes: string | null;
  official_url_status: string;
  official_url_checked_at: string | null;
  fallback_url: string | null;
  data_version: number;
  last_verified_at: string | null;
  verification_due_at: string | null;
  update_frequency: string;
  is_active: boolean;
};

type RawSourceRow = {
  id: number;
  office_id: number;
  source_type: string;
  publisher_name: string;
  source_url: string | null;
  retrieved_at: string;
  verification_method: string;
  verified_by: string | null;
  status: string;
  is_current: boolean;
  notes: string | null;
};

type RawRuleRow = {
  id: number;
  procedure_id: number;
  office_category: string;
  conditions: unknown;
  recipient_scope: string;
  priority: number;
  is_active: boolean;
  notes: string | null;
};

function toSubmissionJurisdiction(r: RawJurisdictionRow): SubmissionJurisdiction {
  return {
    id: r.id,
    officeId: r.office_id,
    officeCategory: r.office_category,
    scopeType: r.scope_type as SubmissionJurisdiction['scopeType'],
    municipalityScopeId: r.municipality_scope_id,
    prefectureScopeId: r.prefecture_scope_id,
    isPrimary: r.is_primary,
    priority: r.priority,
    effectiveFrom: r.effective_from,
    effectiveTo: r.effective_to,
    notes: r.notes,
  };
}

function toSubmissionOffice(r: RawOfficeRow): SubmissionOffice {
  return {
    id: r.id,
    officeCategory: r.office_category,
    organizationName: r.organization_name,
    name: r.name,
    postalCode: r.postal_code,
    address: r.address,
    phone: r.phone,
    fax: r.fax,
    email: r.email,
    websiteUrl: r.website_url,
    officialUrl: r.official_url,
    eFilingUrl: r.e_filing_url,
    downloadPageUrl: r.download_page_url,
    mapUrl: r.map_url,
    businessHours: r.business_hours,
    notes: r.notes,
    officialUrlStatus: r.official_url_status as LinkStatus,
    officialUrlCheckedAt: r.official_url_checked_at,
    fallbackUrl: r.fallback_url,
    dataVersion: r.data_version,
    lastVerifiedAt: r.last_verified_at,
    verificationDueAt: r.verification_due_at,
    updateFrequency: r.update_frequency as SubmissionOffice['updateFrequency'],
    isActive: r.is_active,
  };
}

function toOfficeSource(r: RawSourceRow): OfficeSource {
  return {
    id: r.id,
    officeId: r.office_id,
    sourceType: r.source_type as OfficeSource['sourceType'],
    publisherName: r.publisher_name,
    sourceUrl: r.source_url,
    retrievedAt: r.retrieved_at,
    verificationMethod: r.verification_method as OfficeSource['verificationMethod'],
    verifiedBy: r.verified_by,
    status: r.status as OfficeSource['status'],
    isCurrent: r.is_current,
    notes: r.notes,
  };
}

function toProcedureSubmissionRule(r: RawRuleRow): ProcedureSubmissionRule {
  return {
    id: r.id,
    procedureId: r.procedure_id,
    officeCategory: r.office_category,
    conditions: Array.isArray(r.conditions) ? (r.conditions as ProcedureSubmissionRule['conditions']) : [],
    recipientScope: r.recipient_scope as ProcedureSubmissionRule['recipientScope'],
    priority: r.priority,
    isActive: r.is_active,
    notes: r.notes,
  };
}

// 会社プロフィールの municipality_code/prefecture_code から、submission_jurisdictions が
// FKとして参照する内部IDへ変換する（D9: scope_codeはポリモーフィズムを解消し、municipalities/
// prefectures の実IDを持つ設計にしたため、この変換が必要になる）。郵便番号は使わない（D1）。
export async function resolveCompanyLocation(
  client: SupabaseClient,
  params: { municipalityCode: string | null; prefectureCode: string | null },
): Promise<CompanyLocation> {
  let municipalityId: number | null = null;
  let prefectureId: number | null = null;

  if (params.municipalityCode) {
    const { data } = await client
      .from('municipalities')
      .select('id')
      .eq('code', params.municipalityCode)
      .maybeSingle();
    municipalityId = (data as { id: number } | null)?.id ?? null;
  }

  if (params.prefectureCode) {
    const { data } = await client
      .from('prefectures')
      .select('id')
      .eq('code', params.prefectureCode)
      .maybeSingle();
    prefectureId = (data as { id: number } | null)?.id ?? null;
  }

  return { municipalityId, prefectureId };
}

export async function fetchProcedureOfficeType(
  client: SupabaseClient,
  procedureId: number,
): Promise<string | null> {
  const { data } = await client
    .from('procedures')
    .select('office_type')
    .eq('id', procedureId)
    .maybeSingle();
  return (data as { office_type: string } | null)?.office_type ?? null;
}

export async function fetchActiveProcedureRules(
  client: SupabaseClient,
  procedureId: number,
): Promise<ProcedureSubmissionRule[]> {
  const { data } = await client
    .from('procedure_submission_rules')
    .select('id, procedure_id, office_category, conditions, recipient_scope, priority, is_active, notes')
    .eq('procedure_id', procedureId)
    .eq('is_active', true)
    .order('priority');

  return ((data as RawRuleRow[] | null) ?? []).map(toProcedureSubmissionRule);
}

// 該当 office_category の全スコープ階層分の候補を取得する（Phase2はデータ量が小さいため、
// アプリ側でスコープ降格探索を行う設計。resolve.ts の findAtScope が絞り込みを担当する）。
export async function fetchJurisdictionCandidates(
  client: SupabaseClient,
  officeCategory: string,
): Promise<SubmissionJurisdiction[]> {
  const { data } = await client
    .from('submission_jurisdictions')
    .select(
      'id, office_id, office_category, scope_type, municipality_scope_id, prefecture_scope_id, is_primary, priority, effective_from, effective_to, notes',
    )
    .eq('office_category', officeCategory)
    .is('effective_to', null);

  return ((data as RawJurisdictionRow[] | null) ?? []).map(toSubmissionJurisdiction);
}

export async function fetchOfficesByIds(
  client: SupabaseClient,
  ids: number[],
): Promise<Map<number, SubmissionOffice>> {
  if (ids.length === 0) return new Map();
  const { data } = await client
    .from('submission_offices')
    .select(
      'id, office_category, organization_name, name, postal_code, address, phone, fax, email, website_url, official_url, e_filing_url, download_page_url, map_url, business_hours, notes, official_url_status, official_url_checked_at, fallback_url, data_version, last_verified_at, verification_due_at, update_frequency, is_active',
    )
    .in('id', ids);

  const map = new Map<number, SubmissionOffice>();
  for (const row of (data as RawOfficeRow[] | null) ?? []) {
    map.set(row.id, toSubmissionOffice(row));
  }
  return map;
}

export async function fetchCurrentSourcesByOfficeIds(
  client: SupabaseClient,
  officeIds: number[],
): Promise<Map<number, OfficeSource>> {
  if (officeIds.length === 0) return new Map();
  const { data } = await client
    .from('office_sources')
    .select('id, office_id, source_type, publisher_name, source_url, retrieved_at, verification_method, verified_by, status, is_current, notes')
    .in('office_id', officeIds)
    .eq('is_current', true);

  const map = new Map<number, OfficeSource>();
  for (const row of (data as RawSourceRow[] | null) ?? []) {
    map.set(row.office_id, toOfficeSource(row));
  }
  return map;
}

// locationLabel/prefectureLabel（explain.ts へ渡す表示用ラベル）の組み立てに使う。
export async function fetchLocationLabels(
  client: SupabaseClient,
  location: CompanyLocation,
): Promise<{ municipalityName: string | null; prefectureName: string | null }> {
  let municipalityName: string | null = null;
  let prefectureName: string | null = null;

  if (location.municipalityId !== null) {
    const { data } = await client
      .from('municipalities')
      .select('name')
      .eq('id', location.municipalityId)
      .maybeSingle();
    municipalityName = (data as { name: string } | null)?.name ?? null;
  }

  if (location.prefectureId !== null) {
    const { data } = await client
      .from('prefectures')
      .select('name')
      .eq('id', location.prefectureId)
      .maybeSingle();
    prefectureName = (data as { name: string } | null)?.name ?? null;
  }

  return { municipalityName, prefectureName };
}
