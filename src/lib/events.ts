import {
  CompanyEventInput,
  EventRegistrationResult,
  EventType,
  JurisdictionOffice,
  LinkStatus,
  ProcedureResult,
} from './types';
import { calculateNextDeadline, resolveOffices } from './diagnosis';
import { evaluateRules, type RuleContext } from './ruleEngine';
import type { SupabaseClient } from './supabase';

// anonymous_company_events.browser_id はアカウント機能が無いため、ブラウザ単位で
// 「自分が登録したイベント」を束ねるためだけの識別子（他機能のlocalStorage方式と同じ信頼モデル）。
const BROWSER_ID_KEY = 'sunboo:browser-id';

export function getBrowserId(): string {
  if (typeof window === 'undefined') return '';
  let id = window.localStorage.getItem(BROWSER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(BROWSER_ID_KEY, id);
  }
  return id;
}

export async function fetchEventTypes(client: SupabaseClient): Promise<EventType[]> {
  const { data } = await client
    .from('event_types')
    .select('id, code, name, description, sort_order, is_active')
    .eq('is_active', true)
    .order('sort_order');
  return (data as EventType[] | null) ?? [];
}

async function resolvePrefectureCode(client: SupabaseClient, municipalityId: number): Promise<string | null> {
  const { data } = await client
    .from('municipalities')
    .select('prefectures(code)')
    .eq('id', municipalityId)
    .single();
  const row = data as { prefectures: { code: string } | null } | null;
  return row?.prefectures?.code ?? null;
}

// イベント登録 + ルールエンジンによる必要手続きの自動判定・生成
export async function registerCompanyEvent(
  client: SupabaseClient,
  browserId: string,
  input: CompanyEventInput,
): Promise<EventRegistrationResult | null> {
  // 1. イベント種別を特定
  const { data: eventTypeRaw } = await client
    .from('event_types')
    .select('id, code, name, description, sort_order, is_active')
    .eq('code', input.eventTypeCode)
    .single();
  const eventType = eventTypeRaw as EventType | null;
  if (!eventType) return null;

  // 2. 市区町村を特定
  const { data: muniRaw } = await client
    .from('municipalities')
    .select('id')
    .eq('code', input.municipalityCode)
    .single();
  const muni = muniRaw as { id: number } | null;
  if (!muni) return null;

  // 3. イベントを登録
  const { data: eventRowRaw, error } = await client
    .from('anonymous_company_events')
    .insert({
      browser_id: browserId,
      event_type_id: eventType.id,
      event_date: input.eventDate,
      municipality_id: muni.id,
      corporate_type: input.corporateType,
      has_employees: input.hasEmployees,
    })
    .select('id')
    .single();
  if (error || !eventRowRaw) return null;
  const eventId = (eventRowRaw as { id: number }).id;

  // 4. 管轄機関を解決（診断エンジンと同じクエリを再利用）
  const offices = await resolveOffices(client, muni.id);
  const officeMap = new Map<string, JurisdictionOffice>(offices.map((o) => [o.office_type, o]));

  // 5. ルールエンジンでコンテキストを評価し、追加すべき手続き・警告・上書き情報を得る。
  // 「どの手続きが該当するか」の判断はここでは一切ハードコードせず、rules テーブルの内容が全て。
  const prefectureCode = await resolvePrefectureCode(client, muni.id);
  const context: RuleContext = {
    event_type_code: input.eventTypeCode,
    corporate_type: input.corporateType,
    has_employees: input.hasEmployees,
    prefecture_code: prefectureCode,
  };
  const ruleResult = await evaluateRules(client, context);

  if (ruleResult.addProcedureIds.length === 0) {
    return { eventId, eventType, procedures: [], warnings: ruleResult.warnings };
  }

  const { data: procsRaw } = await client
    .from('procedures')
    .select(
      '*, official_links(label, url, status, fallback_url), procedure_documents(name, form_number, is_required, notes)',
    )
    .in('id', ruleResult.addProcedureIds);

  const procedures: ProcedureResult[] = ((procsRaw as Record<string, unknown>[] | null) ?? []).map((p) => {
    const procedureId = p.id as number;

    // change_deadline アクションが該当すれば procedures.timing_data の代わりに使う
    const overrideDays = ruleResult.deadlineOverrides.get(procedureId);
    const timingData =
      overrideDays !== undefined
        ? { days_from_event: overrideDays }
        : (p.timing_data as Record<string, unknown> | null);
    const deadline = calculateNextDeadline(p.timing_type as string, timingData, 0, input.eventDate);

    // change_office アクションが該当すれば procedures.office_type の代わりに使う
    const overrideOfficeType = ruleResult.officeOverrides.get(procedureId);
    const office = officeMap.get(overrideOfficeType ?? (p.office_type as string)) ?? null;

    return {
      ...(p as ProcedureResult),
      next_deadline: deadline.label,
      next_deadline_date: deadline.date,
      office,
      official_links:
        (p.official_links as { label: string; url: string; status?: LinkStatus; fallback_url?: string | null }[]) ?? [],
      procedure_documents:
        (p.procedure_documents as { name: string; form_number: string | null; is_required: boolean; notes: string | null }[]) ?? [],
    };
  });

  return { eventId, eventType, procedures, warnings: ruleResult.warnings };
}
