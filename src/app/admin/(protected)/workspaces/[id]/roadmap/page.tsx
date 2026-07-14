import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, CalendarRange, Info, AlertTriangle } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase/server';
import type { RoadmapYear } from '@/lib/roadmap';
import type { WorkspaceProcedureStatusMap } from '@/lib/workspaceProcedureStatus';
import { loadWorkspaceCompany, loadWorkspaceRoadmapContext } from '@/lib/workspaceLoader';
import { formatCompanyAddress } from '@/lib/companyProfile';
import AnnualRoadmapView from '@/components/AnnualRoadmapView';
import WorkspaceSubNav from '@/components/WorkspaceSubNav';
import RoadmapExcelExportButton from '@/components/RoadmapExcelExportButton';
import RoadmapPdfExportButton from '@/components/RoadmapPdfExportButton';

// ── Company Workspace — 年間ロードマップ（Sprint 23 Phase23.3・Phase23.4）─────
// buildAnnualRoadmap（src/lib/roadmap.ts）・buildStateFromTimeline（src/lib/state.ts）は
// いずれも無変更で再利用する。表示は AnnualRoadmapView（src/components/）を
// src/app/(site)/roadmap/page.tsx と共有する。
//
// 【Sprint23.4で追加】buildWorkspaceTimelineEvents（src/lib/workspaceTimelineProducer.ts）で
// workspace_company_profiles由来（会社設立イベント）のTimelineを構築し、State計算に渡すように
// なった。ただしworkspace_tax_return_profiles・workspace_company_events はまだ存在しない
// （DBスキーマ変更なしの制約）ため、tax/eventカテゴリのTimelineEventはまだ構築できない。
// このため、tax_return_profileソースが必要なState項目（invoiceRegistrationStatus・
// withholdingTaxCycle・2期目以降のconsumptionTaxStatus/corporateTaxInterimFiling等）は
// 引き続きincompleteのままになる（次Sprint以降、workspace_tax_return_profiles実装後に解消見込み）。
// 一方、会社設立イベントが1件でもTimelineに入ることで、stage（1期目と確定できる）・
// consumptionTaxStatus（1期目なら免税、または資本金1,000万円以上なら課税と確定できる）は
// confirmed/estimatedになり得る（本ファイル冒頭の確認事項参照）。
//
// 【Sprint24.1で追加】workspace_procedure_statuses（本Sprint新設）から手続きステータスを取得し、
// AnnualRoadmapViewにcompanyIdとあわせて渡す。ステータス変更（クリック操作）自体は
// AnnualRoadmapView内部で完結する（Server Componentである本ページからは関数propsを
// 渡せないため）。
//
// 【Sprint32で出現回単位に変更】statusMapのキーをprocedure_idのみからworkspaceProcedureOccurrenceKey
// （procedure_id + occurrence_key）へ変更した。occurrence_keyはRoadmapItem.dueDateをそのまま使う
// （docs/PERIODIC_STATUS_REDESIGN.md、Sprint31設計レビューで承認済み）。
//
// 【Sprint34でデータ取得を共通化】company取得・CompanyProfile変換・Timeline/State/Annual Roadmap
// パイプラインの組み立ては、workspaces/[id]/page.tsx（Dashboard）と重複していた。
// src/lib/workspaceLoader.ts（loadWorkspaceCompany・loadWorkspaceRoadmapContext）へ切り出し、
// 両ページから共通利用する。Engine自体は無変更。

export default async function WorkspaceRoadmapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const companyId = Number(id);
  if (!Number.isInteger(companyId)) notFound();

  const supabase = await createServerSupabase();
  if (!supabase) notFound();

  const company = await loadWorkspaceCompany(supabase, companyId);
  if (!company) notFound();

  // buildAnnualRoadmapは診断エンジン・Rule Engineへの複数のDB問い合わせを内部で行うため、
  // 想定外のデータ（DB行の欠落・形式不一致等）で例外が出ても画面が真っ白/無反応にならないよう、
  // try/catchで捕捉してエラーカードを表示する（Sprint23.3レビューで追加した防御的措置）。
  let roadmapYears: RoadmapYear[] = [];
  let statusMap: WorkspaceProcedureStatusMap = {};
  let companyAddress = '';
  let computeError: string | null = null;
  try {
    const context = await loadWorkspaceRoadmapContext(supabase, company);
    roadmapYears = context.roadmapYears;
    statusMap = context.procedureStatusMap;
    companyAddress = formatCompanyAddress(context.companyProfile);
  } catch (err) {
    computeError = err instanceof Error ? err.message : '不明なエラー';
  }
  const totalItemCount = roadmapYears.reduce((sum, y) => sum + y.items.length, 0);

  return (
    <div className="space-y-6">
      <Link
        href={`/admin/workspaces/${companyId}`}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
      >
        <ChevronLeft className="h-4 w-4" />
        {company.name} に戻る
      </Link>

      <div className="flex flex-wrap items-center gap-2.5">
        <CalendarRange className="h-6 w-6 text-blue-600" />
        <h1 className="text-xl font-bold text-gray-900">年間ロードマップ — {company.name}</h1>
        {!computeError && totalItemCount > 0 && (
          <div className="ml-auto flex flex-wrap items-start gap-2">
            <RoadmapExcelExportButton
              roadmapYears={roadmapYears}
              statusMap={statusMap}
              companyName={company.name}
              companyAddress={companyAddress}
            />
            <RoadmapPdfExportButton
              roadmapYears={roadmapYears}
              statusMap={statusMap}
              companyName={company.name}
              companyAddress={companyAddress}
            />
          </div>
        )}
      </div>

      <WorkspaceSubNav companyId={companyId} />

      <p className="text-sm font-medium text-gray-700">
        会社が今年行う行政手続き・提出先・期限を一覧で確認できます。
      </p>

      <div className="card flex items-start gap-3 border-gray-200 bg-gray-50/60">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
        <p className="text-xs leading-relaxed text-gray-500">
          今年度から今後2年分の手続き予定を一覧表示する参考情報です。実際の手続き・期限・提出先は
          必ず各公式機関の最新情報をご確認ください。「情報不足」「推定」の表示がある手続きは、
          会社プロフィールや決算実績の登録状況によって内容が変わる可能性があります。
        </p>
      </div>

      {computeError ? (
        <div className="card flex items-start gap-2 border-red-200 bg-red-50 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">ロードマップの計算中にエラーが発生しました</p>
            <p className="mt-1 text-xs text-red-600">{computeError}</p>
          </div>
        </div>
      ) : totalItemCount === 0 ? (
        <div className="card border-gray-200 bg-gray-50/60 text-sm text-gray-600">
          表示できる手続きがありません。会社プロフィールの決算月などの登録状況をご確認ください。
        </div>
      ) : (
        <AnnualRoadmapView roadmapYears={roadmapYears} statusMap={statusMap} companyId={companyId} />
      )}
    </div>
  );
}
