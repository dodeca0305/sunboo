export type MonthlySalesEntry = {
  yearMonth: string;
  targetRevenue: number;
  actualRevenue: number;
  actionGoal: string;
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
