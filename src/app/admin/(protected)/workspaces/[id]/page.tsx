import { notFound } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import PageHeader from '@/components/PageHeader';
import WorkspaceDashboard from '@/components/WorkspaceDashboard';
import WorkspaceCompletionFeedback from '@/components/WorkspaceCompletionFeedback';
import WorkspaceTodaySalesCard from '@/components/WorkspaceTodaySalesCard';
import WorkspaceTaxReviewSummaryCard from '@/components/WorkspaceTaxReviewSummaryCard';
import WorkspaceReadReloadButton from '@/components/WorkspaceReadReloadButton';
import { loadWorkspaceTaxReviewSummary } from '@/lib/taxIntelligence/reviewSummary';
import {
  loadWorkspaceCompanyForRead,
  loadWorkspaceHomeSources,
  loadWorkspaceHomeDerived,
} from '@/lib/workspaceHomeData';
import { createWorkspaceReadGuard } from '@/lib/workspaceReadGuard';
import { loadWorkspaceRoadmapContext } from '@/lib/workspaceLoader';
import {
  generateWorkspaceAdvice,
  summarizeWorkspaceProgress,
} from '@/lib/workspaceAdvice';
import {
  ACTION_MAX_ITEMS,
  generateWorkspaceDecisions,
  mergeDecisionActions,
  selectUrgentDecisionActions,
  summarizeDecisionActions,
} from '@/lib/workspaceDecisions';
import { buildWorkspaceNotifications } from '@/lib/workspaceNotifications';
import { buildWorkspaceGrowthNotifications } from '@/lib/workspaceGrowthNotifications';
import { growthNotificationsToDecisionActions } from '@/lib/workspaceGrowthActions';
import {
  todayInJapan,
  emptyMonthlySalesEntry,
  monthlySalesRowToEntry,
} from '@/lib/monthlySalesProgress';
import WorkspaceDeleteButton from './WorkspaceDeleteButton';
const CORPORATE_TYPE_LABEL: Record<string, string> = {
  kabushiki: '株式会社',
  godo: '合同会社',
};

export default async function WorkspaceCompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params,
    companyId = Number(id);
  if (!Number.isSafeInteger(companyId) || companyId <= 0) notFound();
  const client = await createServerSupabase(),
    companyResult = await loadWorkspaceCompanyForRead(client, companyId);
  if (companyResult.status === 'missing') notFound();
  if (companyResult.status !== 'loaded' || !client)
    return (
      <div role="alert" className="card space-y-3">
        <p>会社情報を取得できません。時間をおいて再読み込みしてください。</p>
        <WorkspaceReadReloadButton />
      </div>
    );
  const company = companyResult.company,
    today = todayInJapan(),
    month = today.slice(0, 7);
  const [sources, summary, isOwner] = await Promise.all([
    loadWorkspaceHomeSources(client, company, today),
    (async () => {
      try {
        return await loadWorkspaceTaxReviewSummary(
          createWorkspaceReadGuard(client, companyId).client,
          companyId,
        );
      } catch {
        return null;
      }
    })(),
    (async () => {
      try {
        const {
          data: { user },
          error,
        } = await client.auth.getUser();
        if (error || !user?.email) return false;
        const r = await client
          .from('workspace_members')
          .select('role')
          .eq('company_id', companyId)
          .eq('email', user.email)
          .maybeSingle();
        return !r.error && r.data?.role === 'owner';
      } catch {
        return false;
      }
    })(),
  ]);
  const derived = await loadWorkspaceHomeDerived(
    client,
    sources,
    !!summary &&
      summary.openReviewCount !== null &&
      summary.controlEvaluation !== null,
    async (guarded, readInputs) => {
      if (
        sources.documents.status !== 'loaded' ||
        sources.monthly.status !== 'loaded' ||
        sources.taxPlans.status !== 'loaded'
      )
        throw Error();
      const context = await loadWorkspaceRoadmapContext(guarded, company, 3, {
        readInputs,
      });
      const { companyProfile, state, roadmapYears, procedureStatusMap } =
        context;
      const documentStatusMap = sources.documents.value.statusMap;
      const advice = generateWorkspaceAdvice(
          roadmapYears,
          procedureStatusMap,
          state,
        ),
        progress = summarizeWorkspaceProgress(roadmapYears, procedureStatusMap);
      const procedureDecisions = generateWorkspaceDecisions(
        companyProfile,
        state,
        roadmapYears,
        procedureStatusMap,
        documentStatusMap,
        undefined,
        Number.POSITIVE_INFINITY,
      );
      const entry = sources.monthly.value
        ? monthlySalesRowToEntry(sources.monthly.value, sources.taxPlans.value)
        : emptyMonthlySalesEntry(month, sources.taxPlans.value);
      const growth = buildWorkspaceGrowthNotifications(entry, {
        cashFlowDataAvailable: true,
        monthlyDataRegistered: sources.monthly.value !== null,
      });
      const merged = mergeDecisionActions(
        procedureDecisions.actions,
        growthNotificationsToDecisionActions(growth, companyId, month),
      );
      const decisions = {
        ...procedureDecisions,
        actions: merged,
        summary: summarizeDecisionActions(merged),
      };
      const notifications = buildWorkspaceNotifications(
        companyId,
        {
          ...procedureDecisions,
          actions: procedureDecisions.actions.slice(0, ACTION_MAX_ITEMS),
        },
        advice,
        procedureStatusMap,
        documentStatusMap,
        undefined,
        growth,
      );
      return {
        context,
        advice,
        progress,
        decisions,
        notifications,
        documentsNeedingUpdateCount: sources.documents.value.needsUpdateCount,
        todayActions: selectUrgentDecisionActions(merged),
      };
    },
  );
  const failed =
    Object.values(sources).some((r) => r.status === 'unavailable') ||
    derived.status === 'unavailable' ||
    !summary ||
    summary.openReviewCount === null ||
    summary.controlEvaluation === null;
  const profile =
    sources.companyProfile.status === 'loaded'
      ? sources.companyProfile.value
      : null;
  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/admin/workspaces"
        backLabel="顧問先一覧に戻る"
        brand
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            {company.name}
            <span className="tag">
              {CORPORATE_TYPE_LABEL[company.corporate_type] ??
                company.corporate_type}
            </span>
            {company.fiscal_month && (
              <span className="tag">決算月: {company.fiscal_month}月</span>
            )}
          </span>
        }
        subtitle="まず「今日やること」を確認してください。必要な情報や手続きはメニューから開けます。"
      />
      <WorkspaceCompletionFeedback companyId={companyId} />
      {failed && (
        <section role="alert" className="card space-y-3">
          <p>
            一部の情報を取得できません。取得できた情報だけを表示しています。
          </p>
          <WorkspaceReadReloadButton />
        </section>
      )}
      {derived.status === 'loaded' ? (
        <WorkspaceDashboard
          companyId={companyId}
          company={{
            corporateType: company.corporate_type,
            fiscalMonth: company.fiscal_month,
            prefectureName: derived.value.context.companyProfile.prefectureName,
            municipalityName:
              derived.value.context.companyProfile.municipalityName,
          }}
          state={derived.value.context.state}
          advice={derived.value.advice}
          progress={derived.value.progress}
          decisions={derived.value.decisions}
          todayActions={derived.value.todayActions}
          notifications={derived.value.notifications}
          documentsNeedingUpdateCount={
            derived.value.documentsNeedingUpdateCount
          }
        />
      ) : (
        <section
          className="card space-y-2"
          data-testid="home-derived-unavailable"
        >
          <h2 className="font-semibold">今日やること</h2>
          <p>
            必要なデータを取得できないため、対応が必要かどうかはまだ判断していません。上の「再読み込み」を押してください。
          </p>
        </section>
      )}
      <details className="card space-y-3" open={failed} data-testid="home-source-details">
        <summary className="cursor-pointer font-semibold">会社情報・今月の売上やお金を見る</summary>
        <div className="space-y-4 pt-3">
          <section className="card space-y-3" aria-label="取得済み情報">
            <h2 className="font-semibold">登録情報・今月の数値</h2>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div data-testid="home-profile">
                <dt>会社プロフィール・所在地</dt>
                <dd>
                  {profile
                    ? profile.registered
                      ? `従業員 ${profile.profile.employeeCount}人 / ${profile.profile.prefectureName}${profile.profile.municipalityName}`
                      : '未登録'
                    : '取得できません'}
                </dd>
              </div>
              <div data-testid="home-returns">
                <dt>決算実績</dt>
                <dd>
                  {sources.taxReturns.status === 'loaded'
                    ? `${sources.taxReturns.value.length}件${sources.taxReturns.value.length === 0 ? '（未登録）' : ''}`
                    : '取得できません'}
                </dd>
              </div>
              <div data-testid="home-statuses">
                <dt>登録済みの手続き状態</dt>
                <dd>
                  {sources.procedureStatuses.status === 'loaded'
                    ? `${Object.keys(sources.procedureStatuses.value).length}件`
                    : '取得できません'}
                </dd>
              </div>
              <div data-testid="home-documents">
                <dt>要更新書類</dt>
                <dd>
                  {sources.documents.status === 'loaded'
                    ? `${sources.documents.value.needsUpdateCount}件`
                    : '取得できません'}
                </dd>
              </div>
              <div data-testid="home-monthly">
                <dt>今月の売上・資金繰り登録値</dt>
                <dd>
                  {sources.monthly.status !== 'loaded' ? (
                    '取得できません'
                  ) : sources.monthly.value ? (
                    <>
                      <span className="block">
                        売上目標 ¥
                        {sources.monthly.value.target_revenue.toLocaleString(
                          'ja-JP',
                        )}{' '}
                        / 売上実績 ¥
                        {sources.monthly.value.actual_revenue.toLocaleString(
                          'ja-JP',
                        )}
                      </span>
                      <span className="block">
                        預金残高 ¥
                        {sources.monthly.value.cash_balance.toLocaleString('ja-JP')}
                      </span>
                    </>
                  ) : (
                    '未登録'
                  )}
                </dd>
              </div>
              <div data-testid="home-tax-plans">
                <dt>今月の連携納税予定</dt>
                <dd>
                  {sources.taxPlans.status === 'loaded'
                    ? `¥${sources.taxPlans.value.toLocaleString('ja-JP')}`
                    : '取得できません'}
                </dd>
              </div>
            </dl>
          </section>
          {sources.monthly.status === 'loaded' ? (
            <WorkspaceTodaySalesCard
              companyId={companyId}
              activity={
                sources.daily.status === 'loaded' ? sources.daily.value : null
              }
              revenueModel={sources.monthly.value?.revenue_model ?? 'sales_funnel'}
              fetchFailed={sources.daily.status !== 'loaded'}
            />
          ) : (
            <section className="card" data-testid="home-daily">
              <h2 className="font-semibold">今日の売上行動</h2>
              <p>
                {sources.daily.status !== 'loaded'
                  ? '取得できません'
                  : sources.daily.value
                    ? `登録値: 目標 ${sources.daily.value.targetUnits} / 実績 ${sources.daily.value.actualUnits}（売上モデル未確認のため参照のみ）`
                    : '未登録（売上モデル未確認のため参照のみ）'}
              </p>
            </section>
          )}
          <WorkspaceTaxReviewSummaryCard companyId={companyId} summary={summary} />
        </div>
      </details>
      {isOwner && (
        <WorkspaceDeleteButton
          companyId={companyId}
          companyName={company.name}
        />
      )}
    </div>
  );
}
