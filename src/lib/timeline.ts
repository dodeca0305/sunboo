import type { CompanyProfile } from './companyProfile';
import type { TaxReturnEntry, TaxReturnProfile } from './taxReturnProfile';
import type { EventTypeCode, RegisteredCompanyEvent } from './types';

// ── Timeline Engine MVP（Sprint 19 Phase19.2）───────────────────
// 会社に関するすべての事実を単一の追記専用ログとして扱う共通基盤。
// 設計: docs/TIMELINE_ENGINE.md（Sprint19 Phase19.1、設計レビュー承認済み）。
//
// 既存データ（CompanyProfile・TaxReturnProfile・anonymous_company_events）は変更せず、
// このファイルはそれらを読み取ってTimelineEvent形式に「都度変換するだけ」の純粋関数群にする
// （Roadmapと同じ「都度計算・保存しない」原則、設計書9-3節）。DBクライアントはこのファイルでは
// 持たない（anonymous_company_eventsの取得はevents.tsのfetchCompanyEventsに委ね、呼び出し側が
// 結果をbuildTimelineFromSourcesに渡す）。
//
// localStorage（sunboo:timeline-events）に保存するのは、既存データに対応しない新規記録
// （手動追記・AI参謀等のsystem記録）のみ。

export type TimelineCategory = 'company' | 'tax' | 'hr' | 'financial' | 'advisory';

export type TimelineSource =
  | 'manual' // ユーザーが直接記録した事実
  | 'company_profile' // CompanyProfile（現況スナップショット）から導出
  | 'tax_return_profile' // TaxReturnProfile.entriesから導出
  | 'event' // anonymous_company_events（経営イベントエンジン）から導出
  | 'system' // AI参謀・通知エンジンが生成した記録
  | 'future_pdf' // 将来構想: PDF/OCR読取
  | 'future_accounting'; // 将来構想: 会計データ連携（freee/MF等API）

export type TimelineEvent = {
  id: string;
  occurredAt: string; // 事実が発生した日（ISO日付）。例: 決算日・採用日・申告対象年度末
  recordedAt: string; // SUNBOOに記録した日時（ISO datetime）
  title: string;
  description: string;
  category: TimelineCategory;
  source: TimelineSource;
  sourceId: string; // 発生源側の識別子（重複防止キーの一部。例: TaxReturnEntry.id）
  metadata: Record<string, unknown>;
};

const TIMELINE_KEY = 'sunboo:timeline-events';

// source + sourceId + occurredAt + category が一致する場合は同一の事実とみなす（重複登録防止）。
function timelineEventKey(e: Pick<TimelineEvent, 'source' | 'sourceId' | 'occurredAt' | 'category'>): string {
  return `${e.source}:${e.sourceId}:${e.occurredAt}:${e.category}`;
}

function dedupeAndSort(events: TimelineEvent[]): TimelineEvent[] {
  const seen = new Set<string>();
  const deduped: TimelineEvent[] = [];
  for (const e of events) {
    const key = timelineEventKey(e);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(e);
  }
  return deduped.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

// ── localStorage保存・読込（手動記録・system記録のみ）───────────

export function loadTimelineEvents(): TimelineEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(TIMELINE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as TimelineEvent[];
  } catch {
    return [];
  }
}

export function saveTimelineEvents(events: TimelineEvent[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TIMELINE_KEY, JSON.stringify(events));
}

// 重複（source+sourceId+occurredAt+categoryが一致）していれば追記せず、既存の一覧をそのまま返す。
export function addTimelineEvent(event: Omit<TimelineEvent, 'id' | 'recordedAt'>): TimelineEvent[] {
  const current = loadTimelineEvents();
  const key = timelineEventKey(event);
  if (current.some((e) => timelineEventKey(e) === key)) return current;

  const newEvent: TimelineEvent = {
    ...event,
    id: crypto.randomUUID(),
    recordedAt: new Date().toISOString(),
  };
  const updated = dedupeAndSort([...current, newEvent]);
  saveTimelineEvents(updated);
  return updated;
}

export function removeTimelineEvent(id: string): TimelineEvent[] {
  const updated = loadTimelineEvents().filter((e) => e.id !== id);
  saveTimelineEvents(updated);
  return updated;
}

export function clearTimelineEvents(): void {
  saveTimelineEvents([]);
}

// ── 既存データ源からのTimelineEvent変換（読み取り専用ビュー）─────

// CompanyProfileは「現況の1件」のみで変更履歴を持たないため、MVPでは唯一occurredAtが
// 確定できる事実（会社設立）のみを1件のTimelineEventとして導出する。資本金・ステージ等の
// 変更履歴化はRoadmap History統合（docs/TIMELINE_ENGINE.md 5節・10節19.5）まで持ち越す。
export function buildCompanyProfileTimelineEvents(profile: CompanyProfile | null): TimelineEvent[] {
  if (!profile || !profile.establishedDate) return [];

  const corporateTypeLabel = profile.corporateType === 'kabushiki' ? '株式会社' : '合同会社';
  const event: TimelineEvent = {
    id: crypto.randomUUID(),
    occurredAt: profile.establishedDate,
    // CompanyProfileは記録日時を保持していないため、事実発生日をそのまま記録日時の代用とする
    recordedAt: profile.establishedDate,
    title: '会社設立',
    description: `${corporateTypeLabel}として設立`,
    category: 'company',
    source: 'company_profile',
    sourceId: 'establishment',
    metadata: {
      corporateType: profile.corporateType,
      prefectureName: profile.prefectureName,
      municipalityName: profile.municipalityName,
      capital: profile.capital,
    },
  };
  return [event];
}

function taxReturnEntryToTimelineEvent(entry: TaxReturnEntry): TimelineEvent {
  const consumptionTaxLabel = entry.consumptionTaxStatus === 'taxable' ? '課税事業者' : '免税事業者';
  return {
    id: crypto.randomUUID(),
    occurredAt: entry.fiscalYearEndDate,
    recordedAt: entry.createdAt,
    title: `${entry.fiscalYear} 確定申告`,
    description: `消費税は${consumptionTaxLabel}として確定`,
    category: 'tax',
    source: 'tax_return_profile',
    sourceId: entry.id,
    metadata: {
      fiscalYear: entry.fiscalYear,
      filedDate: entry.filedDate,
      consumptionTaxStatus: entry.consumptionTaxStatus,
      invoiceRegistrationStatus: entry.invoiceRegistrationStatus,
      taxableSalesAmount: entry.taxableSalesAmount,
      corporateTaxAmount: entry.corporateTaxAmount,
      consumptionTaxAmount: entry.consumptionTaxAmount,
      employeeCountAtFiscalYearEnd: entry.employeeCountAtFiscalYearEnd,
    },
  };
}

export function buildTaxReturnProfileTimelineEvents(taxReturnProfile: TaxReturnProfile): TimelineEvent[] {
  return taxReturnProfile.entries.map(taxReturnEntryToTimelineEvent);
}

// event_types.code から、Timelineの5カテゴリのどれに属するかを決める（docs/TIMELINE_ENGINE.md 3-1節）。
const EVENT_CATEGORY: Record<EventTypeCode, TimelineCategory> = {
  company_establishment: 'company',
  employee_hired: 'hr',
  officer_change: 'company',
};

function registeredCompanyEventToTimelineEvent(event: RegisteredCompanyEvent): TimelineEvent {
  return {
    id: crypto.randomUUID(),
    occurredAt: event.eventDate,
    recordedAt: event.createdAt,
    title: event.eventTypeName,
    description: `${event.eventTypeName}を登録`,
    category: EVENT_CATEGORY[event.eventTypeCode] ?? 'company',
    source: 'event',
    sourceId: String(event.id),
    metadata: { eventTypeCode: event.eventTypeCode },
  };
}

export function buildCompanyEventTimelineEvents(events: RegisteredCompanyEvent[]): TimelineEvent[] {
  return events.map(registeredCompanyEventToTimelineEvent);
}

// ── 統合ビュー ────────────────────────────────────────────────

export type TimelineSourcesInput = {
  companyProfile?: CompanyProfile | null;
  taxReturnProfile?: TaxReturnProfile;
  companyEvents?: RegisteredCompanyEvent[]; // events.tsのfetchCompanyEventsで取得した結果を渡す
  manualEvents?: TimelineEvent[]; // 省略時はloadTimelineEvents()を使う
};

// CompanyProfile・TaxReturnProfile・登録済みイベント・手動記録を統合し、重複を除いて
// 発生日の古い順に並べたTimelineEvent[]を返す。Roadmap・AI参謀・通知への本格接続は
// 本Sprintでは行わないが、この関数の返り値（TimelineEvent[]、category/source等の型）を
// そのまま渡せば将来接続できるように設計している（docs/TIMELINE_ENGINE.md 9節）。
export function buildTimelineFromSources(input: TimelineSourcesInput): TimelineEvent[] {
  const companyProfileEvents = buildCompanyProfileTimelineEvents(input.companyProfile ?? null);
  const taxReturnEvents = buildTaxReturnProfileTimelineEvents(input.taxReturnProfile ?? { entries: [] });
  const companyEventEvents = buildCompanyEventTimelineEvents(input.companyEvents ?? []);
  const manualEvents = input.manualEvents ?? loadTimelineEvents();

  return dedupeAndSort([...companyProfileEvents, ...taxReturnEvents, ...companyEventEvents, ...manualEvents]);
}
