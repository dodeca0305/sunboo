import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMonthlySalesProgress,
  calculateMonthlyGrossProfit,
  calculateMonthlyOperatingProfit,
  calculateMonthlyCashFlow,
  calculateSalesDriverPlan,
  calculateWeeklyCustomerProgress,
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

test('月間の実績粗利益・粗利率・不足額を計算する', () => {
  assert.deepEqual(calculateMonthlyGrossProfit({
    targetGrossProfit: 1_200_000,
    actualRevenue: 2_000_000,
    actualCostOfSales: 1_000_000,
  }), {
    actualGrossProfit: 1_000_000,
    grossProfitMargin: 50,
    grossProfitShortfall: 200_000,
    grossProfitAchievementRate: 83.3,
  });
});

test('売上原価が売上を超えた場合は粗利益を赤字として計算する', () => {
  const progress = calculateMonthlyGrossProfit({
    targetGrossProfit: 500_000,
    actualRevenue: 800_000,
    actualCostOfSales: 1_000_000,
  });
  assert.equal(progress.actualGrossProfit, -200_000);
  assert.equal(progress.grossProfitMargin, -25);
  assert.equal(progress.grossProfitShortfall, 700_000);
  assert.equal(progress.grossProfitAchievementRate, -40);
});

test('固定費から営業利益・損益分岐点・目標利益に必要な売上を計算する', () => {
  assert.deepEqual(calculateMonthlyOperatingProfit({
    actualRevenue: 2_000_000,
    actualCostOfSales: 1_000_000,
    actualFixedCosts: 700_000,
    targetOperatingProfit: 500_000,
  }), {
    actualOperatingProfit: 300_000,
    operatingProfitShortfall: 200_000,
    breakEvenRevenue: 1_400_000,
    requiredRevenueForTargetProfit: 2_400_000,
  });
});

test('粗利益率が0以下なら損益分岐点を算出しない', () => {
  assert.deepEqual(calculateMonthlyOperatingProfit({
    actualRevenue: 800_000,
    actualCostOfSales: 1_000_000,
    actualFixedCosts: 300_000,
    targetOperatingProfit: 100_000,
  }), {
    actualOperatingProfit: -500_000,
    operatingProfitShortfall: 600_000,
    breakEvenRevenue: null,
    requiredRevenueForTargetProfit: null,
  });
});

test('月末預金残高・資金不足・資金余力を計算する', () => {
  assert.deepEqual(calculateMonthlyCashFlow({
    cashBalance: 3_000_000,
    expectedCashInflows: 2_000_000,
    expectedCashOutflows: 2_500_000,
    plannedTaxPayments: 500_000,
  }), {
    projectedClosingCash: 2_000_000,
    netCashFlow: -1_000_000,
    fundingGap: 0,
    monthlyCashBurn: 1_000_000,
    runwayMonths: 3,
  });
});

test('月末に資金が不足する場合は不足額を表示する', () => {
  const progress = calculateMonthlyCashFlow({
    cashBalance: 500_000,
    expectedCashInflows: 300_000,
    expectedCashOutflows: 900_000,
    plannedTaxPayments: 200_000,
  });
  assert.equal(progress.projectedClosingCash, -300_000);
  assert.equal(progress.fundingGap, 300_000);
  assert.equal(progress.monthlyCashBurn, 800_000);
  assert.equal(progress.runwayMonths, 0.6);
});

test('入金が支出以上なら資金余力月数を有限値で誤表示しない', () => {
  const progress = calculateMonthlyCashFlow({
    cashBalance: 1_000_000,
    expectedCashInflows: 1_500_000,
    expectedCashOutflows: 1_000_000,
    plannedTaxPayments: 200_000,
  });
  assert.equal(progress.netCashFlow, 300_000);
  assert.equal(progress.monthlyCashBurn, 0);
  assert.equal(progress.runwayMonths, null);
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

test('店舗型の週間実績から平均単価と顧客不足を計算する', () => {
  assert.deepEqual(calculateWeeklyCustomerProgress({
    activity: {
      weekStart: '2026-09-14',
      targetCustomers: 100,
      actualCustomers: 80,
      actualPurchases: 120,
      actualRevenue: 600_000,
    },
    remainingCustomers: 90,
    monthEnd: '2026-09-30',
  }), {
    averageOrderValue: 5_000,
    actualPurchaseFrequency: 1.5,
    customerGap: 20,
    requiredCustomersPerWeek: 30,
  });
});
