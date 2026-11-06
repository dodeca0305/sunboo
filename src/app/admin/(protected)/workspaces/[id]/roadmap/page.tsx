import { loadWorkspaceCompanyForRead } from '@/lib/workspaceHomeData';
import {
  loadPlanningSources,
  loadPlanningDerived,
  planningRead,
} from '@/lib/workspacePlanningData';
import WorkspacePlanningSources from '@/components/WorkspacePlanningSources';
import WorkspaceReadReloadButton from '@/components/WorkspaceReadReloadButton';
import { notFound } from 'next/navigation';
import { CalendarRange } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase/server';
import type { RoadmapYear } from '@/lib/roadmap';
import type { WorkspaceProcedureStatusMap } from '@/lib/workspaceProcedureStatus';
import { loadWorkspaceRoadmapContext } from '@/lib/workspaceLoader';
import { formatCompanyAddress } from '@/lib/companyProfile';
import AnnualRoadmapView from '@/components/AnnualRoadmapView';
import RoadmapExcelExportButton from '@/components/RoadmapExcelExportButton';
import RoadmapPdfExportButton from '@/components/RoadmapPdfExportButton';
import PageHeader from '@/components/PageHeader';
import InformationCard from '@/components/InformationCard';
import AnalyticsPageEvent from '@/components/AnalyticsPageEvent';
import type { WorkspaceTaxPaymentPlanMap } from '@/lib/workspaceTaxPaymentPlan';
import { loadWorkspaceTaxPaymentPlansForEditing } from '@/lib/workspaceTaxPaymentPlanData';

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

export default async function WorkspaceRoadmapPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    procedureId?: string;
    dueDate?: string;
  }>;
}) {
  const { id } = await params;
  const { procedureId: procedureIdParam, dueDate: dueDateParam } =
    await searchParams;

  const companyId = Number(id);
  const parsedProcedureId = Number(procedureIdParam);

  const focusProcedureId =
    procedureIdParam !== undefined &&
    Number.isInteger(parsedProcedureId) &&
    parsedProcedureId > 0
      ? parsedProcedureId
      : undefined;

  const focusDueDate =
    dueDateParam !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(dueDateParam)
      ? dueDateParam
      : undefined;

  if (!Number.isInteger(companyId)) notFound();

  const supabase = await createServerSupabase();
  const companyRead = await loadWorkspaceCompanyForRead(supabase, companyId);
  if (companyRead.status === 'missing') notFound();
  if (!supabase || companyRead.status !== 'loaded')
    return (
      <div role="alert">
        <InformationCard kind="error" title="会社情報を取得できません">
          通信状態をご確認のうえ、再読み込みしてください。
          <WorkspaceReadReloadButton />
        </InformationCard>
      </div>
    );
  const company = companyRead.company;

  const [sources, taxPlans] = await Promise.all([
    loadPlanningSources(supabase, company),
    planningRead(supabase, companyId, (c) =>
      loadWorkspaceTaxPaymentPlansForEditing(c, companyId),
    ),
  ]);
  const derived = await loadPlanningDerived(
    supabase,
    companyId,
    sources,
    (client, readInputs) =>
      loadWorkspaceRoadmapContext(client, company, 3, { readInputs }),
  );
  const roadmapYears: RoadmapYear[] =
    derived.status === 'loaded' ? derived.value.roadmapYears : [];
  const statusMap: WorkspaceProcedureStatusMap | null =
    sources.statuses.status === 'loaded' ? sources.statuses.value : null;
  const companyAddress =
    sources.profile.status === 'loaded'
      ? formatCompanyAddress(sources.profile.value)
      : '';
  const taxPaymentPlanMap: WorkspaceTaxPaymentPlanMap | null =
    taxPlans.status === 'loaded' ? taxPlans.value : null;
  const computeError = derived.status !== 'loaded';
  const totalItemCount = roadmapYears.reduce(
    (sum, y) => sum + y.items.length,
    0,
  );

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
          !computeError &&
          statusMap !== null &&
          taxPaymentPlanMap !== null &&
          totalItemCount > 0 ? (
            <>
              <RoadmapExcelExportButton
                roadmapYears={roadmapYears}
                statusMap={statusMap}
                companyName={company.name}
                companyAddress={companyAddress}
                companyId={companyId}
              />
              <RoadmapPdfExportButton
                roadmapYears={roadmapYears}
                statusMap={statusMap}
                companyName={company.name}
                companyAddress={companyAddress}
                companyId={companyId}
              />
            </>
          ) : undefined
        }
      />


      <InformationCard kind="info">
        今年度から今後2年分の手続き予定を一覧表示する参考情報です。実際の手続き・期限・提出先は
        必ず各公式機関の最新情報をご確認ください。「情報不足」「推定」の表示がある手続きは、
        会社プロフィールや決算実績の登録状況によって内容が変わる可能性があります。
      </InformationCard>

      <WorkspacePlanningSources sources={sources} />
      <p data-testid="planning-tax-plans">
        支払う予定額の登録記録:{' '}
        {taxPaymentPlanMap === null
          ? '取得できません'
          : `${Object.keys(taxPaymentPlanMap).length}件（取得済み）`}
      </p>
      {!computeError && statusMap === null && (
        <div role="alert">
          <InformationCard
            kind="error"
            title="手続き状態を取得できませんでした"
          >
            登録済みの状態を確認できないため、状態変更とExcel・PDF出力を停止しています。
            <a
              className="mt-2 block underline"
              href={`/admin/workspaces/${companyId}/roadmap`}
            >
              再読み込み
            </a>
          </InformationCard>
        </div>
      )}

      {taxPaymentPlanMap === null && (
        <InformationCard kind="error" title="税金の支払予定を取得できませんでした">
          保存済みの金額を確認できないため、支払う予定額の入力・保存とExcel・PDF出力を停止しています。
          <a
            className="mt-2 block underline"
            href={`/admin/workspaces/${companyId}/roadmap`}
          >
            再読み込み
          </a>
        </InformationCard>
      )}

      {computeError ? (
        <div role="alert" data-testid="planning-derived-unavailable">
          <InformationCard
            kind="error"
            title="予定の算出に必要な情報を取得できません"
          >
            取得できた登録情報は表示しています。プロフィール・実績・診断ルール・窓口・提出先などの確認が完了するまで、予定・推奨・集計・出力と予定に対する変更を保留します。
            <WorkspaceReadReloadButton />
          </InformationCard>
        </div>
      ) : totalItemCount === 0 ? (
        <InformationCard
          kind="info"
          title="今年の手続き予定はまだ計算できません"
        >
          会社プロフィールの決算月などを登録すると、年間の手続き予定を自動で作成します。
        </InformationCard>
      ) : (
        <>
          <AnalyticsPageEvent
            event="roadmap_generated"
            properties={{ workspace_id: companyId, company_id: companyId }}
          />

          <AnnualRoadmapView
            key={`${companyId}:${JSON.stringify(taxPaymentPlanMap)}`}
            roadmapYears={roadmapYears}
            statusMap={statusMap ?? undefined}
            companyId={companyId}
            focusProcedureId={focusProcedureId}
            focusDueDate={focusDueDate}
            taxPaymentPlanMap={taxPaymentPlanMap ?? undefined}
          />
        </>
      )}
    </div>
  );
}
