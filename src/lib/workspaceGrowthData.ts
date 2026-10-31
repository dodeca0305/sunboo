import type { ServerSupabaseClient } from './supabase/server';
import {
  monthlySalesRowToEntry, type DailySalesActivity, type MonthlySalesEntry,
  type MonthlySalesRow, type WeeklySalesActivity,
} from './monthlySalesProgress.ts';
import { sumTaxPaymentPlansByMonth, type WorkspaceTaxPaymentPlanRow } from './workspaceTaxPaymentPlan.ts';

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

export type WorkspaceGrowthDataResult =
  | { status: 'unavailable' }
  | {
      status: 'loaded';
      entries: MonthlySalesEntry[];
      weeklyActivities: WeeklySalesActivity[];
      dailyActivities: DailySalesActivity[];
      linkedTaxPaymentsByMonth: Record<string, number>;
    };

async function requireRows<T>(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await query;
  // 取得失敗を未登録扱いすると、ゼロのドラフトを既存行へupsertできてしまう。
  if (error || !Array.isArray(data)) throw new Error('Growth data unavailable');
  return data as T[];
}

export async function loadWorkspaceGrowthData(
  supabase: Pick<ServerSupabaseClient, 'from'>,
  companyId: number,
): Promise<WorkspaceGrowthDataResult> {
  try {
    const [data, weeklyData, dailyData, taxPaymentPlanData] = await Promise.all([
      requireRows<MonthlySalesRow>(supabase.from('workspace_monthly_sales')
        .select('year_month, target_revenue, actual_revenue, target_gross_profit, actual_cost_of_sales, target_operating_profit, actual_fixed_costs, cash_balance, expected_cash_inflows, expected_cash_outflows, planned_tax_payments, action_goal, revenue_model, meeting_count, conversion_rate, average_contract_value, customer_count, purchase_frequency, average_order_value')
        .eq('company_id', companyId)
        .order('year_month', { ascending: false })),
      requireRows<WeeklySalesRow>(supabase.from('workspace_weekly_sales_activities')
        .select('week_start, target_meetings, actual_meetings, actual_deals, target_customers, actual_customers, actual_purchases, actual_revenue, action_note')
        .eq('company_id', companyId)
        .order('week_start', { ascending: false })),
      requireRows<DailySalesRow>(supabase.from('workspace_daily_sales_activities')
        .select('activity_date, target_units, actual_units, action_plan, outcome_review')
        .eq('company_id', companyId)
        .order('activity_date', { ascending: false })),
      requireRows<WorkspaceTaxPaymentPlanRow>(supabase.from('workspace_tax_payment_plans')
        .select('procedure_id, due_date, amount')
        .eq('company_id', companyId)),
    ]);
    const linkedTaxPaymentsByMonth = sumTaxPaymentPlansByMonth(
      taxPaymentPlanData,
    );

    const entries: MonthlySalesEntry[] = data.map((row) =>
      monthlySalesRowToEntry(row, linkedTaxPaymentsByMonth[row.year_month.slice(0, 7)] ?? 0),
    );

    const weeklyActivities: WeeklySalesActivity[] = weeklyData.map((row) => ({
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
    const dailyActivities: DailySalesActivity[] = dailyData.map((row) => ({
      activityDate: row.activity_date,
      targetUnits: row.target_units,
      actualUnits: row.actual_units,
      actionPlan: row.action_plan,
      outcomeReview: row.outcome_review ?? '',
    }));
    return { status: 'loaded', entries, weeklyActivities, dailyActivities, linkedTaxPaymentsByMonth };
  } catch {
    return { status: 'unavailable' };
  }
}
