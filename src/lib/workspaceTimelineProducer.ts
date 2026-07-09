import type { TimelineEvent } from './timeline';
import type { CompanyProfile } from './companyProfile';
import { buildCompanyTimelineEvents, mergeTimelineEvents } from './timelineProducer';

// ── Company Workspace — Timeline構築（Sprint 23 Phase23.4）───────────────
// workspace_companies / workspace_company_profiles（Sprint22.4 MVP migration）から、
// 既存のTimeline Producer（src/lib/timelineProducer.ts）にそのまま渡せる形にする境界関数。
// 既存のbuildCompanyTimelineEvents自体は変更しない。呼び出し元
// （admin/(protected)/workspaces/[id]/roadmap/page.tsx）は、Sprint23.2の
// workspaceRowsToCompanyProfile で作った CompanyProfile をそのままここに渡すだけでよい
// （CompanyProfile型はlocalStorage由来かDB由来かを区別しないため、既存Producerを無変更で流用できる。
// docs/COMPANY_WORKSPACE.md 1-2節「計算ロジックは変更せず、データの出どころだけを変える」の実例）。
//
// 【Sprint23.4のスコープ】company_profileソース（会社設立イベント）のみを対象にする。
// workspace_tax_return_profiles・workspace_company_events はまだ存在しない
// （DBスキーマ変更なしの制約）ため、tax_return_profile/eventソースはまだ構築できない。
// これらのテーブルが実装された際は、buildTaxReturnTimelineEvents/buildCompanyEventTimelineEvents
// （いずれも既存・無変更）の結果をmergeTimelineEventsの引数に追加するだけで拡張できる。
export function buildWorkspaceTimelineEvents(companyProfile: CompanyProfile): TimelineEvent[] {
  return mergeTimelineEvents(buildCompanyTimelineEvents(companyProfile));
}
