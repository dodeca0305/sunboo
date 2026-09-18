export type MonthlySalesEntry = {
  yearMonth: string;
  targetRevenue: number;
  actualRevenue: number;
  targetGrossProfit: number;
  actualCostOfSales: number;
  targetOperatingProfit: number;
  actualFixedCosts: number;
  cashBalance: number;
  expectedCashInflows: number;
  expectedCashOutflows: number;
  plannedTaxPayments: number;
  linkedTaxPayments: number;
  actionGoal: string;
  revenueModel: RevenueModel;
  meetingCount: number;
  conversionRate: number;
  averageContractValue: number;
  customerCount: number;
  purchaseFrequency: number;
  averageOrderValue: number;
};

export type RevenueModel = 'sales_funnel' | 'customer_repeat';

export type SalesDriverPlan = {
  projectedRevenue: number;
  projectedGap: number;
  projectedDeals: number;
  additionalDealsNeeded: number;
  additionalMeetingsNeeded: number;
  additionalCustomersNeeded: number;
  hasEnoughInputs: boolean;
};

export type WeeklySalesActivity = {
  weekStart: string;
  targetMeetings: number;
  actualMeetings: number;
  actualDeals: number;
  targetCustomers: number;
  actualCustomers: number;
  actualPurchases: number;
  actualRevenue: number;
  actionNote: string;
};

export type WeeklySalesProgress = {
  actualConversionRate: number;
  meetingGap: number;
  dealGap: number;
  weeksRemaining: number;
  requiredMeetingsPerWeek: number;
};

export type WeeklyCustomerProgress = {
  averageOrderValue: number;
  actualPurchaseFrequency: number;
  customerGap: number;
  requiredCustomersPerWeek: number;
};

export type MonthlySalesProgress = {
  achievementRate: number;
  shortfall: number;
  daysRemaining: number;
  requiredRevenuePerDay: number;
};

export type MonthlyGrossProfitProgress = {
  actualGrossProfit: number;
  grossProfitMargin: number;
  grossProfitShortfall: number;
  grossProfitAchievementRate: number;
};

export type MonthlyOperatingProfitProgress = {
  actualOperatingProfit: number;
  operatingProfitShortfall: number;
  breakEvenRevenue: number | null;
  requiredRevenueForTargetProfit: number | null;
};

export type MonthlyCashFlowProgress = {
  projectedClosingCash: number;
  netCashFlow: number;
  fundingGap: number;
  monthlyCashBurn: number;
  runwayMonths: number | null;
};

export type CashFlowAction = {
  title: string;
  description: string;
};

export type FundingSalesRecovery = {
  requiredCashCollection: number;
  grossProfitMargin: number | null;
  requiredAdditionalRevenue: number | null;
  requiredUnits: number | null;
  unitLabel: '件の成約' | '件の購入';
};

export type FundingWeeklyAction = {
  weeksRemaining: number;
  requiredUnitsPerWeek: number | null;
  requiredMeetingsPerWeek: number | null;
  unitLabel: '成約' | '購入';
};

export function calculateMonthlyGrossProfit(
  entry: Pick<MonthlySalesEntry,
    'targetGrossProfit' | 'actualRevenue' | 'actualCostOfSales'
  >,
): MonthlyGrossProfitProgress {
  const targetGrossProfit = Math.max(0, entry.targetGrossProfit);
  const actualRevenue = Math.max(0, entry.actualRevenue);
  const actualCostOfSales = Math.max(0, entry.actualCostOfSales);
  const actualGrossProfit = actualRevenue - actualCostOfSales;

  return {
    actualGrossProfit,
    grossProfitMargin: actualRevenue > 0
      ? Math.round((actualGrossProfit / actualRevenue) * 1000) / 10
      : 0,
    grossProfitShortfall: Math.max(targetGrossProfit - actualGrossProfit, 0),
    grossProfitAchievementRate: targetGrossProfit > 0
      ? Math.round((actualGrossProfit / targetGrossProfit) * 1000) / 10
      : 0,
  };
}

export function calculateMonthlyOperatingProfit(
  entry: Pick<MonthlySalesEntry,
    | 'actualRevenue'
    | 'actualCostOfSales'
    | 'actualFixedCosts'
    | 'targetOperatingProfit'
  >,
): MonthlyOperatingProfitProgress {
  const actualRevenue = Math.max(0, entry.actualRevenue);
  const actualCostOfSales = Math.max(0, entry.actualCostOfSales);
  const actualFixedCosts = Math.max(0, entry.actualFixedCosts);
  const targetOperatingProfit = Math.max(0, entry.targetOperatingProfit);
  const actualGrossProfit = actualRevenue - actualCostOfSales;
  const actualOperatingProfit = actualGrossProfit - actualFixedCosts;
  const grossProfitRate = actualRevenue > 0 ? actualGrossProfit / actualRevenue : 0;

  return {
    actualOperatingProfit,
    operatingProfitShortfall: Math.max(targetOperatingProfit - actualOperatingProfit, 0),
    breakEvenRevenue: grossProfitRate > 0
      ? Math.ceil(actualFixedCosts / grossProfitRate)
      : null,
    requiredRevenueForTargetProfit: grossProfitRate > 0
      ? Math.ceil((actualFixedCosts + targetOperatingProfit) / grossProfitRate)
      : null,
  };
}

export function calculateMonthlyCashFlow(
  entry: Pick<MonthlySalesEntry,
    | 'cashBalance'
    | 'expectedCashInflows'
    | 'expectedCashOutflows'
    | 'plannedTaxPayments'
    | 'linkedTaxPayments'
  >,
): MonthlyCashFlowProgress {
  const cashBalance = Math.max(0, entry.cashBalance);
  const expectedCashInflows = Math.max(0, entry.expectedCashInflows);
  const expectedCashOutflows = Math.max(0, entry.expectedCashOutflows);
  const plannedTaxPayments = Math.max(0, entry.plannedTaxPayments);
  const linkedTaxPayments = Math.max(0, entry.linkedTaxPayments);
  const totalOutflows = expectedCashOutflows + plannedTaxPayments + linkedTaxPayments;
  const netCashFlow = expectedCashInflows - totalOutflows;
  const projectedClosingCash = cashBalance + netCashFlow;
  const monthlyCashBurn = Math.max(totalOutflows - expectedCashInflows, 0);

  return {
    projectedClosingCash,
    netCashFlow,
    fundingGap: Math.max(-projectedClosingCash, 0),
    monthlyCashBurn,
    runwayMonths: monthlyCashBurn > 0
      ? Math.round((cashBalance / monthlyCashBurn) * 10) / 10
      : null,
  };
}

export function buildCashFlowActions(
  entry: Pick<MonthlySalesEntry,
    | 'expectedCashInflows'
    | 'expectedCashOutflows'
    | 'plannedTaxPayments'
    | 'linkedTaxPayments'
  >,
  progress: MonthlyCashFlowProgress,
): CashFlowAction[] {
  if (progress.fundingGap <= 0) return [];

  const actions: CashFlowAction[] = [
    {
      title: '入金予定を前倒しできないか確認',
      description: `請求済み・未回収の売掛金を確認し、月末までに最低${progress.fundingGap.toLocaleString('ja-JP')}円の資金確保を目指します。`,
    },
    {
      title: '支出の延期・分割を検討',
      description: `今月の支出予定${Math.max(0, entry.expectedCashOutflows).toLocaleString('ja-JP')}円から、翌月へ延期できる支払いと分割交渉できる支払いを確認します。`,
    },
  ];

  const taxPayments = Math.max(0, entry.plannedTaxPayments) + Math.max(0, entry.linkedTaxPayments);
  if (taxPayments > 0) {
    actions.push({
      title: '納税資金の相談を早めに開始',
      description: `今月の納税予定${taxPayments.toLocaleString('ja-JP')}円を確認し、期限内納付が難しい場合は税務署・自治体へ猶予や分納の可否を事前相談します。`,
    });
  }

  actions.push({
    title: '不足が残る場合は資金調達を相談',
    description: `対策後も不足する金額を再計算し、金融機関への短期融資や当座貸越の相談資料を準備します。現在の不足見込は${progress.fundingGap.toLocaleString('ja-JP')}円です。`,
  });

  return actions;
}

export function calculateFundingSalesRecovery(
  entry: Pick<MonthlySalesEntry,
    | 'actualRevenue'
    | 'actualCostOfSales'
    | 'revenueModel'
    | 'averageContractValue'
    | 'averageOrderValue'
  >,
  progress: MonthlyCashFlowProgress,
): FundingSalesRecovery {
  const requiredCashCollection = Math.max(0, progress.fundingGap);
  const actualRevenue = Math.max(0, entry.actualRevenue);
  const actualCostOfSales = Math.max(0, entry.actualCostOfSales);
  const grossProfit = actualRevenue - actualCostOfSales;
  const grossProfitMargin = actualRevenue > 0 && grossProfit > 0
    ? grossProfit / actualRevenue
    : null;
  const requiredAdditionalRevenue = grossProfitMargin === null
    ? null
    : Math.ceil(requiredCashCollection / grossProfitMargin);
  const unitValue = entry.revenueModel === 'sales_funnel'
    ? Math.max(0, entry.averageContractValue)
    : Math.max(0, entry.averageOrderValue);

  return {
    requiredCashCollection,
    grossProfitMargin: grossProfitMargin === null
      ? null
      : Math.round(grossProfitMargin * 1000) / 10,
    requiredAdditionalRevenue,
    requiredUnits: requiredAdditionalRevenue !== null && unitValue > 0
      ? Math.ceil(requiredAdditionalRevenue / unitValue)
      : null,
    unitLabel: entry.revenueModel === 'sales_funnel' ? '件の成約' : '件の購入',
  };
}

export function calculateFundingWeeklyAction({
  recovery,
  revenueModel,
  conversionRate,
  weeksRemaining,
}: {
  recovery: FundingSalesRecovery;
  revenueModel: RevenueModel;
  conversionRate: number;
  weeksRemaining: number;
}): FundingWeeklyAction {
  const safeWeeks = Math.max(1, Math.floor(weeksRemaining));
  const requiredUnits = recovery.requiredUnits;
  const requiredUnitsPerWeek = requiredUnits === null
    ? null
    : Math.ceil(requiredUnits / safeWeeks);
  const safeConversionRate = Math.min(100, Math.max(0, conversionRate));
  const totalMeetings = revenueModel === 'sales_funnel'
    && requiredUnits !== null
    && safeConversionRate > 0
    ? Math.ceil(requiredUnits / (safeConversionRate / 100))
    : null;

  return {
    weeksRemaining: safeWeeks,
    requiredUnitsPerWeek,
    requiredMeetingsPerWeek: totalMeetings === null
      ? null
      : Math.ceil(totalMeetings / safeWeeks),
    unitLabel: revenueModel === 'sales_funnel' ? '成約' : '購入',
  };
}

export function currentYearMonth(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  if (!year || !month) throw new Error('現在の年月を取得できません。');
  return `${year}-${month}`;
}

export function shiftYearMonth(yearMonth: string, offset: number): string {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!match) throw new Error('対象月が不正です。');
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12 || !Number.isInteger(offset)) {
    throw new Error('対象月が不正です。');
  }
  const shifted = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function calculateMonthlySalesProgress(
  entry: Pick<MonthlySalesEntry, 'yearMonth' | 'targetRevenue' | 'actualRevenue'>,
  today = new Date(),
): MonthlySalesProgress {
  const [year, month] = entry.yearMonth.split('-').map(Number);
  if (!year || !month || month < 1 || month > 12) {
    throw new Error('対象月が不正です。');
  }

  const targetRevenue = Math.max(0, entry.targetRevenue);
  const actualRevenue = Math.max(0, entry.actualRevenue);
  const shortfall = Math.max(targetRevenue - actualRevenue, 0);
  const achievementRate = targetRevenue === 0
    ? 0
    : Math.round((actualRevenue / targetRevenue) * 1000) / 10;

  const todayYearMonth = currentYearMonth(today);
  let daysRemaining = 0;
  if (entry.yearMonth > todayYearMonth) {
    daysRemaining = new Date(Date.UTC(year, month, 0)).getUTCDate();
  } else if (entry.yearMonth === todayYearMonth) {
    const dayInJapan = Number(new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo',
      day: '2-digit',
    }).format(today));
    daysRemaining = new Date(Date.UTC(year, month, 0)).getUTCDate() - dayInJapan + 1;
  }

  return {
    achievementRate,
    shortfall,
    daysRemaining,
    requiredRevenuePerDay: shortfall > 0 && daysRemaining > 0
      ? Math.ceil(shortfall / daysRemaining)
      : 0,
  };
}

export function calculateSalesDriverPlan(
  entry: Pick<MonthlySalesEntry,
    | 'targetRevenue'
    | 'revenueModel'
    | 'meetingCount'
    | 'conversionRate'
    | 'averageContractValue'
    | 'customerCount'
    | 'purchaseFrequency'
    | 'averageOrderValue'
  >,
): SalesDriverPlan {
  const targetRevenue = Math.max(0, entry.targetRevenue);

  if (entry.revenueModel === 'sales_funnel') {
    const meetings = Math.max(0, entry.meetingCount);
    const rate = Math.min(100, Math.max(0, entry.conversionRate));
    const averageValue = Math.max(0, entry.averageContractValue);
    const projectedDeals = meetings * (rate / 100);
    const projectedRevenue = Math.round(projectedDeals * averageValue);
    const projectedGap = Math.max(targetRevenue - projectedRevenue, 0);
    const revenuePerMeeting = (rate / 100) * averageValue;

    return {
      projectedRevenue,
      projectedGap,
      projectedDeals: Math.round(projectedDeals * 10) / 10,
      additionalDealsNeeded: averageValue > 0 ? Math.ceil(projectedGap / averageValue) : 0,
      additionalMeetingsNeeded: revenuePerMeeting > 0 ? Math.ceil(projectedGap / revenuePerMeeting) : 0,
      additionalCustomersNeeded: 0,
      hasEnoughInputs: meetings > 0 && rate > 0 && averageValue > 0,
    };
  }

  const customers = Math.max(0, entry.customerCount);
  const frequency = Math.max(0, entry.purchaseFrequency);
  const averageValue = Math.max(0, entry.averageOrderValue);
  const revenuePerCustomer = frequency * averageValue;
  const projectedRevenue = Math.round(customers * revenuePerCustomer);
  const projectedGap = Math.max(targetRevenue - projectedRevenue, 0);

  return {
    projectedRevenue,
    projectedGap,
    projectedDeals: 0,
    additionalDealsNeeded: 0,
    additionalMeetingsNeeded: 0,
    additionalCustomersNeeded: revenuePerCustomer > 0 ? Math.ceil(projectedGap / revenuePerCustomer) : 0,
    hasEnoughInputs: customers > 0 && frequency > 0 && averageValue > 0,
  };
}

export function currentWeekStart(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(values.weekday);
  if (!values.year || !values.month || !values.day || weekdayIndex < 0) {
    throw new Error('今週の開始日を取得できません。');
  }
  const date = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
  const daysFromMonday = weekdayIndex === 0 ? 6 : weekdayIndex - 1;
  date.setUTCDate(date.getUTCDate() - daysFromMonday);
  return date.toISOString().slice(0, 10);
}

export function calculateWeeklySalesProgress({
  activity,
  plannedConversionRate,
  remainingMeetings,
  monthEnd,
}: {
  activity: Pick<WeeklySalesActivity, 'weekStart' | 'targetMeetings' | 'actualMeetings' | 'actualDeals'>;
  plannedConversionRate: number;
  remainingMeetings: number;
  monthEnd: string;
}): WeeklySalesProgress {
  const actualMeetings = Math.max(0, activity.actualMeetings);
  const actualDeals = Math.max(0, activity.actualDeals);
  const targetMeetings = Math.max(0, activity.targetMeetings);
  const expectedDeals = Math.ceil(targetMeetings * Math.min(100, Math.max(0, plannedConversionRate)) / 100);
  const actualConversionRate = actualMeetings === 0
    ? 0
    : Math.round((actualDeals / actualMeetings) * 1000) / 10;
  const start = new Date(`${activity.weekStart}T00:00:00Z`);
  const end = new Date(`${monthEnd}T00:00:00Z`);
  const days = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1);
  const weeksRemaining = Math.max(1, Math.ceil(days / 7));

  return {
    actualConversionRate,
    meetingGap: Math.max(targetMeetings - actualMeetings, 0),
    dealGap: Math.max(expectedDeals - actualDeals, 0),
    weeksRemaining,
    requiredMeetingsPerWeek: Math.max(0, remainingMeetings) > 0
      ? Math.ceil(Math.max(0, remainingMeetings) / weeksRemaining)
      : 0,
  };
}

export function calculateWeeklyCustomerProgress({
  activity,
  remainingCustomers,
  monthEnd,
}: {
  activity: Pick<WeeklySalesActivity,
    'weekStart' | 'targetCustomers' | 'actualCustomers' | 'actualPurchases' | 'actualRevenue'
  >;
  remainingCustomers: number;
  monthEnd: string;
}): WeeklyCustomerProgress {
  const targetCustomers = Math.max(0, activity.targetCustomers);
  const actualCustomers = Math.max(0, activity.actualCustomers);
  const actualPurchases = Math.max(0, activity.actualPurchases);
  const actualRevenue = Math.max(0, activity.actualRevenue);
  const start = new Date(`${activity.weekStart}T00:00:00Z`);
  const end = new Date(`${monthEnd}T00:00:00Z`);
  const days = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1);
  const weeksRemaining = Math.max(1, Math.ceil(days / 7));

  return {
    averageOrderValue: actualPurchases > 0 ? Math.round(actualRevenue / actualPurchases) : 0,
    actualPurchaseFrequency: actualCustomers > 0
      ? Math.round((actualPurchases / actualCustomers) * 10) / 10
      : 0,
    customerGap: Math.max(targetCustomers - actualCustomers, 0),
    requiredCustomersPerWeek: Math.max(0, remainingCustomers) > 0
      ? Math.ceil(Math.max(0, remainingCustomers) / weeksRemaining)
      : 0,
  };
}
