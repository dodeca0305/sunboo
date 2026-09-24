import { notFound } from 'next/navigation';
import { TrendingUp } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import WorkspaceSubNav from '@/components/WorkspaceSubNav';
import WorkspaceGrowthView from '@/components/WorkspaceGrowthView';
import InformationCard from '@/components/InformationCard';
import { createServerSupabase } from '@/lib/supabase/server';
import { loadWorkspaceCompany } from '@/lib/workspaceLoader';
import type { DailySalesActivity, MonthlySalesEntry, WeeklySalesActivity } from '@/lib/monthlySalesProgress';
import { sumTaxPaymentPlansByMonth, type WorkspaceTaxPaymentPlanRow } from '@/lib/workspaceTaxPaymentPlan';

type MonthlySalesRow = {
  year_month: string;
  target_revenue: number;
  actual_revenue: number;
  target_gross_profit: number;
  actual_cost_of_sales: number;
  target_operating_profit: number;
  actual_fixed_costs: number;
  cash_balance: number;
  expected_cash_inflows: number;
  expected_cash_outflows: number;
  planned_tax_payments: number;
  action_goal: string;
  revenue_model: 'sales_funnel' | 'customer_repeat';
  meeting_count: number;
  conversion_rate: number;
  average_contract_value: number;
  customer_count: number;
  purchase_frequency: number;
  average_order_value: number;
};

type WeeklySalesRow = {
  week_start: string;
  target_meetings: number;
  actual_meetings: number;
  actual_deals: number;
  target_customers: number;
  actual_customers: number;
  actual_purchases: number;
  actual_revenue: number;
  action_note: string;
};

type DailySalesRow = {
  activity_date: string;
  target_units: number;
  actual_units: number;
  action_plan: string;
  outcome_review: string;
};

export default async function WorkspaceGrowthPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const companyId = Number(id);
  if (!Number.isInteger(companyId)) notFound();

  const supabase = await createServerSupabase();
  if (!supabase) notFound();
  const company = await loadWorkspaceCompany(supabase, companyId);
  if (!company) notFound();

  const { data } = await supabase
    .from('workspace_monthly_sales')
    .select('year_month, target_revenue, actual_revenue, target_gross_profit, actual_cost_of_sales, target_operating_profit, actual_fixed_costs, cash_balance, expected_cash_inflows, expected_cash_outflows, planned_tax_payments, action_goal, revenue_model, meeting_count, conversion_rate, average_contract_value, customer_count, purchase_frequency, average_order_value')
    .eq('company_id', companyId)
    .order('year_month', { ascending: false });

  const { data: weeklyData } = await supabase
    .from('workspace_weekly_sales_activities')
    .select('week_start, target_meetings, actual_meetings, actual_deals, target_customers, actual_customers, actual_purchases, actual_revenue, action_note')
    .eq('company_id', companyId)
    .order('week_start', { ascending: false });

  const { data: dailyData } = await supabase
    .from('workspace_daily_sales_activities')
    .select('activity_date, target_units, actual_units, action_plan, outcome_review')
    .eq('company_id', companyId)
    .order('activity_date', { ascending: false });

  const { data: taxPaymentPlanData } = await supabase
    .from('workspace_tax_payment_plans')
    .select('procedure_id, due_date, amount')
    .eq('company_id', companyId);
  const linkedTaxPaymentsByMonth = sumTaxPaymentPlansByMonth(
    (taxPaymentPlanData as WorkspaceTaxPaymentPlanRow[] | null) ?? [],
  );

  const entries: MonthlySalesEntry[] = ((data as MonthlySalesRow[] | null) ?? []).map((row) => ({
    yearMonth: row.year_month.slice(0, 7),
    targetRevenue: row.target_revenue,
    actualRevenue: row.actual_revenue,
    targetGrossProfit: row.target_gross_profit ?? 0,
    actualCostOfSales: row.actual_cost_of_sales ?? 0,
    targetOperatingProfit: row.target_operating_profit ?? 0,
    actualFixedCosts: row.actual_fixed_costs ?? 0,
    cashBalance: row.cash_balance ?? 0,
    expectedCashInflows: row.expected_cash_inflows ?? 0,
    expectedCashOutflows: row.expected_cash_outflows ?? 0,
    plannedTaxPayments: row.planned_tax_payments ?? 0,
    linkedTaxPayments: linkedTaxPaymentsByMonth[row.year_month.slice(0, 7)] ?? 0,
    actionGoal: row.action_goal,
    revenueModel: row.revenue_model ?? 'sales_funnel',
    meetingCount: row.meeting_count ?? 0,
    conversionRate: row.conversion_rate ?? 0,
    averageContractValue: row.average_contract_value ?? 0,
    customerCount: row.customer_count ?? 0,
    purchaseFrequency: row.purchase_frequency ?? 0,
    averageOrderValue: row.average_order_value ?? 0,
  }));

  const weeklyActivities: WeeklySalesActivity[] = ((weeklyData as WeeklySalesRow[] | null) ?? []).map((row) => ({
    weekStart: row.week_start,
    targetMeetings: row.target_meetings,
    actualMeetings: row.actual_meetings,
    actualDeals: row.actual_deals,
    targetCustomers: row.target_customers ?? 0,
    actualCustomers: row.actual_customers ?? 0,
    actualPurchases: row.actual_purchases ?? 0,
    actualRevenue: row.actual_revenue ?? 0,
    actionNote: row.action_note,
  }));
  const dailyActivities: DailySalesActivity[] = ((dailyData as DailySalesRow[] | null) ?? []).map((row) => ({
    activityDate: row.activity_date,
    targetUnits: row.target_units,
    actualUnits: row.actual_units,
    actionPlan: row.action_plan,
    outcomeReview: row.outcome_review ?? '',
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        backHref={`/admin/workspaces/${companyId}`}
        backLabel={`${company.name} に戻る`}
        icon={TrendingUp}
        title="売上目標"
        subtitle={`${company.name}の月間目標と実績を、具体的な行動へつなげます。`}
      />
      <WorkspaceSubNav companyId={companyId} />
      <InformationCard kind="disclaimer">
        売上達成を保証する機能ではありません。実績との差を早めに把握し、経営者が行動を見直すための参考情報です。
      </InformationCard>
      <WorkspaceGrowthView
        companyId={companyId}
        initialEntries={entries}
        initialWeeklyActivities={weeklyActivities}
        initialDailyActivities={dailyActivities}
        linkedTaxPaymentsByMonth={linkedTaxPaymentsByMonth}
      />
    </div>
  );
}
