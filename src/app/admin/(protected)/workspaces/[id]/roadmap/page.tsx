import { notFound } from 'next/navigation';
import { CalendarRange } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase/server';
import type { RoadmapYear } from '@/lib/roadmap';
import type { WorkspaceProcedureStatusMap } from '@/lib/workspaceProcedureStatus';
import { loadWorkspaceCompany, loadWorkspaceRoadmapContext } from '@/lib/workspaceLoader';
import { formatCompanyAddress } from '@/lib/companyProfile';
import AnnualRoadmapView from '@/components/AnnualRoadmapView';
import WorkspaceSubNav from '@/components/WorkspaceSubNav';
import RoadmapExcelExportButton from '@/components/RoadmapExcelExportButton';
import RoadmapPdfExportButton from '@/components/RoadmapPdfExportButton';
import PageHeader from '@/components/PageHeader';
import InformationCard from '@/components/InformationCard';

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
      <PageHeader
        backHref={`/admin/workspaces/${companyId}`}
        backLabel={`${company.name} に戻る`}
        icon={CalendarRange}
        brand
        title="年間ロードマップ"
        subtitle={`${company.name}が今年行う行政手続き・提出先・期限を一覧で確認できます。`}
        action={
          !computeError && totalItemCount > 0 ? (
            <>
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
            </>
          ) : undefined
        }
      />

      <WorkspaceSubNav companyId={companyId} />

      <InformationCard kind="info">
        今年度から今後2年分の手続き予定を一覧表示する参考情報です。実際の手続き・期限・提出先は
        必ず各公式機関の最新情報をご確認ください。「情報不足」「推定」の表示がある手続きは、
        会社プロフィールや決算実績の登録状況によって内容が変わる可能性があります。
      </InformationCard>

      {computeError ? (
        <InformationCard kind="error" title="ロードマップを計算できませんでした">
          時間をおいて再度お試しください。解決しない場合は会社プロフィールの登録内容をご確認ください。
          <span className="mt-1 block text-[11px] text-sunboo-ink-muted">{computeError}</span>
        </InformationCard>
      ) : totalItemCount === 0 ? (
        <InformationCard kind="info" title="今年の手続き予定はまだ計算できません">
          会社プロフィールの決算月などを登録すると、年間の手続き予定を自動で作成します。
        </InformationCard>
      ) : (
        <AnnualRoadmapView roadmapYears={roadmapYears} statusMap={statusMap} companyId={companyId} />
      )}
    </div>
  );
}
