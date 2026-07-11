import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ChevronLeft, Building2, Receipt, CalendarRange, Share2, BarChart3, FileStack,
} from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase/server';
import { type CompanyState } from '@/lib/state';
import type { WorkspaceDocumentStatusMap } from '@/lib/workspaceDocumentStatus';
import { generateWorkspaceAdvice, summarizeWorkspaceProgress, type WorkspaceAdvice, type WorkspaceProgressSummary } from '@/lib/workspaceAdvice';
import { generateWorkspaceDecisions, type WorkspaceDecisions } from '@/lib/workspaceDecisions';
import { buildWorkspaceNotifications, type WorkspaceNotification } from '@/lib/workspaceNotifications';
import { loadWorkspaceCompany, loadWorkspaceDocumentStatuses, loadWorkspaceRoadmapContext } from '@/lib/workspaceLoader';
import WorkspaceDashboard from '@/components/WorkspaceDashboard';
import WorkspaceSubNav from '@/components/WorkspaceSubNav';
import WorkspaceDeleteButton from './WorkspaceDeleteButton';

// ── Company Workspace Shell（Sprint23.1〜23.4・Sprint24.0・Sprint24.2・Sprint25・Sprint26・Sprint27・Sprint35）─
// 会社別Workspaceの「入口」と「骨組み」。会社プロフィール（23.2）・年間ロードマップ（23.3・23.4）・
// 共有（24.0）・書類（26）・決算実績（35）は実装済みのためリンクを張る。
//
// 【Sprint25で本ページをホームダッシュボード化】データ取得〜State/Roadmap計算はroadmap/page.tsxと
// 同じパターンを踏襲し（buildWorkspaceTimelineEvents → buildStateFromTimeline → buildAnnualRoadmap）、
// 計算結果をgenerateWorkspaceAdvice・summarizeWorkspaceProgress（いずれも純粋関数、
// src/lib/workspaceAdvice.ts）に渡すだけで、既存Engineには一切手を入れない。
// Sprint24.2のWorkspaceAdviceCardはWorkspaceDashboardに統合し、「今日やること」「期限警告」
// 「進捗サマリー」「AI参謀」「会社概要」の5区画に再構成した。
//
// 【Sprint26で追加】workspace_documents（本Sprint新設）から書類ステータスを取得し、
// documentStatusMap（Sprint27のDecision Engineにも使う）と「要更新」件数を組み立てる。
// 書類一覧・状態変更自体は/documentsサブページ（WorkspaceDocumentsView）が担当し、
// 本ページは表示のみを行う（roadmap Engineの成否に依存させないため、別のtry/catchで独立して取得する）。
//
// 【Sprint27で追加】generateWorkspaceDecisions（純粋関数、src/lib/workspaceDecisions.ts）に
// companyProfile・state・roadmapYears・procedureStatusMap・documentStatusMapを渡し、
// 「意思決定」セクションとしてWorkspaceDashboardに追加した。
//
// 【Sprint32で出現回単位に変更】statusMapのキーをworkspaceProcedureOccurrenceKey
// （procedure_id + occurrence_key）へ変更した。generateWorkspaceAdvice/summarizeWorkspaceProgress/
// generateWorkspaceDecisionsはいずれもstatusOf（src/lib/workspaceAdvice.ts）経由でこのMapを読むため、
// 本ページ側の変更点はデータ取得・Map構築のみで、Engine側の呼び出しコードは無変更のまま
// 正しく出現回ごとのステータスを参照できる。
//
// 【Sprint34でデータ取得を共通化】company取得・CompanyProfile変換・Timeline/State/Annual Roadmap
// パイプラインの組み立ては、roadmap/page.tsxと重複していた（約30行）。src/lib/workspaceLoader.ts
// （loadWorkspaceCompany・loadWorkspaceRoadmapContext）へ切り出し、両ページから共通利用する。
// Engine自体（buildWorkspaceTimelineEvents・buildStateFromTimeline・buildAnnualRoadmap）は無変更。
//
// 【Sprint37で追加】buildWorkspaceNotifications（純粋関数、src/lib/workspaceNotifications.ts）に
// decisions・advice・procedureStatusMap・documentStatusMapを渡し、「通知センター」として
// WorkspaceDashboardの最上部に表示する。新しい判定ロジックは持たず、Decision/Adviceの結果を
// 変換するだけ（設計: docs/NOTIFICATION_ENGINE_DESIGN.md、Sprint36承認済み）。
//
// 【Sprint43で追加】ログイン中のユーザーがこの会社でownerかどうかをworkspace_membersから判定し、
// ownerの場合のみ画面下部に「危険な操作」（会社削除）を表示する。RLS側（member_delete policy、
// migration_workspace_access_control.sql）も既にowner以外のDELETEを拒否しているため、UI側の
// 判定はあくまで表示の出し分けであり、実際の権限保証はRLSが担う（二重防御）。

const CORPORATE_TYPE_LABEL: Record<string, string> = {
  kabushiki: '株式会社',
  godo: '合同会社',
};

const SECTIONS = [
  { icon: Building2, title: '会社プロフィール', description: '税務・労務の現況（CompanyProfile）', hrefSuffix: '/profile', comingSoon: false },
  { icon: Receipt, title: '決算実績', description: '決算のたびの申告実績（TaxReturnProfile）', hrefSuffix: '/tax-returns', comingSoon: false },
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

  const company = await loadWorkspaceCompany(supabase, companyId);
  if (!company) notFound();

  // ログイン中のユーザーがこの会社でownerかどうかを判定する（危険な操作の表示要否のみに使う）。
  // 取得に失敗した場合は安全側（削除UIを表示しない）に倒す。
  let isOwner = false;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.email) {
    const { data: memberRow } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('company_id', companyId)
      .eq('email', user.email)
      .maybeSingle();
    isOwner = (memberRow as { role: string } | null)?.role === 'owner';
  }

  // 書類ステータスの取得はRoadmap Engineの計算とは無関係のため、下のtry/catchとは
  // 独立して取得する（roadmap側が例外で失敗しても書類関連の表示は影響を受けない）。
  let documentStatusMap: WorkspaceDocumentStatusMap = {};
  let documentsNeedingUpdateCount = 0;
  try {
    const documents = await loadWorkspaceDocumentStatuses(supabase, companyId);
    documentStatusMap = documents.statusMap;
    documentsNeedingUpdateCount = documents.needsUpdateCount;
  } catch {
    documentStatusMap = {};
    documentsNeedingUpdateCount = 0;
  }

  // buildAnnualRoadmapは診断エンジン・Rule Engineへの複数のDB問い合わせを内部で行うため、
  // 想定外のデータで例外が出てもダッシュボードが画面全体を巻き込んで落ちないよう、
  // try/catchで捕捉する（roadmap/page.tsxと同じ防御的措置）。取得失敗時はダッシュボード自体を表示しない。
  let advice: WorkspaceAdvice | null = null;
  let progress: WorkspaceProgressSummary | null = null;
  let decisions: WorkspaceDecisions | null = null;
  let notifications: WorkspaceNotification[] = [];
  let state: CompanyState | null = null;
  let prefectureName = '';
  let municipalityName = '';
  try {
    const { companyProfile, state: computedState, roadmapYears, procedureStatusMap } =
      await loadWorkspaceRoadmapContext(supabase, company);
    state = computedState;
    prefectureName = companyProfile.prefectureName;
    municipalityName = companyProfile.municipalityName;

    advice = generateWorkspaceAdvice(roadmapYears, procedureStatusMap, state);
    progress = summarizeWorkspaceProgress(roadmapYears, procedureStatusMap);
    decisions = generateWorkspaceDecisions(companyProfile, state, roadmapYears, procedureStatusMap, documentStatusMap);
    notifications = buildWorkspaceNotifications(companyId, decisions, advice, procedureStatusMap, documentStatusMap);
  } catch {
    advice = null;
    progress = null;
    decisions = null;
    notifications = [];
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

      <WorkspaceSubNav companyId={companyId} />

      {advice && progress && decisions && state && (
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
          decisions={decisions}
          notifications={notifications}
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

      {isOwner && <WorkspaceDeleteButton companyId={companyId} companyName={company.name} />}
    </div>
  );
}
