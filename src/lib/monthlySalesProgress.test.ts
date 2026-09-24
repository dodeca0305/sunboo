import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMonthlySalesProgress,
  calculateMonthlyGrossProfit,
  calculateMonthlyOperatingProfit,
  calculateMonthlyCashFlow,
  buildCashFlowActions,
  calculateFundingSalesRecovery,
  calculateFundingWeeklyAction,
  calculateWeeklyCarryoverTarget,
  hasMeaningfulWeeklyActivity,
  calculateSalesDriverPlan,
  calculateWeeklyCustomerProgress,
  calculateWeeklySalesProgress,
  calculateWeeklyGoalSummary,
  calculateWeeklyDailyPace,
  calculateDailyCarryoverTarget,
  previousBusinessDate,
  isDateInWeek,
  businessDatesForWeek,
  calculateDailyWeekSummary,
  currentWeekStart,
  currentYearMonth,
  previousWeekStart,
  shiftYearMonth,
} from './monthlySalesProgress.ts';

test('日本時間の年月を返す', () => {
  assert.equal(currentYearMonth(new Date('2026-08-31T15:30:00Z')), '2026-09');
});

test('前月・翌月へ年をまたいで移動できる', () => {
  assert.equal(shiftYearMonth('2026-09', 1), '2026-10');
  assert.equal(shiftYearMonth('2026-12', 1), '2027-01');
  assert.equal(shiftYearMonth('2026-01', -1), '2025-12');
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
    linkedTaxPayments: 0,
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
    linkedTaxPayments: 0,
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
    linkedTaxPayments: 0,
  });
  assert.equal(progress.netCashFlow, 300_000);
  assert.equal(progress.monthlyCashBurn, 0);
  assert.equal(progress.runwayMonths, null);
});

test('ロードマップ連携分とその他の納税予定を合算する', () => {
  const progress = calculateMonthlyCashFlow({
    cashBalance: 3_000_000,
    expectedCashInflows: 2_000_000,
    expectedCashOutflows: 2_000_000,
    plannedTaxPayments: 100_000,
    linkedTaxPayments: 400_000,
  });
  assert.equal(progress.projectedClosingCash, 2_500_000);
  assert.equal(progress.netCashFlow, -500_000);
});

test('資金不足時に不足額と納税を含む具体的な対策を表示する', () => {
  const entry = {
    expectedCashInflows: 300_000,
    expectedCashOutflows: 900_000,
    plannedTaxPayments: 200_000,
    linkedTaxPayments: 100_000,
  };
  const progress = calculateMonthlyCashFlow({
    ...entry,
    cashBalance: 500_000,
  });
  const actions = buildCashFlowActions(entry, progress);

  assert.equal(progress.fundingGap, 400_000);
  assert.equal(actions.length, 4);
  assert.match(actions[0].description, /400,000円/);
  assert.match(actions[2].description, /300,000円/);
});

test('資金不足がなければ対策を表示しない', () => {
  const entry = {
    expectedCashInflows: 1_000_000,
    expectedCashOutflows: 500_000,
    plannedTaxPayments: 0,
    linkedTaxPayments: 0,
  };
  const progress = calculateMonthlyCashFlow({ ...entry, cashBalance: 500_000 });
  assert.deepEqual(buildCashFlowActions(entry, progress), []);
});

test('粗利率と平均契約単価から資金不足を埋める追加売上・成約数を計算する', () => {
  const recovery = calculateFundingSalesRecovery({
    actualRevenue: 2_000_000,
    actualCostOfSales: 1_200_000,
    revenueModel: 'sales_funnel',
    averageContractValue: 250_000,
    averageOrderValue: 0,
  }, {
    projectedClosingCash: -400_000,
    netCashFlow: -900_000,
    fundingGap: 400_000,
    monthlyCashBurn: 900_000,
    runwayMonths: 0.6,
  });

  assert.deepEqual(recovery, {
    requiredCashCollection: 400_000,
    grossProfitMargin: 40,
    requiredAdditionalRevenue: 1_000_000,
    requiredUnits: 4,
    unitLabel: '件の成約',
  });
});

test('粗利率を確認できない場合は追加売上と件数を断定しない', () => {
  const recovery = calculateFundingSalesRecovery({
    actualRevenue: 0,
    actualCostOfSales: 0,
    revenueModel: 'customer_repeat',
    averageContractValue: 0,
    averageOrderValue: 5_000,
  }, {
    projectedClosingCash: -100_000,
    netCashFlow: -100_000,
    fundingGap: 100_000,
    monthlyCashBurn: 100_000,
    runwayMonths: 0,
  });

  assert.equal(recovery.requiredCashCollection, 100_000);
  assert.equal(recovery.requiredAdditionalRevenue, null);
  assert.equal(recovery.requiredUnits, null);
  assert.equal(recovery.unitLabel, '件の購入');
});

test('必要成約数と成約率から週あたりの成約・商談目標を計算する', () => {
  assert.deepEqual(calculateFundingWeeklyAction({
    recovery: {
      requiredCashCollection: 400_000,
      grossProfitMargin: 40,
      requiredAdditionalRevenue: 1_000_000,
      requiredUnits: 4,
      unitLabel: '件の成約',
    },
    revenueModel: 'sales_funnel',
    conversionRate: 20,
    weeksRemaining: 2,
  }), {
    weeksRemaining: 2,
    requiredUnitsPerWeek: 2,
    requiredMeetingsPerWeek: 10,
    unitLabel: '成約',
  });
});

test('店舗型は必要購入数を週単位へ割り振る', () => {
  assert.deepEqual(calculateFundingWeeklyAction({
    recovery: {
      requiredCashCollection: 100_000,
      grossProfitMargin: 50,
      requiredAdditionalRevenue: 200_000,
      requiredUnits: 40,
      unitLabel: '件の購入',
    },
    revenueModel: 'customer_repeat',
    conversionRate: 0,
    weeksRemaining: 3,
  }), {
    weeksRemaining: 3,
    requiredUnitsPerWeek: 14,
    requiredMeetingsPerWeek: null,
    unitLabel: '購入',
  });
});

test('前週の開始日を年・月をまたいで取得できる', () => {
  assert.equal(previousWeekStart('2027-01-04'), '2026-12-28');
});

test('前週の商談未達分を翌週の通常目標へ上乗せする', () => {
  assert.deepEqual(calculateWeeklyCarryoverTarget({
    targetMeetings: 10,
    actualMeetings: 7,
    targetCustomers: 0,
    actualCustomers: 0,
  }, 'sales_funnel'), {
    baseTarget: 10,
    carriedShortfall: 3,
    nextTarget: 13,
    targetLabel: '商談',
  });
});

test('前週目標を達成した場合は翌週目標を増やさない', () => {
  assert.deepEqual(calculateWeeklyCarryoverTarget({
    targetMeetings: 0,
    actualMeetings: 0,
    targetCustomers: 100,
    actualCustomers: 110,
  }, 'customer_repeat'), {
    baseTarget: 100,
    carriedShortfall: 0,
    nextTarget: 100,
    targetLabel: '顧客',
  });
});

test('全項目が0の保存行は未入力として扱う', () => {
  assert.equal(hasMeaningfulWeeklyActivity({
    weekStart: '2026-09-28',
    targetMeetings: 0,
    actualMeetings: 0,
    actualDeals: 0,
    targetCustomers: 0,
    actualCustomers: 0,
    actualPurchases: 0,
    actualRevenue: 0,
    actionNote: '',
  }), false);
});

test('目標・実績・振り返りのいずれかがあれば入力済みとして扱う', () => {
  assert.equal(hasMeaningfulWeeklyActivity({
    weekStart: '2026-09-28',
    targetMeetings: 0,
    actualMeetings: 0,
    actualDeals: 0,
    targetCustomers: 0,
    actualCustomers: 0,
    actualPurchases: 0,
    actualRevenue: 0,
    actionNote: '来週再提案する',
  }), true);
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

test('今週の商談目標に対する残り件数と達成率を返す', () => {
  assert.deepEqual(calculateWeeklyGoalSummary({
    targetMeetings: 13,
    actualMeetings: 5,
    targetCustomers: 0,
    actualCustomers: 0,
  }, 'sales_funnel'), {
    target: 13,
    actual: 5,
    remaining: 8,
    achievementRate: 38.5,
    achieved: false,
    label: '商談',
    unit: '件',
  });
});

test('週間目標を超えた場合は残り0で目標達成にする', () => {
  assert.deepEqual(calculateWeeklyGoalSummary({
    targetMeetings: 0,
    actualMeetings: 0,
    targetCustomers: 100,
    actualCustomers: 120,
  }, 'customer_repeat'), {
    target: 100,
    actual: 120,
    remaining: 0,
    achievementRate: 120,
    achieved: true,
    label: '顧客',
    unit: '人・社',
  });
});

test('未来の週は月曜から金曜の5営業日で1日目標を計算する', () => {
  assert.deepEqual(calculateWeeklyDailyPace({
    weekStart: '2026-09-28',
    remaining: 13,
    now: new Date('2026-09-24T06:00:00Z'),
  }), {
    remainingBusinessDays: 5,
    requiredPerBusinessDay: 3,
    weekEnded: false,
  });
});

test('今週は今日を含む残り平日で1日目標を計算する', () => {
  assert.deepEqual(calculateWeeklyDailyPace({
    weekStart: '2026-09-21',
    remaining: 8,
    now: new Date('2026-09-24T06:00:00Z'),
  }), {
    remainingBusinessDays: 2,
    requiredPerBusinessDay: 4,
    weekEnded: false,
  });
});

test('終了した週は翌週繰越の対象として返す', () => {
  assert.deepEqual(calculateWeeklyDailyPace({
    weekStart: '2026-09-14',
    remaining: 3,
    now: new Date('2026-09-24T06:00:00Z'),
  }), {
    remainingBusinessDays: 0,
    requiredPerBusinessDay: 0,
    weekEnded: true,
  });
});

test('前営業日の未達分を今日の目標へ加算する', () => {
  assert.deepEqual(calculateDailyCarryoverTarget(3, {
    targetUnits: 3,
    actualUnits: 2,
  }), {
    baseTarget: 3,
    carriedShortfall: 1,
    target: 4,
  });
});

test('月曜日の前営業日は金曜日になる', () => {
  assert.equal(previousBusinessDate('2026-09-28'), '2026-09-25');
});

test('対象日が選択週の7日間に含まれるか判定する', () => {
  assert.equal(isDateInWeek('2026-09-28', '2026-09-28'), true);
  assert.equal(isDateInWeek('2026-10-04', '2026-09-28'), true);
  assert.equal(isDateInWeek('2026-10-05', '2026-09-28'), false);
});

test('選択週の月曜日から金曜日を返す', () => {
  assert.deepEqual(businessDatesForWeek('2026-09-21'), [
    '2026-09-21',
    '2026-09-22',
    '2026-09-23',
    '2026-09-24',
    '2026-09-25',
  ]);
});

test('保存済みの日次実績から週間合計を計算する', () => {
  assert.deepEqual(calculateDailyWeekSummary([
    { activityDate: '2026-09-24', targetUnits: 3, actualUnits: 2, actionPlan: '架電' },
    { activityDate: '2026-09-25', targetUnits: 5, actualUnits: 3, actionPlan: '提案' },
  ]), {
    target: 8,
    actual: 5,
    remaining: 3,
    achievementRate: 62.5,
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
