import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMonthlySalesProgress,
  calculateSalesDriverPlan,
  calculateWeeklySalesProgress,
  currentWeekStart,
  currentYearMonth,
} from './monthlySalesProgress.ts';

test('日本時間の年月を返す', () => {
  assert.equal(currentYearMonth(new Date('2026-08-31T15:30:00Z')), '2026-09');
});

test('達成率・不足額・残り1日あたり必要売上を計算する', () => {
  assert.deepEqual(calculateMonthlySalesProgress({
    yearMonth: '2026-09',
    targetRevenue: 3_000_000,
    actualRevenue: 1_500_000,
  }, new Date('2026-09-14T15:00:00Z')), {
    achievementRate: 50,
    shortfall: 1_500_000,
    daysRemaining: 16,
    requiredRevenuePerDay: 93_750,
  });
});

test('目標達成後の不足額と必要売上は0になる', () => {
  const progress = calculateMonthlySalesProgress({
    yearMonth: '2026-09',
    targetRevenue: 1_000_000,
    actualRevenue: 1_200_000,
  }, new Date('2026-09-10T00:00:00Z'));
  assert.equal(progress.achievementRate, 120);
  assert.equal(progress.shortfall, 0);
  assert.equal(progress.requiredRevenuePerDay, 0);
});

test('過去月は残り日数と必要売上を0にする', () => {
  const progress = calculateMonthlySalesProgress({
    yearMonth: '2026-08',
    targetRevenue: 1_000_000,
    actualRevenue: 500_000,
  }, new Date('2026-09-10T00:00:00Z'));
  assert.equal(progress.daysRemaining, 0);
  assert.equal(progress.requiredRevenuePerDay, 0);
});

test('商談モデルから見込売上と追加商談数を計算する', () => {
  assert.deepEqual(calculateSalesDriverPlan({
    targetRevenue: 3_000_000,
    revenueModel: 'sales_funnel',
    meetingCount: 10,
    conversionRate: 20,
    averageContractValue: 500_000,
    customerCount: 0,
    purchaseFrequency: 0,
    averageOrderValue: 0,
  }), {
    projectedRevenue: 1_000_000,
    projectedGap: 2_000_000,
    projectedDeals: 2,
    additionalDealsNeeded: 4,
    additionalMeetingsNeeded: 20,
    additionalCustomersNeeded: 0,
    hasEnoughInputs: true,
  });
});

test('顧客モデルから見込売上と追加顧客数を計算する', () => {
  const plan = calculateSalesDriverPlan({
    targetRevenue: 1_000_000,
    revenueModel: 'customer_repeat',
    meetingCount: 0,
    conversionRate: 0,
    averageContractValue: 0,
    customerCount: 100,
    purchaseFrequency: 2,
    averageOrderValue: 3_000,
  });
  assert.equal(plan.projectedRevenue, 600_000);
  assert.equal(plan.projectedGap, 400_000);
  assert.equal(plan.additionalCustomersNeeded, 67);
  assert.equal(plan.hasEnoughInputs, true);
});

test('売上要因の入力が不足している場合は追加件数を0にする', () => {
  const plan = calculateSalesDriverPlan({
    targetRevenue: 1_000_000,
    revenueModel: 'sales_funnel',
    meetingCount: 10,
    conversionRate: 0,
    averageContractValue: 500_000,
    customerCount: 0,
    purchaseFrequency: 0,
    averageOrderValue: 0,
  });
  assert.equal(plan.additionalMeetingsNeeded, 0);
  assert.equal(plan.hasEnoughInputs, false);
});

test('日本時間で月曜日を今週の開始日として返す', () => {
  assert.equal(currentWeekStart(new Date('2026-09-16T03:00:00Z')), '2026-09-14');
  assert.equal(currentWeekStart(new Date('2026-09-20T14:59:00Z')), '2026-09-14');
});

test('週間の実績差と残り週あたり必要商談数を計算する', () => {
  assert.deepEqual(calculateWeeklySalesProgress({
    activity: {
      weekStart: '2026-09-14',
      targetMeetings: 10,
      actualMeetings: 7,
      actualDeals: 1,
    },
    plannedConversionRate: 20,
    remainingMeetings: 20,
    monthEnd: '2026-09-30',
  }), {
    actualConversionRate: 14.3,
    meetingGap: 3,
    dealGap: 1,
    weeksRemaining: 3,
    requiredMeetingsPerWeek: 7,
  });
});
