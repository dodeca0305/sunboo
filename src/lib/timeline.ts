// ── Timeline Engine — 型・Storage層（Sprint 19 Phase19.2実装、Phase19.3で責務分離）───
// 会社に関するすべての事実を単一の追記専用ログとして扱う共通基盤。
// 設計: docs/TIMELINE_ENGINE.md（Sprint19 Phase19.1、設計レビュー承認済み）。
//
// このファイルはTimelineEventの型定義とlocalStorage（sunboo:timeline-events）への保存・読込のみを
// 担当する。既存データ（CompanyProfile・TaxReturnProfile・anonymous_company_events）からの
// TimelineEvent生成・複数ソースの統合（重複排除・並び替え）はsrc/lib/timelineProducer.tsが担う
// （Sprint19.3で分離。責務: このファイル＝Storageと型、timelineProducer.ts＝生成と統合）。

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
// timelineProducer.tsのmergeTimelineEvents（複数ソース統合時の重複排除）と同じ判定基準を使うため、
// 型に紐づく小さな関数としてここからexportする（重複防止ロジックの二重管理を避ける）。
export function timelineEventKey(e: Pick<TimelineEvent, 'source' | 'sourceId' | 'occurredAt' | 'category'>): string {
  return `${e.source}:${e.sourceId}:${e.occurredAt}:${e.category}`;
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
  const updated = [...current, newEvent].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
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
