import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateMonthlySalesProgress, currentYearMonth } from './monthlySalesProgress.ts';

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
