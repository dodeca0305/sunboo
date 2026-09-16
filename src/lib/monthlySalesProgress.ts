export type MonthlySalesEntry = {
  yearMonth: string;
  targetRevenue: number;
  actualRevenue: number;
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

export type MonthlySalesProgress = {
  achievementRate: number;
  shortfall: number;
  daysRemaining: number;
  requiredRevenuePerDay: number;
};

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
