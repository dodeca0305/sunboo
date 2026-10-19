import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkspaceGrowthNotifications } from './workspaceGrowthNotifications.ts';
import { emptyMonthlySalesEntry, type MonthlySalesEntry } from './monthlySalesProgress.ts';

function entry(overrides: Partial<MonthlySalesEntry> = {}): MonthlySalesEntry {
  return {
    yearMonth: '2026-10',
    targetRevenue: 1_000_000,
    actualRevenue: 1_000_000,
    targetGrossProfit: 0,
    actualCostOfSales: 0,
    targetOperatingProfit: 0,
    actualFixedCosts: 0,
    cashBalance: 1_000_000,
    expectedCashInflows: 0,
    expectedCashOutflows: 0,
    plannedTaxPayments: 0,
    linkedTaxPayments: 0,
    actionGoal: '',
    revenueModel: 'sales_funnel',
    meetingCount: 0,
    conversionRate: 0,
    averageContractValue: 0,
    customerCount: 0,
    purchaseFrequency: 0,
    averageOrderValue: 0,
    ...overrides,
  };
}

test('データが無い場合（null）は何も通知しない', () => {
  assert.deepEqual(buildWorkspaceGrowthNotifications(null), []);
});

test('monthlyDataFetchFailed=trueの場合、entryがnullでも取得できない旨を1件だけ通知する（警告無し=問題なしと誤認させない）', () => {
  const notifications = buildWorkspaceGrowthNotifications(null, { monthlyDataFetchFailed: true });
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].category, 'sales');
  assert.equal(notifications[0].severity, 'medium');
  assert.equal(notifications[0].message, '売上・資金繰りデータを取得できません。時間をおいて再度お試しください。');
});

test('monthlyDataFetchFailed=trueの場合、entryが取得できていても個別の売上未達・資金不足判定は行わず取得失敗の通知のみ返す', () => {
  const notifications = buildWorkspaceGrowthNotifications(
    entry({ targetRevenue: 1_000_000, actualRevenue: 0, cashBalance: 0, expectedCashOutflows: 100_000 }),
    { monthlyDataFetchFailed: true },
  );
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].id, 'sales:fetch-failed');
});

test('monthlyDataFetchFailed=trueはcashFlowDataAvailable=falseより優先される（両方failed相当の状況で通知が重複しない）', () => {
  const notifications = buildWorkspaceGrowthNotifications(
    entry(),
    { monthlyDataFetchFailed: true, cashFlowDataAvailable: false },
  );
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].id, 'sales:fetch-failed');
});

test('目標達成・資金不足なしの場合は何も通知しない', () => {
  const notifications = buildWorkspaceGrowthNotifications(
    entry(),
    { today: new Date('2026-10-15T00:00:00Z') },
  );
  assert.deepEqual(notifications, []);
});

test('月末まで残り日数が少ない売上未達は優先度highで通知する', () => {
  const notifications = buildWorkspaceGrowthNotifications(
    entry({ targetRevenue: 1_000_000, actualRevenue: 400_000 }),
    { today: new Date('2026-10-28T00:00:00Z') }, // 10月は31日、あと4日
  );
  const sales = notifications.find((n) => n.category === 'sales');
  assert.ok(sales);
  assert.equal(sales.severity, 'high');
  assert.match(sales.message, /¥600,000不足/);
  assert.match(sales.message, /あと4日/);
});

test('月末まで十分な日数が残る売上未達は優先度mediumで通知する', () => {
  const notifications = buildWorkspaceGrowthNotifications(
    entry({ targetRevenue: 1_000_000, actualRevenue: 400_000 }),
    { today: new Date('2026-10-05T00:00:00Z') }, // あと26日
  );
  const sales = notifications.find((n) => n.category === 'sales');
  assert.ok(sales);
  assert.equal(sales.severity, 'medium');
});

test('資金不足がある場合はhighで通知し、見込み表現（確定期限を断定しない）で不足額を伝える', () => {
  const notifications = buildWorkspaceGrowthNotifications(
    entry({
      cashBalance: 100_000,
      expectedCashInflows: 0,
      expectedCashOutflows: 200_000,
      plannedTaxPayments: 50_000,
    }),
    { today: new Date('2026-10-05T00:00:00Z') },
  );
  const cash = notifications.find((n) => n.category === 'cash');
  assert.ok(cash);
  assert.equal(cash.severity, 'high');
  assert.match(cash.message, /¥150,000/);
  assert.match(cash.message, /見込み/);
  assert.match(cash.message, /入出金の予定日を確認/);
  // 月末を資金対策の確定期限として断定する表現（「までに」「必要です」の組み合わせ）を含まない
  assert.doesNotMatch(cash.message, /までに.*(必要|対策が必要)です/);
});

test('売上未達・資金不足が両方ある場合は2件返す', () => {
  const notifications = buildWorkspaceGrowthNotifications(
    entry({
      targetRevenue: 1_000_000,
      actualRevenue: 0,
      cashBalance: 0,
      expectedCashOutflows: 100_000,
    }),
    { today: new Date('2026-10-05T00:00:00Z') },
  );
  assert.equal(notifications.length, 2);
  assert.deepEqual(notifications.map((n) => n.category).sort(), ['cash', 'sales']);
});

test('cashFlowDataAvailable=falseの場合、資金不足額を断定せず確認できない旨を通知する', () => {
  const notifications = buildWorkspaceGrowthNotifications(
    entry({
      cashBalance: 100_000,
      expectedCashInflows: 0,
      expectedCashOutflows: 200_000,
      plannedTaxPayments: 50_000,
    }),
    { today: new Date('2026-10-05T00:00:00Z'), cashFlowDataAvailable: false },
  );
  const cash = notifications.find((n) => n.category === 'cash');
  assert.ok(cash);
  assert.equal(cash.severity, 'medium');
  assert.equal(cash.message, '資金繰りデータを確認できません。入出金の予定日を確認してください。');
  // 金額を一切含まない（断定しない）
  assert.doesNotMatch(cash.message, /¥/);
});

test('cashFlowDataAvailable=falseでも売上未達の通知は維持される', () => {
  const notifications = buildWorkspaceGrowthNotifications(
    entry({ targetRevenue: 1_000_000, actualRevenue: 400_000 }),
    { today: new Date('2026-10-05T00:00:00Z'), cashFlowDataAvailable: false },
  );
  const sales = notifications.find((n) => n.category === 'sales');
  assert.ok(sales);
  assert.match(sales.message, /¥600,000不足/);
});

test('資金に余裕があってもcashFlowDataAvailable=falseなら確認できない旨を通知する（断定を避ける）', () => {
  const notifications = buildWorkspaceGrowthNotifications(
    entry({ cashBalance: 10_000_000 }),
    { today: new Date('2026-10-05T00:00:00Z'), cashFlowDataAvailable: false },
  );
  const cash = notifications.find((n) => n.category === 'cash');
  assert.ok(cash, '残高に余裕があっても、納税予定が不明な以上「問題なし」と断定しない');
});

// 【レビュー対応】会社ID17・2026年10月の実例: workspace_monthly_salesが未登録
// （月間売上目標・実績・預金残高・入出金予定がすべて空欄）だが、年間ロードマップ連携の
// 納税予定が¥500,000あった。修正前はentry===nullとなりホームが何も通知しなかったが、
// growth詳細画面は同じ納税予定から資金不足¥500,000を算出・表示しており、画面間で
// 表示が食い違っていた。

test('monthlyDataRegistered=false・既知の納税予定ありの場合、資金不足額を断定せず納税予定額と入力案内を通知する', () => {
  const notifications = buildWorkspaceGrowthNotifications(
    emptyMonthlySalesEntry('2026-10', 500_000),
    { today: new Date('2026-10-05T00:00:00Z'), monthlyDataRegistered: false },
  );
  const cash = notifications.find((n) => n.category === 'cash');
  assert.ok(cash, '未登録でも連携納税予定を無視せず通知する');
  assert.equal(cash.severity, 'medium');
  assert.equal(cash.message, '納税予定¥500,000あり。預金残高・入出金予定を入力して資金繰りを確認してください。');
  // fundingGapを計算した場合の「不足する見込みです」という断定表現は含まない
  assert.doesNotMatch(cash.message, /不足する見込み/);
});

test('monthlyDataRegistered=false・納税予定も0円の場合は何も通知しない（判断材料が無い月まで毎回案内しない）', () => {
  const notifications = buildWorkspaceGrowthNotifications(
    emptyMonthlySalesEntry('2026-10', 0),
    { today: new Date('2026-10-05T00:00:00Z'), monthlyDataRegistered: false },
  );
  assert.deepEqual(notifications, []);
});

test('monthlyDataRegistered=true（登録済み）の場合、未登録向けの案内は出さず通常のfundingGap計算を使う', () => {
  const notifications = buildWorkspaceGrowthNotifications(
    entry({ cashBalance: 0, linkedTaxPayments: 500_000 }),
    { today: new Date('2026-10-05T00:00:00Z'), monthlyDataRegistered: true },
  );
  const cash = notifications.find((n) => n.category === 'cash');
  assert.ok(cash);
  assert.match(cash.message, /不足する見込みです/);
  assert.doesNotMatch(cash.message, /預金残高・入出金予定を入力して/);
});

test('monthlyDataRegistered=falseはcashFlowDataAvailable=falseより優先して判定される', () => {
  const notifications = buildWorkspaceGrowthNotifications(
    emptyMonthlySalesEntry('2026-10', 500_000),
    { today: new Date('2026-10-05T00:00:00Z'), monthlyDataRegistered: false, cashFlowDataAvailable: false },
  );
  const cash = notifications.find((n) => n.category === 'cash');
  assert.ok(cash);
  assert.equal(cash.message, '納税予定¥500,000あり。預金残高・入出金予定を入力して資金繰りを確認してください。');
});

// 【レビュー対応】以下2件は月替わり（JST基準の2026-11-01T00:00:00、UTCでは
// 2026-10-31T15:00:00Z）を挟んで直前・直後1秒ずつの時刻を比較する組み合わせに修正した
// （修正前は2件とも「JSTで11月1日」の時刻になっており、直前側の検証が欠けていた）。

test('月替わり直前（JSTで10月31日23:59:59、まだ10月）は当月の残り1日として計算される', () => {
  // 2026-10-31T14:59:59Z はJSTで2026-10-31T23:59:59（10月の最終秒）。
  // UTCの日付はまだ10月31日・JSTの日付も10月31日で一致するが、「月末ぎりぎりでも
  // 当月のまま扱われる」ことを直後側の境界ケースと対で確認する。
  const notifications = buildWorkspaceGrowthNotifications(
    entry({ targetRevenue: 1_000_000, actualRevenue: 0 }),
    { today: new Date('2026-10-31T14:59:59Z') },
  );
  const sales = notifications.find((n) => n.category === 'sales');
  assert.ok(sales);
  assert.match(sales.message, /あと1日/);
  assert.doesNotMatch(sales.message, /終了しました/);
});

test('月替わり直後（JSTで11月1日00:00:00、UTCではまだ10月31日15:00:00）は当月が終了したものとして計算される', () => {
  // 2026-10-31T15:00:00Z はJSTで2026-11-01T00:00:00（11月に入った瞬間）。
  // UTCの日付はまだ10月31日のため、UTCの日付だけで当月判定すると「まだ10月」と
  // 誤認する可能性があるが、JST基準では10月分（entry.yearMonth='2026-10'）は
  // 既に終了した月として扱われることを確認する（直前側のテストと1秒差の対）。
  const notifications = buildWorkspaceGrowthNotifications(
    entry({ targetRevenue: 1_000_000, actualRevenue: 0 }),
    { today: new Date('2026-10-31T15:00:00Z') },
  );
  const sales = notifications.find((n) => n.category === 'sales');
  assert.ok(sales);
  assert.match(sales.message, /不足したまま今月が終了しました/);
});
