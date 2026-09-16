'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Save, Target, TrendingUp } from 'lucide-react';
import FormattedIntegerInput from '@/components/FormattedIntegerInput';
import InformationCard from '@/components/InformationCard';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import {
  calculateMonthlySalesProgress,
  calculateSalesDriverPlan,
  currentYearMonth,
  type MonthlySalesEntry,
} from '@/lib/monthlySalesProgress';

const yen = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 });

function emptyEntry(yearMonth: string): MonthlySalesEntry {
  return {
    yearMonth,
    targetRevenue: 0,
    actualRevenue: 0,
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
}: {
  companyId: number;
  initialEntries: MonthlySalesEntry[];
}) {
  const initialMap = Object.fromEntries(initialEntries.map((entry) => [entry.yearMonth, entry]));
  const [entries, setEntries] = useState<Record<string, MonthlySalesEntry>>(initialMap);
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const selected = entries[yearMonth] ?? emptyEntry(yearMonth);
  const [draft, setDraft] = useState<MonthlySalesEntry>(selected);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const progress = useMemo(() => calculateMonthlySalesProgress(draft), [draft]);
  const driverPlan = useMemo(() => calculateSalesDriverPlan(draft), [draft]);

  function changeMonth(nextMonth: string) {
    if (!/^\d{4}-\d{2}$/.test(nextMonth)) return;
    setYearMonth(nextMonth);
    setDraft(entries[nextMonth] ?? emptyEntry(nextMonth));
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

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="form-label" htmlFor="growth-year-month">対象月</label>
            <input
              id="growth-year-month"
              type="month"
              className="form-input"
              value={yearMonth}
              onChange={(event) => changeMonth(event.target.value)}
            />
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
