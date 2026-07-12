import {
  DiagnosisInput,
  DiagnosisResult,
  JurisdictionOffice,
  LinkStatus,
  ProcedureDocumentItemType,
  ProcedureResult,
} from './types';
import type { SupabaseClient } from './supabase';

const VALID_DOCUMENT_ITEM_TYPES: ProcedureDocumentItemType[] = ['document', 'preparation', 'checklist'];

// procedure_documents の生データ（Supabaseのjoin結果）を ProcedureResult.procedure_documents の
// 形へ正規化する。runDiagnosis（本ファイル）・buildAnnualRoadmap（roadmap.ts）の両方から使う
// 共通ヘルパー（診断エンジン・経営イベントエンジンで共通するロジックはsrc/lib/に置く、という
// CLAUDE.mdの方針に従う）。item_typeが未設定・不正値の場合は'document'にフォールバックする
// （旧データ・migration未適用環境でも誤動作しないようにするための防御的処理、Sprint54）。
export function normalizeProcedureDocuments(raw: unknown): ProcedureResult['procedure_documents'] {
  const rows = (raw as Record<string, unknown>[] | null) ?? [];
  return rows.map((r) => {
    const itemType = r.item_type as ProcedureDocumentItemType | undefined;
    return {
      name: r.name as string,
      form_number: (r.form_number as string | null) ?? null,
      is_required: (r.is_required as boolean) ?? true,
      notes: (r.notes as string | null) ?? null,
      item_type: itemType && VALID_DOCUMENT_ITEM_TYPES.includes(itemType) ? itemType : 'document',
      sort_order: (r.sort_order as number | undefined) ?? 0,
    };
  });
}

type RawJurisdictionRow = {
  organization_types: { code: string } | null;
  organization_offices: {
    id: number;
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
    official_url_status: string | null;
    official_url_checked_at: string | null;
    fallback_url: string | null;
  } | null;
};

// ── 期限計算 ───────────────────────────────────────────────────

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function calculateNextDeadline(
  timingType: string,
  timingData: Record<string, unknown> | null,
  fiscalMonth: number,
  // 実際のイベント発生日（ISO）。経営イベントエンジン（anonymous_company_events.event_date）からのみ渡される。
  // 通常の診断フロー（/start → /result）には起算日が存在しないため未指定のままとなり、
  // 従来通り label/date とも null を返す（後方互換）。
  eventDate?: string,
): { label: string | null; date: string | null } {
  const today = new Date();
  const year = today.getFullYear();

  switch (timingType) {
    case 'at_establishment':
    case 'hiring_event':
    case 'event_based': {
      if (!eventDate) return { label: null, date: null }; // 起算日不明の場合は計算不可
      const daysFromEvent = timingData?.days_from_event as number | undefined;
      if (daysFromEvent === undefined) return { label: null, date: null };
      const base = new Date(`${eventDate}T00:00:00`);
      const deadline = new Date(base.getTime() + daysFromEvent * 86400000);
      return {
        label: `${deadline.getFullYear()}年${deadline.getMonth() + 1}月${deadline.getDate()}日`,
        date: toIsoDate(deadline),
      };
    }

    case 'fiscal_offset': {
      const months = (timingData?.months as number) ?? 2;
      const rawMonth = fiscalMonth + months;
      const monthIndex = (rawMonth - 1) % 12;
      const deadlineMonth = monthIndex + 1;
      let deadlineYear = year;
      const d = new Date(year, monthIndex + 1, 0); // その月の末日
      if (d < today) deadlineYear = year + 1;
      const lastDay = new Date(deadlineYear, monthIndex + 1, 0).getDate();
      const deadlineDate = new Date(deadlineYear, monthIndex, lastDay);
      return {
        label: `${deadlineYear}年${deadlineMonth}月${lastDay}日`,
        date: toIsoDate(deadlineDate),
      };
    }

    case 'fixed_date': {
      const m = timingData?.month as number;
      const day = timingData?.day as number;
      let d = new Date(year, m - 1, day);
      if (d < today) d = new Date(year + 1, m - 1, day);
      return { label: `${d.getFullYear()}年${m}月${day}日`, date: toIsoDate(d) };
    }

    case 'period': {
      const sm = timingData?.startMonth as number;
      const sd = timingData?.startDay as number;
      const em = timingData?.endMonth as number;
      const ed = timingData?.endDay as number;
      const endDate = new Date(year, em - 1, ed);
      const targetYear = endDate < today ? year + 1 : year;
      const resolvedEndDate = new Date(targetYear, em - 1, ed);
      return {
        label: `${targetYear}年${sm}月${sd}日〜${em}月${ed}日`,
        date: toIsoDate(resolvedEndDate),
      };
    }

    case 'monthly_10th': {
      const nextM = today.getMonth() + 2; // 来月（1-indexed）
      const m = nextM > 12 ? 1 : nextM;
      const y = nextM > 12 ? year + 1 : year;
      return { label: `${y}年${m}月10日`, date: toIsoDate(new Date(y, m - 1, 10)) };
    }

    default:
      return { label: null, date: null };
  }
}

// ── 管轄機関の解決（診断エンジン・経営イベントエンジン共通） ────

export async function resolveOffices(
  client: SupabaseClient,
  municipalityId: number,
): Promise<JurisdictionOffice[]> {
  const { data: jurisRaw } = await client
    .from('jurisdictions')
    .select(
      `organization_types(code),
       organization_offices(id, name, postal_code, address, phone, fax, email, website_url, official_url,
         e_filing_url, download_page_url, map_url, business_hours, notes,
         official_url_status, official_url_checked_at, fallback_url)`,
    )
    .eq('municipality_id', municipalityId)
    .order('id');

  return ((jurisRaw as RawJurisdictionRow[] | null) ?? [])
    .filter(
      (j): j is RawJurisdictionRow & { organization_types: { code: string }; organization_offices: NonNullable<RawJurisdictionRow['organization_offices']> } =>
        Boolean(j.organization_types && j.organization_offices),
    )
    .map((j) => {
      const o = j.organization_offices;
      return {
        id: o.id,
        municipality_id: municipalityId,
        office_type: j.organization_types.code,
        name: o.name,
        address: o.address,
        phone: o.phone,
        website_url: o.website_url,
        map_url: o.map_url,
        official_url: o.official_url,
        official_url_status: o.official_url_status as LinkStatus,
        official_url_checked_at: o.official_url_checked_at,
        fallback_url: o.fallback_url,
        postal_code: o.postal_code,
        fax: o.fax,
        email: o.email,
        e_filing_url: o.e_filing_url,
        download_page_url: o.download_page_url,
        business_hours: o.business_hours,
        notes: o.notes,
      };
    });
}

// ── メイン診断関数 ────────────────────────────────────────────

export async function runDiagnosis(
  client: SupabaseClient | null,
  input: DiagnosisInput,
): Promise<DiagnosisResult> {
  if (!client) return { offices: [], procedures: [] };

  // 1. 市区町村を特定
  const { data: muniRaw } = await client
    .from('municipalities')
    .select('id')
    .eq('code', input.municipalityCode)
    .single();

  // Supabase クライアント無型版では data が never に推論されるためキャスト
  const muni = muniRaw as { id: number } | null;
  if (!muni) return { offices: [], procedures: [] };

  // 2. 管轄機関を取得（jurisdictions 経由で organization_offices を解決）
  const offices = await resolveOffices(client, muni.id);

  // 3. 手続きを取得・フィルタ
  let query = client
    .from('procedures')
    .select(
      '*, official_links(label, url, status, fallback_url), procedure_documents(name, form_number, is_required, notes, item_type, sort_order)',
    )
    .eq('is_active', true)
    .eq('include_in_diagnosis', true)
    .order('priority');

  // 従業員なしの場合は requires_employees=false の手続きのみ
  if (!input.hasEmployees) {
    query = query.eq('requires_employees', false);
  }

  const { data: procsRaw } = await query;

  // 4. 各手続きに管轄機関を紐づけ・期限計算
  const officeMap = new Map<string, JurisdictionOffice>(
    offices.map((o) => [o.office_type, o]),
  );

  const procedures: ProcedureResult[] = ((procsRaw as Record<string, unknown>[] | null) ?? [])
    .filter((p) => {
      // 法人形態が指定された手続きは一致するものだけ表示
      const corporateType = p.corporate_type as string | null;
      if (corporateType && corporateType !== input.corporateType) return false;
      // 役員任期を前提とする手続きは、役員任期ありと回答した場合のみ表示
      if (p.requires_officer_term && !input.hasOfficerTerm) return false;
      return true;
    })
    .map((p: Record<string, unknown>) => {
      const deadline = calculateNextDeadline(
        p.timing_type as string,
        p.timing_data as Record<string, unknown> | null,
        input.fiscalMonth,
      );
      return {
        ...(p as ProcedureResult),
        next_deadline: deadline.label,
        next_deadline_date: deadline.date,
        office: officeMap.get(p.office_type as string) ?? null,
        official_links:
          (p.official_links as { label: string; url: string; status?: LinkStatus; fallback_url?: string | null }[]) ?? [],
        procedure_documents: normalizeProcedureDocuments(p.procedure_documents),
      };
    });

  return { offices, procedures };
}
