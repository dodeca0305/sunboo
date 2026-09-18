'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Save, Target, TrendingUp } from 'lucide-react';
import FormattedIntegerInput from '@/components/FormattedIntegerInput';
import InformationCard from '@/components/InformationCard';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import {
  calculateMonthlySalesProgress,
  calculateMonthlyGrossProfit,
  calculateMonthlyOperatingProfit,
  calculateMonthlyCashFlow,
  buildCashFlowActions,
  calculateSalesDriverPlan,
  calculateWeeklyCustomerProgress,
  calculateWeeklySalesProgress,
  currentWeekStart,
  currentYearMonth,
  shiftYearMonth,
  type MonthlySalesEntry,
  type WeeklySalesActivity,
} from '@/lib/monthlySalesProgress';

const yen = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 });

function emptyEntry(yearMonth: string, linkedTaxPayments = 0): MonthlySalesEntry {
  return {
    yearMonth,
    targetRevenue: 0,
    actualRevenue: 0,
    targetGrossProfit: 0,
    actualCostOfSales: 0,
    targetOperatingProfit: 0,
    actualFixedCosts: 0,
    cashBalance: 0,
    expectedCashInflows: 0,
    expectedCashOutflows: 0,
    plannedTaxPayments: 0,
    linkedTaxPayments,
    actionGoal: '',
    revenueModel: 'sales_funnel',
    meetingCount: 0,
    conversionRate: 0,
    averageContractValue: 0,
    customerCount: 0,
    purchaseFrequency: 0,
    averageOrderValue: 0,
  };
}

export default function WorkspaceGrowthView({
  companyId,
  initialEntries,
  initialWeeklyActivities,
  linkedTaxPaymentsByMonth,
}: {
  companyId: number;
  initialEntries: MonthlySalesEntry[];
  initialWeeklyActivities: WeeklySalesActivity[];
  linkedTaxPaymentsByMonth: Record<string, number>;
}) {
  const initialMap = Object.fromEntries(initialEntries.map((entry) => [entry.yearMonth, entry]));
  const [entries, setEntries] = useState<Record<string, MonthlySalesEntry>>(initialMap);
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const selected = entries[yearMonth] ?? emptyEntry(yearMonth, linkedTaxPaymentsByMonth[yearMonth] ?? 0);
  const [draft, setDraft] = useState<MonthlySalesEntry>(selected);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const initialWeeklyMap = Object.fromEntries(initialWeeklyActivities.map((activity) => [activity.weekStart, activity]));
  const [weeklyActivities, setWeeklyActivities] = useState<Record<string, WeeklySalesActivity>>(initialWeeklyMap);
  const [weekStart, setWeekStart] = useState(currentWeekStart());
  const [weeklyDraft, setWeeklyDraft] = useState<WeeklySalesActivity>(initialWeeklyMap[currentWeekStart()] ?? {
    weekStart: currentWeekStart(),
    targetMeetings: 0,
    actualMeetings: 0,
    actualDeals: 0,
    targetCustomers: 0,
    actualCustomers: 0,
    actualPurchases: 0,
    actualRevenue: 0,
    actionNote: '',
  });
  const [weeklySaving, setWeeklySaving] = useState(false);
  const [weeklySaved, setWeeklySaved] = useState(false);
  const progress = useMemo(() => calculateMonthlySalesProgress(draft), [draft]);
  const grossProfitProgress = useMemo(() => calculateMonthlyGrossProfit(draft), [draft]);
  const operatingProfitProgress = useMemo(() => calculateMonthlyOperatingProfit(draft), [draft]);
  const cashFlowProgress = useMemo(() => calculateMonthlyCashFlow(draft), [draft]);
  const cashFlowActions = useMemo(
    () => buildCashFlowActions(draft, cashFlowProgress),
    [draft, cashFlowProgress],
  );
  const driverPlan = useMemo(() => calculateSalesDriverPlan(draft), [draft]);
  const monthEnd = useMemo(() => {
    const [year, month] = draft.yearMonth.split('-').map(Number);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return `${draft.yearMonth}-${String(lastDay).padStart(2, '0')}`;
  }, [draft.yearMonth]);
  const weeklyProgress = useMemo(() => calculateWeeklySalesProgress({
    activity: weeklyDraft,
    plannedConversionRate: draft.conversionRate,
    remainingMeetings: driverPlan.additionalMeetingsNeeded,
    monthEnd,
  }), [weeklyDraft, draft.conversionRate, driverPlan.additionalMeetingsNeeded, monthEnd]);
  const weeklyCustomerProgress = useMemo(() => calculateWeeklyCustomerProgress({
    activity: weeklyDraft,
    remainingCustomers: driverPlan.additionalCustomersNeeded,
    monthEnd,
  }), [weeklyDraft, driverPlan.additionalCustomersNeeded, monthEnd]);

  function changeMonth(nextMonth: string) {
    if (!/^\d{4}-\d{2}$/.test(nextMonth)) return;
    setYearMonth(nextMonth);
    setDraft(entries[nextMonth] ?? emptyEntry(nextMonth, linkedTaxPaymentsByMonth[nextMonth] ?? 0));
    setError(null);
    setSaved(false);
  }

  async function save() {
    if (draft.targetRevenue <= 0) {
      setError('月間売上目標を入力してください。');
      return;
    }
    if (!draft.actionGoal.trim()) {
      setError('今月の行動目標を入力してください。');
      return;
    }
    if (draft.targetGrossProfit > draft.targetRevenue) {
      setError('月間粗利益目標は月間売上目標以下で入力してください。');
      return;
    }

    const supabase = createBrowserSupabase();
    if (!supabase) {
      setError('Supabase が設定されていません。');
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(false);
    const { error: saveError } = await supabase.from('workspace_monthly_sales').upsert({
      company_id: companyId,
      year_month: `${draft.yearMonth}-01`,
      target_revenue: draft.targetRevenue,
      actual_revenue: draft.actualRevenue,
      target_gross_profit: draft.targetGrossProfit,
      actual_cost_of_sales: draft.actualCostOfSales,
      target_operating_profit: draft.targetOperatingProfit,
      actual_fixed_costs: draft.actualFixedCosts,
      cash_balance: draft.cashBalance,
      expected_cash_inflows: draft.expectedCashInflows,
      expected_cash_outflows: draft.expectedCashOutflows,
      planned_tax_payments: draft.plannedTaxPayments,
      action_goal: draft.actionGoal.trim(),
      revenue_model: draft.revenueModel,
      meeting_count: draft.meetingCount,
      conversion_rate: draft.conversionRate,
      average_contract_value: draft.averageContractValue,
      customer_count: draft.customerCount,
      purchase_frequency: draft.purchaseFrequency,
      average_order_value: draft.averageOrderValue,
    }, { onConflict: 'company_id,year_month' });
    setSaving(false);

    if (saveError) {
      setError(`保存に失敗しました: ${saveError.message}`);
      return;
    }

    const savedEntry = { ...draft, actionGoal: draft.actionGoal.trim() };
    setDraft(savedEntry);
    setEntries((previous) => ({ ...previous, [yearMonth]: savedEntry }));
    setSaved(true);
  }

  function changeWeek(nextWeek: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextWeek)) return;
    setWeekStart(nextWeek);
    setWeeklyDraft(weeklyActivities[nextWeek] ?? {
      weekStart: nextWeek,
      targetMeetings: 0,
      actualMeetings: 0,
      actualDeals: 0,
      targetCustomers: 0,
      actualCustomers: 0,
      actualPurchases: 0,
      actualRevenue: 0,
      actionNote: '',
    });
    setWeeklySaved(false);
    setError(null);
  }

  async function saveWeeklyActivity() {
    if (draft.revenueModel === 'sales_funnel' && weeklyDraft.targetMeetings <= 0) {
      setError('今週の商談目標を入力してください。');
      return;
    }
    if (draft.revenueModel === 'sales_funnel' && weeklyDraft.actualDeals > weeklyDraft.actualMeetings) {
      setError('成約数は実際の商談数以下で入力してください。');
      return;
    }
    if (draft.revenueModel === 'customer_repeat' && weeklyDraft.targetCustomers <= 0) {
      setError('今週の顧客目標を入力してください。');
      return;
    }
    if (draft.revenueModel === 'customer_repeat' && weeklyDraft.actualCustomers > weeklyDraft.actualPurchases) {
      setError('購入件数は実際の顧客数以上で入力してください。');
      return;
    }

    const supabase = createBrowserSupabase();
    if (!supabase) {
      setError('Supabase が設定されていません。');
      return;
    }

    setWeeklySaving(true);
    setWeeklySaved(false);
    setError(null);
    const { error: saveError } = await supabase.from('workspace_weekly_sales_activities').upsert({
      company_id: companyId,
      week_start: weeklyDraft.weekStart,
      target_meetings: weeklyDraft.targetMeetings,
      actual_meetings: weeklyDraft.actualMeetings,
      actual_deals: weeklyDraft.actualDeals,
      target_customers: weeklyDraft.targetCustomers,
      actual_customers: weeklyDraft.actualCustomers,
      actual_purchases: weeklyDraft.actualPurchases,
      actual_revenue: weeklyDraft.actualRevenue,
      action_note: weeklyDraft.actionNote.trim(),
    }, { onConflict: 'company_id,week_start' });
    setWeeklySaving(false);

    if (saveError) {
      setError(`週間実績の保存に失敗しました: ${saveError.message}`);
      return;
    }

    const savedActivity = { ...weeklyDraft, actionNote: weeklyDraft.actionNote.trim() };
    setWeeklyDraft(savedActivity);
    setWeeklyActivities((previous) => ({ ...previous, [weekStart]: savedActivity }));
    setWeeklySaved(true);
  }

  return (
    <div className="space-y-5">
      {error && <InformationCard kind="error">{error}</InformationCard>}
      {saved && (
        <div className="information-card information-card--success flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4" />保存しました。
        </div>
      )}

      <div className="card space-y-4">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-sunboo-moss" />
          <h2 className="font-bold text-sunboo-ink">月間売上計画</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="form-label" htmlFor="growth-year-month">対象月</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-secondary min-h-11 shrink-0 px-3"
                aria-label="前月を表示"
                onClick={() => changeMonth(shiftYearMonth(yearMonth, -1))}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                前月
              </button>
              <input
                id="growth-year-month"
                type="month"
                className="form-input min-w-0"
                value={yearMonth}
                onChange={(event) => changeMonth(event.target.value)}
              />
              <button
                type="button"
                className="btn-secondary min-h-11 shrink-0 px-3"
                aria-label="翌月を表示"
                onClick={() => changeMonth(shiftYearMonth(yearMonth, 1))}
              >
                翌月
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div>
            <label className="form-label">月間売上目標（円）</label>
            <FormattedIntegerInput
              value={draft.targetRevenue}
              onChange={(value) => setDraft((previous) => ({ ...previous, targetRevenue: value ?? 0 }))}
              ariaLabel="月間売上目標"
              placeholder="例：3,000,000"
              selectZeroOnFocus
              zeroAsBlank
            />
          </div>
          <div>
            <label className="form-label">現在の売上実績（円）</label>
            <FormattedIntegerInput
              value={draft.actualRevenue}
              onChange={(value) => setDraft((previous) => ({ ...previous, actualRevenue: value ?? 0 }))}
              ariaLabel="現在の売上実績"
              placeholder="例：1,500,000"
              selectZeroOnFocus
              zeroAsBlank
            />
          </div>
        </div>

        <div>
          <label className="form-label" htmlFor="growth-action-goal">今月の行動目標</label>
          <textarea
            id="growth-action-goal"
            className="form-input min-h-24"
            maxLength={500}
            value={draft.actionGoal}
            onChange={(event) => setDraft((previous) => ({ ...previous, actionGoal: event.target.value }))}
            placeholder="例：既存顧客10社へ追加提案し、新規商談を5件つくる"
          />
          <p className="mt-1 text-right text-xs text-sunboo-ink-muted">{draft.actionGoal.length}/500文字</p>
        </div>

      </div>

      <div className="card space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-sunboo-moss" />
            <h2 className="font-bold text-sunboo-ink">売上をつくる数字</h2>
          </div>
          <p className="mt-1 text-sm text-sunboo-ink-muted">
            自社に近い計算方法を選び、目標達成に必要な行動量を見える化します。
          </p>
        </div>

        <div>
          <label className="form-label" htmlFor="growth-revenue-model">売上の計算方法</label>
          <select
            id="growth-revenue-model"
            className="form-input"
            value={draft.revenueModel}
            onChange={(event) => setDraft((previous) => ({
              ...previous,
              revenueModel: event.target.value as MonthlySalesEntry['revenueModel'],
            }))}
          >
            <option value="sales_funnel">商談数 × 成約率 × 平均契約単価</option>
            <option value="customer_repeat">顧客数 × 月間購入回数 × 平均単価</option>
          </select>
        </div>

        {draft.revenueModel === 'sales_funnel' ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <DriverInput
              label="今月の商談予定数（件）"
              value={draft.meetingCount}
              onChange={(value) => setDraft((previous) => ({ ...previous, meetingCount: value }))}
              placeholder="例：20"
            />
            <DriverInput
              label="想定成約率（%）"
              value={draft.conversionRate}
              onChange={(value) => setDraft((previous) => ({ ...previous, conversionRate: Math.min(100, value) }))}
              placeholder="例：25"
            />
            <DriverInput
              label="平均契約単価（円）"
              value={draft.averageContractValue}
              onChange={(value) => setDraft((previous) => ({ ...previous, averageContractValue: value }))}
              placeholder="例：500,000"
            />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            <DriverInput
              label="今月の想定顧客数（人・社）"
              value={draft.customerCount}
              onChange={(value) => setDraft((previous) => ({ ...previous, customerCount: value }))}
              placeholder="例：100"
            />
            <DriverInput
              label="1顧客の月間購入回数（回）"
              value={draft.purchaseFrequency}
              onChange={(value) => setDraft((previous) => ({ ...previous, purchaseFrequency: value }))}
              placeholder="例：2"
            />
            <DriverInput
              label="平均単価（円）"
              value={draft.averageOrderValue}
              onChange={(value) => setDraft((previous) => ({ ...previous, averageOrderValue: value }))}
              placeholder="例：5,000"
            />
          </div>
        )}

        {driverPlan.hasEnoughInputs ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="計画上の見込売上" value={yen.format(driverPlan.projectedRevenue)} />
            <Metric label="計画上の不足額" value={yen.format(driverPlan.projectedGap)} caution={driverPlan.projectedGap > 0} />
            {draft.revenueModel === 'sales_funnel' ? (
              <>
                <Metric label="見込成約数" value={`${driverPlan.projectedDeals}件`} />
                <Metric
                  label="不足を埋める追加商談"
                  value={`${driverPlan.additionalMeetingsNeeded}件`}
                  caution={driverPlan.additionalMeetingsNeeded > 0}
                />
              </>
            ) : (
              <Metric
                label="不足を埋める追加顧客"
                value={`${driverPlan.additionalCustomersNeeded}人・社`}
                caution={driverPlan.additionalCustomersNeeded > 0}
              />
            )}
          </div>
        ) : (
          <InformationCard kind="info">
            3つの数字を入力すると、見込売上と目標達成に必要な追加件数が表示されます。
          </InformationCard>
        )}
        <p className="text-xs text-sunboo-ink-muted">
          この計算は入力した想定値に基づく目安であり、売上や成約を保証するものではありません。
        </p>

        <div className="border-t border-sunboo-line pt-4">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-sunboo-moss" />
            <h2 className="font-bold text-sunboo-ink">利益を残す数字</h2>
          </div>
          <p className="mt-1 text-sm text-sunboo-ink-muted">
            売上原価を差し引いた粗利益を確認し、売上だけでなく会社に残る利益を管理します。
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <DriverInput
            label="月間粗利益目標（円）"
            value={draft.targetGrossProfit}
            onChange={(value) => setDraft((previous) => ({ ...previous, targetGrossProfit: value }))}
            placeholder="例：1,200,000"
          />
          <DriverInput
            label="現在の売上原価（円）"
            value={draft.actualCostOfSales}
            onChange={(value) => setDraft((previous) => ({ ...previous, actualCostOfSales: value }))}
            placeholder="例：600,000"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="現在の実績粗利益"
            value={yen.format(grossProfitProgress.actualGrossProfit)}
            caution={grossProfitProgress.actualGrossProfit < 0}
          />
          <Metric
            label="現在の粗利率"
            value={`${grossProfitProgress.grossProfitMargin}%`}
            caution={grossProfitProgress.grossProfitMargin < 0}
          />
          <Metric
            label="粗利益目標までの不足額"
            value={yen.format(grossProfitProgress.grossProfitShortfall)}
            caution={grossProfitProgress.grossProfitShortfall > 0}
          />
          <Metric
            label="粗利益目標の達成率"
            value={`${grossProfitProgress.grossProfitAchievementRate}%`}
            caution={grossProfitProgress.grossProfitAchievementRate < 100}
          />
        </div>

        <div className="border-t border-sunboo-line pt-4">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-sunboo-moss" />
            <h2 className="font-bold text-sunboo-ink">黒字をつくる数字</h2>
          </div>
          <p className="mt-1 text-sm text-sunboo-ink-muted">
            粗利益から固定費を差し引き、営業利益と黒字化に必要な売上を確認します。
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <DriverInput
            label="月間営業利益目標（円）"
            value={draft.targetOperatingProfit}
            onChange={(value) => setDraft((previous) => ({ ...previous, targetOperatingProfit: value }))}
            placeholder="例：500,000"
          />
          <DriverInput
            label="現在の固定費（円）"
            value={draft.actualFixedCosts}
            onChange={(value) => setDraft((previous) => ({ ...previous, actualFixedCosts: value }))}
            placeholder="例：700,000"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="現在の営業利益"
            value={yen.format(operatingProfitProgress.actualOperatingProfit)}
            caution={operatingProfitProgress.actualOperatingProfit < 0}
          />
          <Metric
            label="営業利益目標までの不足額"
            value={yen.format(operatingProfitProgress.operatingProfitShortfall)}
            caution={operatingProfitProgress.operatingProfitShortfall > 0}
          />
          <Metric
            label="損益分岐点売上高"
            value={operatingProfitProgress.breakEvenRevenue === null
              ? '算出不可'
              : yen.format(operatingProfitProgress.breakEvenRevenue)}
            caution={operatingProfitProgress.breakEvenRevenue === null}
          />
          <Metric
            label="目標営業利益に必要な売上"
            value={operatingProfitProgress.requiredRevenueForTargetProfit === null
              ? '算出不可'
              : yen.format(operatingProfitProgress.requiredRevenueForTargetProfit)}
            caution={operatingProfitProgress.requiredRevenueForTargetProfit === null
              || operatingProfitProgress.requiredRevenueForTargetProfit > draft.actualRevenue}
          />
        </div>

        <div className="border-t border-sunboo-line pt-4">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-sunboo-moss" />
            <h2 className="font-bold text-sunboo-ink">資金を切らさない数字</h2>
          </div>
          <p className="mt-1 text-sm text-sunboo-ink-muted">
            預金残高と今月の入出金予定から、月末の資金不足を早めに把握します。
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DriverInput
            label="現在の預金残高（円）"
            value={draft.cashBalance}
            onChange={(value) => setDraft((previous) => ({ ...previous, cashBalance: value }))}
            placeholder="例：3,000,000"
          />
          <DriverInput
            label="今月の入金予定（円）"
            value={draft.expectedCashInflows}
            onChange={(value) => setDraft((previous) => ({ ...previous, expectedCashInflows: value }))}
            placeholder="例：2,000,000"
          />
          <DriverInput
            label="今月の支出予定・納税除く（円）"
            value={draft.expectedCashOutflows}
            onChange={(value) => setDraft((previous) => ({ ...previous, expectedCashOutflows: value }))}
            placeholder="例：2,500,000"
          />
          <DriverInput
            label="その他の納税予定（円）"
            value={draft.plannedTaxPayments}
            onChange={(value) => setDraft((previous) => ({ ...previous, plannedTaxPayments: value }))}
            placeholder="ロードマップ外の納税"
          />
        </div>

        <div className="rounded-xl border border-sunboo-mist bg-sunboo-paper px-4 py-3">
          <p className="text-xs text-sunboo-ink-muted">年間ロードマップから自動連携された今月の納税予定</p>
          <p className="mt-1 font-bold text-sunboo-ink">{yen.format(draft.linkedTaxPayments)}</p>
          <p className="mt-1 text-xs text-sunboo-ink-muted">
            納期限がこの月にある税務・地方税の予定税額を合計しています。
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="月末の預金見込残高"
            value={yen.format(cashFlowProgress.projectedClosingCash)}
            caution={cashFlowProgress.projectedClosingCash < 0}
          />
          <Metric
            label="今月の資金増減"
            value={yen.format(cashFlowProgress.netCashFlow)}
            caution={cashFlowProgress.netCashFlow < 0}
          />
          <Metric
            label="月末の資金不足額"
            value={yen.format(cashFlowProgress.fundingGap)}
            caution={cashFlowProgress.fundingGap > 0}
          />
          <Metric
            label="資金が持つ目安"
            value={cashFlowProgress.runwayMonths === null
              ? '資金減少なし'
              : `${cashFlowProgress.runwayMonths}か月`}
            caution={cashFlowProgress.runwayMonths !== null && cashFlowProgress.runwayMonths < 3}
          />
        </div>

        {cashFlowActions.length > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="min-w-0 flex-1">
                <h3 className="font-bold">
                  月末までに最低{yen.format(cashFlowProgress.fundingGap)}の資金対策が必要です
                </h3>
                <p className="mt-1 text-sm">
                  上から順に実行し、対策後の金額を入力し直して不足が解消するか確認してください。
                </p>
                <ol className="mt-4 space-y-3">
                  {cashFlowActions.map((action, index) => (
                    <li key={action.title} className="flex gap-3 rounded-lg bg-white/70 p-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-200 text-xs font-bold">
                        {index + 1}
                      </span>
                      <div>
                        <p className="font-semibold">{action.title}</p>
                        <p className="mt-1 text-sm">{action.description}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        )}
        <button type="button" className="btn-primary" onClick={save} disabled={saving}>
          <Save className="h-4 w-4" />
          {saving ? '保存中…' : '売上計画を保存'}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="達成率" value={`${progress.achievementRate}%`} />
        <Metric label="目標までの不足額" value={yen.format(progress.shortfall)} caution={progress.shortfall > 0} />
        <Metric label="今月の残り日数" value={`${progress.daysRemaining}日`} />
        <Metric
          label="残り1日あたり必要売上"
          value={yen.format(progress.requiredRevenuePerDay)}
          caution={progress.requiredRevenuePerDay > 0}
        />
      </div>

      <div className="card space-y-4">
          <div>
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-sunboo-moss" />
              <h2 className="font-bold text-sunboo-ink">
                {draft.revenueModel === 'sales_funnel' ? '今週の商談実績' : '今週の店舗・顧客実績'}
              </h2>
            </div>
            <p className="mt-1 text-sm text-sunboo-ink-muted">
              毎週の目標と実績を記録し、月間売上との差を早めに修正します。
            </p>
          </div>

          {weeklySaved && (
            <div className="information-card information-card--success flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4" />週間実績を保存しました。
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="form-label" htmlFor="growth-week-start">週の開始日</label>
              <input
                id="growth-week-start"
                type="date"
                className="form-input"
                value={weekStart}
                onChange={(event) => changeWeek(event.target.value)}
              />
            </div>
            {draft.revenueModel === 'sales_funnel' ? (
              <>
                <DriverInput
                  label="今週の商談目標（件）"
                  value={weeklyDraft.targetMeetings}
                  onChange={(value) => setWeeklyDraft((previous) => ({ ...previous, targetMeetings: value }))}
                  placeholder="例：10"
                />
                <DriverInput
                  label="実際の商談数（件）"
                  value={weeklyDraft.actualMeetings}
                  onChange={(value) => setWeeklyDraft((previous) => ({ ...previous, actualMeetings: value }))}
                  placeholder="例：7"
                />
                <DriverInput
                  label="実際の成約数（件）"
                  value={weeklyDraft.actualDeals}
                  onChange={(value) => setWeeklyDraft((previous) => ({ ...previous, actualDeals: value }))}
                  placeholder="例：1"
                />
              </>
            ) : (
              <>
                <DriverInput
                  label="今週の顧客目標（人・社）"
                  value={weeklyDraft.targetCustomers}
                  onChange={(value) => setWeeklyDraft((previous) => ({ ...previous, targetCustomers: value }))}
                  placeholder="例：100"
                />
                <DriverInput
                  label="実際の顧客数（人・社）"
                  value={weeklyDraft.actualCustomers}
                  onChange={(value) => setWeeklyDraft((previous) => ({ ...previous, actualCustomers: value }))}
                  placeholder="例：80"
                />
                <DriverInput
                  label="実際の購入件数（件）"
                  value={weeklyDraft.actualPurchases}
                  onChange={(value) => setWeeklyDraft((previous) => ({ ...previous, actualPurchases: value }))}
                  placeholder="例：120"
                />
              </>
            )}
          </div>

          {draft.revenueModel === 'customer_repeat' && (
            <DriverInput
              label="今週の実売上（円）"
              value={weeklyDraft.actualRevenue}
              onChange={(value) => setWeeklyDraft((previous) => ({ ...previous, actualRevenue: value }))}
              placeholder="例：600,000"
            />
          )}

          {draft.revenueModel === 'sales_funnel' ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="実際の成約率" value={`${weeklyProgress.actualConversionRate}%`} />
              <Metric label="今週の商談不足" value={`${weeklyProgress.meetingGap}件`} caution={weeklyProgress.meetingGap > 0} />
              <Metric label="今週の成約不足" value={`${weeklyProgress.dealGap}件`} caution={weeklyProgress.dealGap > 0} />
              <Metric
                label="残り週あたり必要商談"
                value={`${weeklyProgress.requiredMeetingsPerWeek}件`}
                caution={weeklyProgress.requiredMeetingsPerWeek > 0}
              />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="実際の平均単価" value={yen.format(weeklyCustomerProgress.averageOrderValue)} />
              <Metric label="1顧客あたり購入回数" value={`${weeklyCustomerProgress.actualPurchaseFrequency}回`} />
              <Metric label="今週の顧客不足" value={`${weeklyCustomerProgress.customerGap}人・社`} caution={weeklyCustomerProgress.customerGap > 0} />
              <Metric
                label="残り週あたり必要顧客"
                value={`${weeklyCustomerProgress.requiredCustomersPerWeek}人・社`}
                caution={weeklyCustomerProgress.requiredCustomersPerWeek > 0}
              />
            </div>
          )}

          <div>
            <label className="form-label" htmlFor="growth-weekly-action-note">今週の振り返り・次の行動</label>
            <textarea
              id="growth-weekly-action-note"
              className="form-input min-h-20"
              maxLength={500}
              value={weeklyDraft.actionNote}
              onChange={(event) => setWeeklyDraft((previous) => ({ ...previous, actionNote: event.target.value }))}
              placeholder={draft.revenueModel === 'sales_funnel'
                ? '例：紹介依頼を5社へ送り、未回答案件へ木曜日までに再提案する'
                : '例：平日限定セットを告知し、来店数と平均単価を来週比較する'}
            />
          </div>

          <button type="button" className="btn-primary" onClick={saveWeeklyActivity} disabled={weeklySaving}>
            <Save className="h-4 w-4" />
            {weeklySaving ? '保存中…' : '週間実績を保存'}
          </button>
      </div>

      {progress.achievementRate >= 100 ? (
        <div className="information-card information-card--success flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          今月の売上目標を達成しています。利益と次月の再現性も確認しよう。
        </div>
      ) : (
        <InformationCard kind="info">
          数字だけでなく、商談数・提案数・客単価など、売上につながる行動を毎週確認しよう。
        </InformationCard>
      )}
    </div>
  );
}

function DriverInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label className="form-label">{label}</label>
      <FormattedIntegerInput
        value={value}
        onChange={(nextValue) => onChange(Math.max(0, nextValue ?? 0))}
        ariaLabel={label}
        placeholder={placeholder}
        zeroAsBlank
      />
    </div>
  );
}

function Metric({ label, value, caution = false }: { label: string; value: string; caution?: boolean }) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 text-xs font-semibold text-sunboo-ink-muted">
        {caution ? <AlertTriangle className="h-4 w-4 text-sunboo-morning-sun-dark" /> : <TrendingUp className="h-4 w-4 text-sunboo-moss" />}
        {label}
      </div>
      <p className={`mt-2 text-xl font-bold ${caution ? 'text-sunboo-morning-sun-dark' : 'text-sunboo-ink'}`}>{value}</p>
    </div>
  );
}
