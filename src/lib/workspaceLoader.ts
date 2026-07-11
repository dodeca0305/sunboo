import type { SupabaseClient } from './supabase';
import type { CompanyProfile } from './companyProfile';
import { buildStateFromTimeline, type CompanyState } from './state';
import { buildAnnualRoadmap, type RoadmapYear } from './roadmap';
import {
  workspaceRowsToCompanyProfile,
  type WorkspaceCompanyRow, type WorkspaceCompanyProfileRow,
} from './workspaceCompanyProfile';
import { buildWorkspaceTimelineEvents } from './workspaceTimelineProducer';
import {
  workspaceProcedureOccurrenceKey,
  type WorkspaceProcedureStatusMap, type WorkspaceProcedureStatusRow,
} from './workspaceProcedureStatus';
import type { WorkspaceDocumentStatus, WorkspaceDocumentType, WorkspaceDocumentStatusMap } from './workspaceDocumentStatus';

// ── Company Workspace — データ取得の共通化（Sprint 34）───────────────────
// Dashboard・Roadmap・Profile・Documents・Shareの各ページが個別に書いていた
// workspace_companies / workspace_company_profiles / prefectures / municipalities /
// workspace_procedure_statuses / workspace_documents への問い合わせと、
// CompanyProfile → Timeline → State → Annual Roadmapの変換パイプラインを1箇所にまとめる。
//
// 【変更しないもの】Engine自体（buildWorkspaceTimelineEvents・buildStateFromTimeline・
// buildAnnualRoadmap・workspaceRowsToCompanyProfile）の計算ロジックは一切変更しない。
// ここに置く関数はすべて「既存Engineをどの順番でどう呼ぶか」というデータ取得層の配線であり、
// 新しい判定・計算ロジックは持たない。
//
// 【設計方針】各ページが必要な粒度だけ呼べるよう、粒度の異なる関数を用意する。
// - Profileページ: 会社情報の編集だけが目的で、手続きステータスやAnnual Roadmapの計算
//   （診断エンジンへの追加問い合わせを伴う）は不要 → loadWorkspaceCompanyProfileのみ使う
// - Documentsページ: 会社名の表示のみで、CompanyProfileへの変換すら不要 → loadWorkspaceCompanyのみ使う
// - Dashboard・Roadmapページ: 手続きステータス・Annual Roadmapまで必要
//   → loadWorkspaceRoadmapContextで一括取得する
// この粒度分けにより、各ページの既存の問い合わせ回数・並列実行の形（Promise.all）を保ったまま
// 重複コードだけを削除する（Profileページに不要なbuildAnnualRoadmap呼び出しを追加しない、等）。

export type { WorkspaceCompanyRow };

// workspace_companiesを1件取得する。5画面（Dashboard/Roadmap/Profile/Documents/Share）が
// それぞれ独自の列指定・独自の型でこの問い合わせを書いていたため、列指定を統一する
// （Documents/Shareはid・nameしか使わないが、他の列を含めても表示結果は変わらない）。
export async function loadWorkspaceCompany(
  supabase: SupabaseClient,
  companyId: number,
): Promise<WorkspaceCompanyRow | null> {
  const { data } = await supabase
    .from('workspace_companies')
    .select('id, name, prefecture_code, municipality_code, corporate_type, fiscal_month')
    .eq('id', companyId)
    .maybeSingle();

  return (data as WorkspaceCompanyRow | null) ?? null;
}

// workspace_company_profiles + prefectures + municipalities を並列取得し、
// 既存Engineの共通入力であるCompanyProfileへ変換する（workspaceRowsToCompanyProfile自体は無変更）。
export async function loadWorkspaceCompanyProfile(
  supabase: SupabaseClient,
  company: WorkspaceCompanyRow,
): Promise<CompanyProfile> {
  const [{ data: profileData }, { data: prefData }, { data: muniData }] = await Promise.all([
    supabase.from('workspace_company_profiles').select('*').eq('company_id', company.id).maybeSingle(),
    supabase.from('prefectures').select('name').eq('code', company.prefecture_code).maybeSingle(),
    supabase.from('municipalities').select('name').eq('code', company.municipality_code).maybeSingle(),
  ]);

  const profile = (profileData as WorkspaceCompanyProfileRow | null) ?? null;
  const prefectureName = (prefData as { name: string } | null)?.name ?? '';
  const municipalityName = (muniData as { name: string } | null)?.name ?? '';

  return workspaceRowsToCompanyProfile(company, profile, prefectureName, municipalityName);
}

// workspace_procedure_statusesを取得し、出現回単位のキー（workspaceProcedureOccurrenceKey、
// Sprint32）でMapに組み立てる。
export async function loadWorkspaceProcedureStatusMap(
  supabase: SupabaseClient,
  companyId: number,
): Promise<WorkspaceProcedureStatusMap> {
  const { data } = await supabase
    .from('workspace_procedure_statuses')
    .select('procedure_id, occurrence_key, status')
    .eq('company_id', companyId);

  const statusMap: WorkspaceProcedureStatusMap = {};
  for (const row of (data as WorkspaceProcedureStatusRow[] | null) ?? []) {
    statusMap[workspaceProcedureOccurrenceKey(row.procedure_id, row.occurrence_key)] = row.status;
  }
  return statusMap;
}

// workspace_documentsを取得し、ステータスMapと「要更新」件数を組み立てる（Sprint26）。
export async function loadWorkspaceDocumentStatuses(
  supabase: SupabaseClient,
  companyId: number,
): Promise<{ statusMap: WorkspaceDocumentStatusMap; needsUpdateCount: number }> {
  const { data } = await supabase
    .from('workspace_documents')
    .select('document_type, status')
    .eq('company_id', companyId);

  const statusMap: WorkspaceDocumentStatusMap = {};
  let needsUpdateCount = 0;
  for (const row of (data as { document_type: WorkspaceDocumentType; status: WorkspaceDocumentStatus }[] | null) ?? []) {
    statusMap[row.document_type] = row.status;
    if (row.status === 'needs_update') needsUpdateCount++;
  }
  return { statusMap, needsUpdateCount };
}

// CompanyProfile → TimelineEvent[] → CompanyStateの変換（DBアクセスなし、純粋関数の呼び出しのみ）。
// buildWorkspaceTimelineEvents・buildStateFromTimelineは無変更のまま、呼び出し順序だけをまとめる。
export function deriveWorkspaceState(companyProfile: CompanyProfile): CompanyState {
  const timelineEvents = buildWorkspaceTimelineEvents(companyProfile);
  return buildStateFromTimeline(timelineEvents);
}

export type WorkspaceRoadmapContext = {
  companyProfile: CompanyProfile;
  state: CompanyState;
  roadmapYears: RoadmapYear[];
  procedureStatusMap: WorkspaceProcedureStatusMap;
};

// Dashboard・Roadmapページが共通で必要とする一式（CompanyProfile・State・Annual Roadmap・
// 手続きステータス）をまとめて取得する。company_profile系3問い合わせとprocedure_statuses問い合わせは
// 従来通り並列実行し（Promise.all二重掛け）、既存ページの問い合わせ回数・並列度を変えない。
export async function loadWorkspaceRoadmapContext(
  supabase: SupabaseClient,
  company: WorkspaceCompanyRow,
  horizonYears = 3,
): Promise<WorkspaceRoadmapContext> {
  const [companyProfile, procedureStatusMap] = await Promise.all([
    loadWorkspaceCompanyProfile(supabase, company),
    loadWorkspaceProcedureStatusMap(supabase, company.id),
  ]);

  const state = deriveWorkspaceState(companyProfile);
  const roadmapYears = await buildAnnualRoadmap(supabase, companyProfile, state, horizonYears);

  return { companyProfile, state, roadmapYears, procedureStatusMap };
}
