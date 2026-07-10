import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ChevronLeft, Building2, Receipt, CalendarRange, Share2, BarChart3, FileStack,
} from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase/server';
import { workspaceRowsToCompanyProfile, type WorkspaceCompanyProfileRow } from '@/lib/workspaceCompanyProfile';
import { buildWorkspaceTimelineEvents } from '@/lib/workspaceTimelineProducer';
import { buildStateFromTimeline, type CompanyState } from '@/lib/state';
import { buildAnnualRoadmap } from '@/lib/roadmap';
import type { WorkspaceProcedureStatus, WorkspaceProcedureStatusMap } from '@/lib/workspaceProcedureStatus';
import type { WorkspaceDocumentStatus } from '@/lib/workspaceDocumentStatus';
import { generateWorkspaceAdvice, summarizeWorkspaceProgress, type WorkspaceAdvice, type WorkspaceProgressSummary } from '@/lib/workspaceAdvice';
import WorkspaceDashboard from '@/components/WorkspaceDashboard';

// ── Company Workspace Shell（Sprint23.1〜23.4・Sprint24.0・Sprint24.2・Sprint25・Sprint26）───
// 会社別Workspaceの「入口」と「骨組み」。会社プロフィール（23.2）・年間ロードマップ（23.3・23.4）・
// 共有（24.0）・書類（26）は実装済みのためリンクを張る。TaxReturn編集は次Sprint以降
// （docs/COMPANY_WORKSPACE.md 4節・10節）。
//
// 【Sprint25で本ページをホームダッシュボード化】データ取得〜State/Roadmap計算はroadmap/page.tsxと
// 同じパターンを踏襲し（buildWorkspaceTimelineEvents → buildStateFromTimeline → buildAnnualRoadmap）、
// 計算結果をgenerateWorkspaceAdvice・summarizeWorkspaceProgress（いずれも純粋関数、
// src/lib/workspaceAdvice.ts）に渡すだけで、既存Engineには一切手を入れない。
// Sprint24.2のWorkspaceAdviceCardはWorkspaceDashboardに統合し、「今日やること」「期限警告」
// 「進捗サマリー」「AI参謀」「会社概要」の5区画に再構成した。
//
// 【Sprint26で追加】workspace_documents（本Sprint新設）から「要更新」件数のみを取得し、
// ダッシュボードに渡す。書類一覧・状態変更自体は/documentsサブページ（WorkspaceDocumentsView）が
// 担当し、本ページは件数の表示のみを行う（roadmap Engineの成否に依存させないため、
// 別のtry/catchで独立して取得する）。

type WorkspaceCompanyRow = {
  id: number;
  name: string;
  corporate_type: string;
  fiscal_month: number | null;
  prefecture_code: string;
  municipality_code: string;
};

const CORPORATE_TYPE_LABEL: Record<string, string> = {
  kabushiki: '株式会社',
  godo: '合同会社',
};

const SECTIONS = [
  { icon: Building2, title: '会社プロフィール', description: '税務・労務の現況（CompanyProfile）', hrefSuffix: '/profile', comingSoon: false },
  { icon: Receipt, title: '決算実績', description: '決算のたびの申告実績（TaxReturnProfile）', hrefSuffix: null, comingSoon: false },
  { icon: CalendarRange, title: '年間ロードマップ', description: '今後の手続き予定の一覧', hrefSuffix: '/roadmap', comingSoon: false },
  { icon: Share2, title: '共有', description: '経営者への共有リンクの発行・管理', hrefSuffix: '/share', comingSoon: false },
  { icon: BarChart3, title: '会計分析', description: '決算実績の推移分析', hrefSuffix: null, comingSoon: true },
  { icon: FileStack, title: '書類', description: '定款・登記簿謄本等の登録状況', hrefSuffix: '/documents', comingSoon: false },
] as const;

export default async function WorkspaceCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const companyId = Number(id);
  if (!Number.isInteger(companyId)) notFound();

  const supabase = await createServerSupabase();
  if (!supabase) notFound();

  const { data } = await supabase
    .from('workspace_companies')
    .select('id, name, corporate_type, fiscal_month, prefecture_code, municipality_code')
    .eq('id', companyId)
    .maybeSingle();

  const company = data as WorkspaceCompanyRow | null;
  if (!company) notFound();

  // 書類の「要更新」件数はRoadmap Engineの計算とは無関係のため、下のtry/catchとは
  // 独立して取得する（roadmap側が例外で失敗しても件数表示は影響を受けない）。
  let documentsNeedingUpdateCount = 0;
  try {
    const { data: documentsData } = await supabase
      .from('workspace_documents')
      .select('status')
      .eq('company_id', companyId);
    documentsNeedingUpdateCount = ((documentsData as { status: WorkspaceDocumentStatus }[] | null) ?? [])
      .filter((d) => d.status === 'needs_update').length;
  } catch {
    documentsNeedingUpdateCount = 0;
  }

  // buildAnnualRoadmapは診断エンジン・Rule Engineへの複数のDB問い合わせを内部で行うため、
  // 想定外のデータで例外が出てもダッシュボードが画面全体を巻き込んで落ちないよう、
  // try/catchで捕捉する（roadmap/page.tsxと同じ防御的措置）。取得失敗時はダッシュボード自体を表示しない。
  let advice: WorkspaceAdvice | null = null;
  let progress: WorkspaceProgressSummary | null = null;
  let state: CompanyState | null = null;
  let prefectureName = '';
  let municipalityName = '';
  try {
    const [{ data: profileData }, { data: prefData }, { data: muniData }, { data: statusData }] = await Promise.all([
      supabase.from('workspace_company_profiles').select('*').eq('company_id', companyId).maybeSingle(),
      supabase.from('prefectures').select('name').eq('code', company.prefecture_code).maybeSingle(),
      supabase.from('municipalities').select('name').eq('code', company.municipality_code).maybeSingle(),
      supabase.from('workspace_procedure_statuses').select('procedure_id, status').eq('company_id', companyId),
    ]);

    const statusMap: WorkspaceProcedureStatusMap = {};
    for (const row of (statusData as { procedure_id: number; status: WorkspaceProcedureStatus }[] | null) ?? []) {
      statusMap[row.procedure_id] = row.status;
    }

    const profile = (profileData as WorkspaceCompanyProfileRow | null) ?? null;
    prefectureName = (prefData as { name: string } | null)?.name ?? '';
    municipalityName = (muniData as { name: string } | null)?.name ?? '';

    const companyProfile = workspaceRowsToCompanyProfile(company, profile, prefectureName, municipalityName);
    const timelineEvents = buildWorkspaceTimelineEvents(companyProfile);
    state = buildStateFromTimeline(timelineEvents);
    const roadmapYears = await buildAnnualRoadmap(supabase, companyProfile, state, 3);

    advice = generateWorkspaceAdvice(roadmapYears, statusMap, state);
    progress = summarizeWorkspaceProgress(roadmapYears, statusMap);
  } catch {
    advice = null;
    progress = null;
    state = null;
  }

  return (
    <div className="space-y-6">
      <Link href="/admin/workspaces" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
        <ChevronLeft className="h-4 w-4" />
        顧問先一覧に戻る
      </Link>

      <div>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-xl font-bold text-gray-900">{company.name}</h1>
          <span className="tag">{CORPORATE_TYPE_LABEL[company.corporate_type] ?? company.corporate_type}</span>
          {company.fiscal_month && <span className="tag">決算月: {company.fiscal_month}月</span>}
        </div>
      </div>

      {advice && progress && state && (
        <WorkspaceDashboard
          companyId={companyId}
          company={{
            corporateType: company.corporate_type,
            fiscalMonth: company.fiscal_month,
            prefectureName,
            municipalityName,
          }}
          state={state}
          advice={advice}
          progress={progress}
          documentsNeedingUpdateCount={documentsNeedingUpdateCount}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map(({ icon: Icon, title, description, hrefSuffix, comingSoon }) => {
          const content = (
            <>
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-900">{title}</p>
                  {comingSoon && <span className="tag border-gray-200 text-gray-400">Coming Soon</span>}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-gray-500">{description}</p>
              </div>
            </>
          );
          return hrefSuffix ? (
            <Link
              key={title}
              href={`/admin/workspaces/${companyId}${hrefSuffix}`}
              className="card flex items-start gap-3 transition-colors hover:border-blue-200 hover:bg-blue-50/40"
            >
              {content}
            </Link>
          ) : (
            <div key={title} className="card flex items-start gap-3">
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
