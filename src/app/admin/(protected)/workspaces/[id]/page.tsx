import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Building2, Receipt, CalendarRange, Share2, BarChart3, FileStack,
} from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase/server';
import PageHeader from '@/components/PageHeader';
import { type CompanyState } from '@/lib/state';
import type { WorkspaceDocumentStatusMap } from '@/lib/workspaceDocumentStatus';
import { generateWorkspaceAdvice, summarizeWorkspaceProgress, type WorkspaceAdvice, type WorkspaceProgressSummary } from '@/lib/workspaceAdvice';
import {
  generateWorkspaceDecisions, mergeDecisionActions, selectUrgentDecisionActions, summarizeDecisionActions,
  type WorkspaceDecisionAction, type WorkspaceDecisions,
} from '@/lib/workspaceDecisions';
import { buildWorkspaceNotifications, type WorkspaceNotification } from '@/lib/workspaceNotifications';
import { buildWorkspaceGrowthNotifications } from '@/lib/workspaceGrowthNotifications';
import { growthNotificationsToDecisionActions } from '@/lib/workspaceGrowthActions';
import { loadWorkspaceCompany, loadWorkspaceDocumentStatuses, loadWorkspaceRoadmapContext } from '@/lib/workspaceLoader';
import WorkspaceDashboard from '@/components/WorkspaceDashboard';
import WorkspaceSubNav from '@/components/WorkspaceSubNav';
import WorkspaceCompletionFeedback from '@/components/WorkspaceCompletionFeedback';
import WorkspaceTodaySalesCard from '@/components/WorkspaceTodaySalesCard';
import {
  emptyMonthlySalesEntry, monthEndDate, monthlySalesRowToEntry, todayInJapan,
  type DailySalesActivity, type MonthlySalesEntry, type MonthlySalesRow, type RevenueModel,
} from '@/lib/monthlySalesProgress';
import type { WorkspaceTaxPaymentPlanRow } from '@/lib/workspaceTaxPaymentPlan';
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
  { icon: BarChart3, title: '売上目標', description: '月間目標・実績・行動の管理', hrefSuffix: '/growth', comingSoon: false },
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

  const today = todayInJapan();
  const currentYearMonth = today.slice(0, 7);
  let todaySalesActivity: DailySalesActivity | null = null;
  let revenueModel: RevenueModel = 'sales_funnel';
  // 【追加】会社ホームの「重要アクション」（売上未達・資金不足）判定に使う今月分の売上・資金繰りデータ。
  // growth/page.tsxと同じ列構成を取得し、同じmonthlySalesRowToEntryで変換することで
  // 変換ロジックの重複を避ける（docs/DEVELOPMENT_HANDOFF.md 3節）。
  let monthlySalesEntry: MonthlySalesEntry | null = null;
  // 【レビュー対応】workspace_tax_payment_plansの取得に失敗した場合、trueのままにしない。
  // 取得失敗を「今月の納税予定は0円」と同一視すると、資金不足額を実際より少なく見積もってしまう
  // （断定を避け、取得できなかった事実をそのまま通知側へ伝える）。
  let cashFlowDataAvailable = true;
  // 【レビュー対応】daily/monthlyそれぞれの取得失敗を「未登録（データが無い）」と区別するフラグ。
  // 区別しないと、取得に失敗しただけなのに「未登録」向けのUI（新規作成導線・警告無し）が
  // 表示され、既存の計画・データを見失ったまま誤った操作につながる、または警告が出ないことを
  // 「問題なし」と誤認される（Unknown is better than Wrong）。
  let todaySalesFetchFailed = false;
  let monthlySalesFetchFailed = false;
  // 【レビュー対応】workspace_monthly_salesにこの月の行が無い（まだ一度も保存していない）場合でも、
  // 連携納税予定（workspace_tax_payment_plans）の額を無視しない。以前はif(monthly)の内側でのみ
  // linkedTaxPaymentsを計算していたため、未登録月では連携納税予定の有無に関わらず会社ホームが
  // 何も通知しない不備があった（growth画面の詳細では同じ納税予定を元に資金不足額を表示していたため、
  // 画面間で表示が食い違っていた）。
  let monthlyDataRegistered = true;
  try {
    const [dailyResult, monthlyResult, taxPaymentPlanResult] = await Promise.all([
      supabase
        .from('workspace_daily_sales_activities')
        .select('activity_date,target_units,actual_units,action_plan,outcome_review')
        .eq('company_id', companyId)
        .eq('activity_date', today)
        .maybeSingle(),
      supabase
        .from('workspace_monthly_sales')
        .select('year_month, target_revenue, actual_revenue, target_gross_profit, actual_cost_of_sales, target_operating_profit, actual_fixed_costs, cash_balance, expected_cash_inflows, expected_cash_outflows, planned_tax_payments, action_goal, revenue_model, meeting_count, conversion_rate, average_contract_value, customer_count, purchase_frequency, average_order_value')
        .eq('company_id', companyId)
        .eq('year_month', `${currentYearMonth}-01`)
        .maybeSingle(),
      supabase
        .from('workspace_tax_payment_plans')
        .select('procedure_id, due_date, amount')
        .eq('company_id', companyId)
        .gte('due_date', `${currentYearMonth}-01`)
        .lte('due_date', monthEndDate(currentYearMonth)),
    ]);

    // 【レビュー対応】各取得結果のerrorを明示的に確認する。Supabaseはクエリ失敗時も例外を
    // 投げず{data: null, error: {...}}を返すため、errorを見ないとdataがnullな理由が
    // 「未入力」なのか「取得失敗」なのか区別できない（取得失敗を未入力・0円と同一視しない）。
    if (dailyResult.error) {
      todaySalesActivity = null;
      todaySalesFetchFailed = true;
    } else {
      const daily = dailyResult.data as {
        activity_date: string;
        target_units: number;
        actual_units: number;
        action_plan: string;
        outcome_review: string | null;
      } | null;
      if (daily) {
        todaySalesActivity = {
          activityDate: daily.activity_date,
          targetUnits: Number(daily.target_units ?? 0),
          actualUnits: Number(daily.actual_units ?? 0),
          actionPlan: daily.action_plan ?? '',
          outcomeReview: daily.outcome_review ?? '',
        };
      }
    }

    if (monthlyResult.error) {
      monthlySalesEntry = null;
      monthlySalesFetchFailed = true;
    } else {
      const monthly = monthlyResult.data as MonthlySalesRow | null;
      if (monthly?.revenue_model === 'customer_repeat') revenueModel = 'customer_repeat';
      monthlyDataRegistered = Boolean(monthly);

      let linkedTaxPayments = 0;
      if (taxPaymentPlanResult.error) {
        // 月次売上の取得自体は成功している（またはそもそも未登録）。納税予定だけが不明なため、
        // 売上未達の通知はそのまま成立させつつ、資金繰り側は金額を断定しない
        // （workspaceGrowthNotifications.ts）。
        cashFlowDataAvailable = false;
      } else {
        linkedTaxPayments = ((taxPaymentPlanResult.data as WorkspaceTaxPaymentPlanRow[] | null) ?? [])
          .reduce((sum, row) => sum + Math.max(0, row.amount ?? 0), 0);
      }

      monthlySalesEntry = monthly
        ? monthlySalesRowToEntry(monthly, linkedTaxPayments)
        : emptyMonthlySalesEntry(currentYearMonth, linkedTaxPayments);
    }
  } catch {
    // 【レビュー対応】例外発生時もerrorチェックと同じ扱いにする（未登録・0円と同一視しない）。
    todaySalesActivity = null;
    todaySalesFetchFailed = true;
    monthlySalesEntry = null;
    monthlySalesFetchFailed = true;
    cashFlowDataAvailable = true; // monthlySalesFetchFailed=trueが優先されるため値自体は使われない
    monthlyDataRegistered = true; // 同上
  }

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
  let todayActions: WorkspaceDecisionAction[] = [];
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
    const procedureDecisions = generateWorkspaceDecisions(
      companyProfile, state, roadmapYears, procedureStatusMap, documentStatusMap,
    );
    const growthNotifications = buildWorkspaceGrowthNotifications(monthlySalesEntry, {
      cashFlowDataAvailable,
      monthlyDataFetchFailed: monthlySalesFetchFailed,
      monthlyDataRegistered,
    });

    // 【追加】手続き起因のactions（procedureDecisions.actions）と、売上・資金繰り起因のactions
    // （growthNotificationsをそのまま変換、新しい判定ロジックは持たない）を同じ優先順位
    // （compareDecisionActions: 重要度→実際の期限の近さ、期限の無い項目は架空の期限を付けず
    // 最後方へ）で合流させる。「意思決定」の件数・表示・summaryはこの合流後の配列から一貫して
    // 導出するため、二重計上や件数の不整合は起きない。
    const growthActions = growthNotificationsToDecisionActions(growthNotifications, companyId, currentYearMonth);
    const mergedActions = mergeDecisionActions(procedureDecisions.actions, growthActions);
    decisions = { ...procedureDecisions, actions: mergedActions, summary: summarizeDecisionActions(mergedActions) };
    // 「今日やること」は合流済みactionsのうち最優先の階層のみ（高優先度が無ければ中優先度）。
    // 既存のselectTodayActionItems（advice.warnings優先）と同じ「上位が無ければ次」という考え方を
    // 手続き・書類・売上・資金繰りをまとめた配列に対して適用する。
    todayActions = selectUrgentDecisionActions(mergedActions);

    // 【注意】ここは必ずprocedureDecisions（手続きのみ、合流前）を渡す。合流後のdecisionsを渡すと、
    // decisions.actionsに既に含まれる売上・資金繰りactionsがfromDecisionActions経由で
    // 'deadline'カテゴリとして再度拾われ、growthNotificationsと二重に通知されてしまう。
    notifications = buildWorkspaceNotifications(
      companyId, procedureDecisions, advice, procedureStatusMap, documentStatusMap, undefined, growthNotifications,
    );
  } catch {
    advice = null;
    progress = null;
    decisions = null;
    notifications = [];
    todayActions = [];
    state = null;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/admin/workspaces"
        backLabel="顧問先一覧に戻る"
        brand
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            {company.name}
            <span className="tag">{CORPORATE_TYPE_LABEL[company.corporate_type] ?? company.corporate_type}</span>
            {company.fiscal_month && <span className="tag">決算月: {company.fiscal_month}月</span>}
          </span>
        }
        subtitle="今日確認すべきことと、今年の手続きの見通しをまとめています。"
      />

      <WorkspaceSubNav companyId={companyId} />

      <WorkspaceCompletionFeedback companyId={companyId} />

      <WorkspaceTodaySalesCard
        companyId={companyId}
        activity={todaySalesActivity}
        revenueModel={revenueModel}
        fetchFailed={todaySalesFetchFailed}
      />

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
          todayActions={todayActions}
          notifications={notifications}
          documentsNeedingUpdateCount={documentsNeedingUpdateCount}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map(({ icon: Icon, title, description, hrefSuffix, comingSoon }) => {
          const content = (
            <>
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-sunboo-ink-muted" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-sunboo-ink">{title}</p>
                  {comingSoon && <span className="tag">Coming Soon</span>}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-sunboo-ink-muted">{description}</p>
              </div>
            </>
          );
          return hrefSuffix ? (
            <Link
              key={title}
              href={`/admin/workspaces/${companyId}${hrefSuffix}`}
              className="card flex min-h-26 items-start gap-3 transition-colors hover:border-sunboo-morning-sun-dark hover:bg-sunboo-warm-paper"
            >
              {content}
            </Link>
          ) : (
            <div key={title} className="card flex min-h-26 items-start gap-3">
              {content}
            </div>
          );
        })}
      </div>

      {isOwner && <WorkspaceDeleteButton companyId={companyId} companyName={company.name} />}
    </div>
  );
}
