import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWorkspaceTaxPaymentPlansForEditing } from './workspaceTaxPaymentPlanData.ts';

const rows = [{ procedure_id: 7, due_date: '2026-11-30', amount: 500000 },
  { procedure_id: 7, due_date: '2027-11-30', amount: 0 }];
function fake(response: { data?: unknown; error?: unknown } | Error) {
  const calls: unknown[][] = [];
  const client = { from(table: string) {
    calls.push(['from', table]);
    return { select(columns: string) {
      calls.push(['select', columns]);
      return { async eq(column: string, value: number) {
        calls.push(['eq', column, value]);
        if (response instanceof Error) throw response;
        return response;
      } };
    } };
  } } as unknown as Parameters<typeof loadWorkspaceTaxPaymentPlansForEditing>[0];
  return { client, calls };
}

test('既存の金額・明示的な0・同一手続きの異なる納期限を保持し、会社を絞り込む', async () => {
  const { client, calls } = fake({ data: rows, error: null });
  assert.deepEqual(await loadWorkspaceTaxPaymentPlansForEditing(client, 23), {
    '7:2026-11-30': 500000, '7:2027-11-30': 0,
  });
  assert.deepEqual(calls, [['from', 'workspace_tax_payment_plans'],
    ['select', 'procedure_id, due_date, amount'], ['eq', 'company_id', 23]]);
});

test('正常な0行だけが新規入力できる空Mapになる', async () => {
  assert.deepEqual(await loadWorkspaceTaxPaymentPlansForEditing(fake({ data: [], error: null }).client, 23), {});
});

for (const [name, response] of Object.entries({
  error: { data: null, error: { message: 'failed' } },
  partialError: { data: rows, error: { message: 'failed' } },
  null: { data: null, error: null },
  missing: { error: null },
  object: { data: {}, error: null },
  exception: new Error('network error'),
})) test(`${name}: 未取得を保存可能な空Mapにしない`, async () => {
  assert.equal(await loadWorkspaceTaxPaymentPlansForEditing(fake(response).client, 23), null);
});

for (const [name, value] of Object.entries({
  null: null, missingAmount: { procedure_id: 7, due_date: '2026-11-30' },
  nullAmount: { ...rows[0], amount: null }, negative: { ...rows[0], amount: -1 },
  invalidAmount: { ...rows[0], amount: '500000' }, unsafe: { ...rows[0], amount: Number.MAX_SAFE_INTEGER + 1 },
  invalidProcedure: { ...rows[0], procedure_id: 0 }, invalidDate: { ...rows[0], due_date: null },
})) test(`${name}: 不正な行を0へ変換せず一覧全体を編集不可にする`, async () => {
  assert.equal(await loadWorkspaceTaxPaymentPlansForEditing(fake({ data: [...rows, value], error: null }).client, 23), null);
});
