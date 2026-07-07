import { loadTimelineEvents, timelineEventKey, type TimelineCategory, type TimelineEvent } from './timeline';
import type { CompanyProfile } from './companyProfile';
import type { TaxReturnEntry, TaxReturnProfile } from './taxReturnProfile';
import type { EventTypeCode, RegisteredCompanyEvent } from './types';

// ── Timeline Producer（Sprint 19 Phase19.3）──────────────────────
// 既存データ源（CompanyProfile・TaxReturnProfile・anonymous_company_events）からのTimelineEvent
// 生成と、複数ソースの統合（重複排除・並び替え）を担当する。src/lib/timeline.ts（型・Storage）から
// 責務を分離したもの（docs/TIMELINE_ENGINE.md 9-3節「都度計算・保存しない」原則）。
//
// このファイルはDBクライアントを持たない純粋関数のみで構成する。anonymous_company_eventsの取得は
// events.tsのfetchCompanyEventsに委ね、呼び出し側が結果をbuildTimelineFromSourcesに渡す設計。

// ── 個別ソースからのTimelineEvent生成 ─────────────────────────────

// CompanyProfileは「現況の1件」のみで変更履歴を持たないため、MVPでは唯一occurredAtが
// 確定できる事実（会社設立）のみを1件のTimelineEventとして導出する。資本金・ステージ等の
// 変更履歴化はRoadmap History統合（docs/TIMELINE_ENGINE.md 5節・10節19.5）まで持ち越す。
export function buildCompanyTimelineEvents(profile: CompanyProfile | null): TimelineEvent[] {
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

export function buildTaxReturnTimelineEvents(taxReturnProfile: TaxReturnProfile): TimelineEvent[] {
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

// ── 複数ソースの統合（重複排除・並び替え）─────────────────────────

function dedupeTimelineEvents(events: TimelineEvent[]): TimelineEvent[] {
  const seen = new Set<string>();
  const deduped: TimelineEvent[] = [];
  for (const e of events) {
    const key = timelineEventKey(e);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(e);
  }
  return deduped;
}

function sortTimelineEventsByOccurredAt(events: TimelineEvent[]): TimelineEvent[] {
  return [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

// 複数のTimelineEvent配列を1つに統合し、重複（source+sourceId+occurredAt+categoryが一致するもの）を
// 除いた上で発生日の古い順に並べ替える。呼び出し側は各ソースのbuild*関数の結果をそのまま渡せばよい。
export function mergeTimelineEvents(...eventLists: TimelineEvent[][]): TimelineEvent[] {
  return sortTimelineEventsByOccurredAt(dedupeTimelineEvents(eventLists.flat()));
}

// ── 統合ビュー（既存呼び出し互換のための合成エントリーポイント）───────

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
  return mergeTimelineEvents(
    buildCompanyTimelineEvents(input.companyProfile ?? null),
    buildTaxReturnTimelineEvents(input.taxReturnProfile ?? { entries: [] }),
    buildCompanyEventTimelineEvents(input.companyEvents ?? []),
    input.manualEvents ?? loadTimelineEvents(),
  );
}
