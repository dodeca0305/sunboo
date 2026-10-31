import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWorkspaceGrowthData } from './workspaceGrowthData.ts';

const tables = ['workspace_monthly_sales', 'workspace_weekly_sales_activities', 'workspace_daily_sales_activities', 'workspace_tax_payment_plans'];
type Response = { data: unknown; error: unknown };
function fakeClient(overrides: Record<string, Response | Error> = {}) {
  const calls: { table: string; companyId?: number }[] = [];
  const client = {
    from(table: string) {
      const call: { table: string; companyId?: number } = { table };
      calls.push(call);
      const query = {
        select() { return query; },
        eq(column: string, value: number) {
          assert.equal(column, 'company_id');
          call.companyId = value;
          return query;
        },
        order() { return query; },
        then(resolve: (value: Response) => unknown, reject: (reason: unknown) => unknown) {
          const value = overrides[table] ?? { data: [], error: null };
          return (value instanceof Error ? Promise.reject(value) : Promise.resolve(value)).then(resolve, reject);
        },
      };
      return query;
    },
  };
  return { client: client as unknown as Parameters<typeof loadWorkspaceGrowthData>[0], calls };
}

test('全取得が成功した空配列は未登録として編集でき、全クエリを会社単位に絞る', async () => {
  const { client, calls } = fakeClient();
  assert.deepEqual(await loadWorkspaceGrowthData(client, 23), {
    status: 'loaded', entries: [], weeklyActivities: [], dailyActivities: [], linkedTaxPaymentsByMonth: {},
  });
  assert.deepEqual(calls, tables.map(table => ({ table, companyId: 23 })));
});

for (const table of tables) {
  for (const [kind, response] of Object.entries({
    error: { data: [], error: { message: 'Unavailable' } },
    nullData: { data: null, error: null },
    transportException: new Error('Network unavailable'),
  })) {
    test(`${table}: ${kind}を空ドラフトとして返さず編集不可にする`, async () => {
      const { client } = fakeClient({ [table]: response });
      assert.deepEqual(await loadWorkspaceGrowthData(client, 23), { status: 'unavailable' });
    });
  }
}

test('既存実績・行動目標・納税予定の変換を維持する', async () => {
  const { client } = fakeClient({
    workspace_monthly_sales: { error: null, data: [{
      year_month: '2026-10-01', target_revenue: 1000000, actual_revenue: 650000,
      cash_balance: 300000, action_goal: '既存の目標を維持', revenue_model: 'sales_funnel',
    }] },
    workspace_weekly_sales_activities: { error: null, data: [{ week_start: '2026-10-26', target_meetings: 8, actual_meetings: 4, actual_deals: 2, action_note: '既存の週次メモ' }] },
    workspace_daily_sales_activities: { error: null, data: [{ activity_date: '2026-10-30', target_units: 3, actual_units: 2, action_plan: '既存の日次計画', outcome_review: '既存の振り返り' }] },
    workspace_tax_payment_plans: { error: null, data: [{ procedure_id: 1, due_date: '2026-10-31', amount: 150000 }, { procedure_id: 2, due_date: '2026-10-31', amount: 50000 }] },
  });
  const result = await loadWorkspaceGrowthData(client, 23);
  assert.equal(result.status, 'loaded');
  if (result.status !== 'loaded') return;
  assert.equal(result.entries[0].actualRevenue, 650000);
  assert.equal(result.entries[0].cashBalance, 300000);
  assert.equal(result.entries[0].linkedTaxPayments, 200000);
  assert.equal(result.entries[0].actionGoal, '既存の目標を維持');
  assert.equal(result.weeklyActivities[0].actionNote, '既存の週次メモ');
  assert.equal(result.dailyActivities[0].outcomeReview, '既存の振り返り');
});
