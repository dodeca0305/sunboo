import type { TimelineEvent } from './timeline';
import type { CompanyProfile } from './companyProfile';
import type { TaxReturnProfile } from './taxReturnProfile';
import { buildCompanyTimelineEvents, buildTaxReturnTimelineEvents, mergeTimelineEvents } from './timelineProducer';

// ── Company Workspace — Timeline構築（Sprint 23 Phase23.4・Sprint 35）───────────────
// workspace_companies / workspace_company_profiles（Sprint22.4 MVP migration）から、
// 既存のTimeline Producer（src/lib/timelineProducer.ts）にそのまま渡せる形にする境界関数。
// 既存のbuildCompanyTimelineEvents自体は変更しない。呼び出し元
// （admin/(protected)/workspaces/[id]/roadmap/page.tsx）は、Sprint23.2の
// workspaceRowsToCompanyProfile で作った CompanyProfile をそのままここに渡すだけでよい
// （CompanyProfile型はlocalStorage由来かDB由来かを区別しないため、既存Producerを無変更で流用できる。
// docs/COMPANY_WORKSPACE.md 1-2節「計算ロジックは変更せず、データの出どころだけを変える」の実例）。
//
// 【Sprint35で追加】workspace_tax_return_profiles実装に伴い、buildTaxReturnTimelineEvents
// （既存・無変更）の結果をmergeTimelineEventsの引数に追加した。company_events相当の
// ソース（登録済みイベント）は本Sprintのスコープ外のまま。
export function buildWorkspaceTimelineEvents(
  companyProfile: CompanyProfile,
  taxReturnProfile?: TaxReturnProfile,
): TimelineEvent[] {
  return mergeTimelineEvents(
    buildCompanyTimelineEvents(companyProfile),
    buildTaxReturnTimelineEvents(taxReturnProfile ?? { entries: [] }),
  );
}
