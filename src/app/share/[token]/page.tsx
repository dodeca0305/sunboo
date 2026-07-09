import { AlertTriangle, Building2, CalendarRange, Info } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  workspaceRowsToCompanyProfile, type WorkspaceCompanyProfileRow, type WorkspaceCompanyRow,
} from '@/lib/workspaceCompanyProfile';
import { buildWorkspaceTimelineEvents } from '@/lib/workspaceTimelineProducer';
import { buildStateFromTimeline } from '@/lib/state';
import { buildAnnualRoadmap } from '@/lib/roadmap';
import type { WorkspaceProcedureStatus, WorkspaceProcedureStatusMap } from '@/lib/workspaceProcedureStatus';
import AnnualRoadmapView from '@/components/AnnualRoadmapView';

// ── Company Workspace — 経営者向け共有ページ（Sprint 24 Phase24.0・Phase24.1）───
// ログイン不要・編集不可の閲覧専用ページ。get_shared_workspace_view（Sprint22.4 MVP migration、
// Sprint24.1でstatusesを追加、SECURITY DEFINER RPC）をanonキーで呼び出し、トークンが
// 有効な場合のみ会社情報を受け取る。Roadmap自体はRPCで計算せず（保存しない設計、
// docs/WORKSPACE_DB_DESIGN.md 12-2節）、このページがbuildAnnualRoadmap（無変更）をanonキーの
// クライアントで呼び出して都度計算する（procedures/rulesは既存の公開/roadmapページと同じく
// anonにSELECT許可済みのため成立する）。手続きステータスはRPCが返す"statuses"配列を
// そのまま表示するのみで、companyIdを渡さないため編集はできない
// （AnnualRoadmapViewのeditable判定はstatusMap+companyId両方が必要）。
// AI参謀・書類・会計分析は本Sprintでは共有しない（docs/COMPANY_WORKSPACE.md 5節、要判断事項）。

const CORPORATE_TYPE_LABEL: Record<string, string> = {
  kabushiki: '株式会社',
  godo: '合同会社',
};

function InvalidLinkNotice({ message }: { message: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <AlertTriangle className="mb-3 h-8 w-8 text-gray-300" />
      <p className="text-sm font-medium text-gray-700">{message}</p>
    </div>
  );
}

export default async function SharedWorkspacePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  if (!supabase) {
    return <InvalidLinkNotice message="データベースに接続できませんでした。時間をおいて再度お試しください。" />;
  }

  const { data: viewData } = await supabase.rpc('get_shared_workspace_view', { p_token: token });
  const view = viewData as {
    company?: WorkspaceCompanyRow;
    profile?: WorkspaceCompanyProfileRow | null;
    statuses?: { procedure_id: number; status: WorkspaceProcedureStatus }[];
  } | null;

  if (!view || !view.company) {
    return <InvalidLinkNotice message="このリンクは無効か、有効期限が切れています。共有元にお問い合わせください。" />;
  }

  const company = view.company;
  const profile = view.profile ?? null;
  const statusMap: WorkspaceProcedureStatusMap = {};
  for (const row of view.statuses ?? []) {
    statusMap[row.procedure_id] = row.status;
  }

  const [{ data: prefData }, { data: muniData }] = await Promise.all([
    supabase.from('prefectures').select('name').eq('code', company.prefecture_code).maybeSingle(),
    supabase.from('municipalities').select('name').eq('code', company.municipality_code).maybeSingle(),
  ]);
  const prefectureName = (prefData as { name: string } | null)?.name ?? '';
  const municipalityName = (muniData as { name: string } | null)?.name ?? '';

  const companyProfile = workspaceRowsToCompanyProfile(company, profile, prefectureName, municipalityName);

  let roadmapYears: Awaited<ReturnType<typeof buildAnnualRoadmap>> = [];
  try {
    const timelineEvents = buildWorkspaceTimelineEvents(companyProfile);
    const state = buildStateFromTimeline(timelineEvents);
    roadmapYears = await buildAnnualRoadmap(supabase, companyProfile, state, 3);
  } catch {
    // ロードマップの計算に失敗しても会社概要は表示を続ける
  }
  const totalItemCount = roadmapYears.reduce((sum, y) => sum + y.items.length, 0);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white select-none">
          S
        </span>
        <span className="text-base font-bold tracking-tight text-gray-900">
          SUNBOO<span className="text-blue-600">経営ナビ</span>
        </span>
        <span className="tag border-blue-200 text-blue-600">共有ページ（閲覧専用）</span>
      </div>

      <div className="card mb-6 flex items-start gap-3">
        <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-bold text-gray-900">{company.name}</h1>
            <span className="tag">{CORPORATE_TYPE_LABEL[company.corporate_type] ?? company.corporate_type}</span>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {prefectureName}
            {municipalityName}
            {company.fiscal_month ? ` ／ 決算月: ${company.fiscal_month}月` : ''}
          </p>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <CalendarRange className="h-5 w-5 text-blue-600" />
        <h2 className="text-base font-bold text-gray-900">年間ロードマップ</h2>
      </div>

      <div className="card mb-6 flex items-start gap-3 border-gray-200 bg-gray-50/60">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
        <p className="text-xs leading-relaxed text-gray-500">
          今年度から今後2年分の手続き予定を一覧表示する参考情報です。実際の手続き・期限・提出先は
          必ず顧問の専門家・各公式機関の最新情報をご確認ください。
        </p>
      </div>

      {totalItemCount === 0 ? (
        <div className="card border-gray-200 bg-gray-50/60 text-sm text-gray-600">
          表示できる手続きがありません。
        </div>
      ) : (
        <AnnualRoadmapView roadmapYears={roadmapYears} statusMap={statusMap} />
      )}

      <p className="mt-10 flex items-start gap-2 text-xs text-gray-400">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        本ページの情報は一般的な参考情報です。記帳・電子申告・法的助言そのものではありません。
        税務・労務の最終判断は必ず税理士・社労士等の専門家にご確認ください。
      </p>
    </div>
  );
}
