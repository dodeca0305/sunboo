'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Save, Target } from 'lucide-react';
import FormattedIntegerInput from '@/components/FormattedIntegerInput';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import {
  calculateDailyExecutionStatus,
  currentWeekStart,
  type DailySalesActivity,
  type RevenueModel,
} from '@/lib/monthlySalesProgress';

export default function WorkspaceTodaySalesCard({
  companyId,
  activity,
  revenueModel,
}: {
  companyId: number;
  activity: DailySalesActivity | null;
  revenueModel: RevenueModel;
}) {
  const router = useRouter();
  const [actualUnits, setActualUnits] = useState<number | null>(activity?.actualUnits ?? null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = revenueModel === 'sales_funnel' ? '商談' : '顧客';
  const unit = revenueModel === 'sales_funnel' ? '件' : '人・社';

  if (!activity) {
    return (
      <section className="card border-sunboo-morning-sun bg-sunboo-warm-paper">
        <div className="flex items-start gap-3">
          <Target className="mt-0.5 h-5 w-5 shrink-0 text-sunboo-morning-sun-dark" />
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-sunboo-ink">今日の売上目標</h2>
            <p className="mt-1 text-sm text-sunboo-ink-muted">今日の実行計画はまだ作られていません。</p>
            <Link className="btn-primary mt-4 inline-flex" href={`/admin/workspaces/${companyId}/growth`}>
              売上目標を設定する
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const currentActivity = activity;
  const displayedActivity = { ...currentActivity, actualUnits: actualUnits ?? 0 };
  const status = calculateDailyExecutionStatus(displayedActivity);

  async function saveActualUnits() {
    const supabase = createBrowserSupabase();
    if (!supabase) {
      setError('Supabase が設定されていません。');
      return;
    }

    setSaving(true);
    setSaved(false);
    setError(null);
    const nextActual = actualUnits ?? 0;
    const { error: dailyError } = await supabase.from('workspace_daily_sales_activities').upsert({
      company_id: companyId,
      activity_date: currentActivity.activityDate,
      target_units: currentActivity.targetUnits,
      actual_units: nextActual,
      action_plan: currentActivity.actionPlan,
      outcome_review: currentActivity.outcomeReview,
    }, { onConflict: 'company_id,activity_date' });

    if (dailyError) {
      setSaving(false);
      setError(`今日の実績を保存できませんでした: ${dailyError.message}`);
      return;
    }

    const weekStart = currentWeekStart(new Date(`${currentActivity.activityDate}T12:00:00+09:00`));
    const weekEndDate = new Date(`${weekStart}T00:00:00Z`);
    weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);
    const weekEnd = weekEndDate.toISOString().slice(0, 10);
    const [{ data: dailyRows, error: dailyRowsError }, { data: weeklyRow, error: weeklyRowError }] = await Promise.all([
      supabase
        .from('workspace_daily_sales_activities')
        .select('actual_units')
        .eq('company_id', companyId)
        .gte('activity_date', weekStart)
        .lte('activity_date', weekEnd),
      supabase
        .from('workspace_weekly_sales_activities')
        .select('target_meetings,actual_meetings,actual_deals,target_customers,actual_customers,actual_purchases,actual_revenue,action_note')
        .eq('company_id', companyId)
        .eq('week_start', weekStart)
        .maybeSingle(),
    ]);

    if (dailyRowsError || weeklyRowError) {
      setSaving(false);
      setError('今日の実績は保存しましたが、週間実績を更新できませんでした。');
      router.refresh();
      return;
    }

    const weeklyActual = (dailyRows ?? []).reduce(
      (total, row) => total + Number((row as { actual_units: number | null }).actual_units ?? 0),
      0,
    );
    const current = (weeklyRow ?? {}) as Record<string, string | number | null>;
    const weeklyPayload = {
      company_id: companyId,
      week_start: weekStart,
      target_meetings: Number(current.target_meetings ?? 0),
      actual_meetings: revenueModel === 'sales_funnel' ? weeklyActual : Number(current.actual_meetings ?? 0),
      actual_deals: Number(current.actual_deals ?? 0),
      target_customers: Number(current.target_customers ?? 0),
      actual_customers: revenueModel === 'customer_repeat' ? weeklyActual : Number(current.actual_customers ?? 0),
      actual_purchases: Number(current.actual_purchases ?? 0),
      actual_revenue: Number(current.actual_revenue ?? 0),
      action_note: String(current.action_note ?? ''),
    };
    const { error: weeklySaveError } = await supabase
      .from('workspace_weekly_sales_activities')
      .upsert(weeklyPayload, { onConflict: 'company_id,week_start' });

    setSaving(false);
    if (weeklySaveError) {
      setError('今日の実績は保存しましたが、週間実績を更新できませんでした。');
      router.refresh();
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <section className={`card ${status.achieved
      ? 'border-sunboo-moss bg-sunboo-moss/5'
      : 'border-sunboo-morning-sun bg-sunboo-warm-paper'
    }`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          {status.achieved
            ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-sunboo-moss" />
            : <Target className="mt-0.5 h-5 w-5 shrink-0 text-sunboo-morning-sun-dark" />}
          <div>
            <p className="text-xs font-semibold text-sunboo-ink-muted">今日の売上目標</p>
            <h2 className="mt-1 text-lg font-bold text-sunboo-ink">
              {label}目標{status.target}{unit}・実績{status.actual}{unit}
            </h2>
          </div>
        </div>
        <p className={`text-xl font-bold ${status.achieved ? 'text-sunboo-moss' : 'text-sunboo-morning-sun-dark'}`}>
          {status.achieved ? '今日の目標達成' : `あと${status.remaining}${unit}`}
        </p>
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-sunboo-mist">
        <div
          className="h-full rounded-full bg-sunboo-moss"
          style={{ width: `${Math.min(status.achievementRate, 100)}%` }}
        />
      </div>
      <p className="mt-1 text-right text-xs font-semibold text-sunboo-ink-muted">達成率 {status.achievementRate}%</p>

      <div className="mt-4 border-t border-sunboo-mist pt-3">
        <p className="text-xs font-semibold text-sunboo-ink-muted">今日やる行動</p>
        <p className="mt-1 whitespace-pre-wrap text-sm font-semibold text-sunboo-ink">
          {currentActivity.actionPlan || 'まだ入力されていません。'}
        </p>
      </div>

      <div className="mt-4 border-t border-sunboo-mist pt-4">
        <p className="block text-xs font-semibold text-sunboo-ink-muted">
          今日の実績（{unit}）
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <FormattedIntegerInput
            value={actualUnits}
            onChange={setActualUnits}
            placeholder="0"
            ariaLabel={`今日の${label}実績`}
            className="w-32"
            zeroAsBlank
          />
          <button type="button" className="btn-primary inline-flex items-center gap-2" onClick={saveActualUnits} disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? '保存中…' : '実績を保存'}
          </button>
          <Link className="btn-secondary inline-flex" href={`/admin/workspaces/${companyId}/growth`}>
            売上目標の詳細
          </Link>
        </div>
        {saved && <p className="mt-2 text-sm font-semibold text-sunboo-moss">今日の実績を保存し、週間実績へ反映しました。</p>}
        {error && <p className="mt-2 text-sm font-semibold text-red-700">{error}</p>}
      </div>
    </section>
  );
}
