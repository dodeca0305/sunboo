import test from 'node:test';
import assert from 'node:assert/strict';
import { sumTaxPaymentPlansByMonth, taxPaymentPlanRowsToMap } from './workspaceTaxPaymentPlan.ts';

test('納期限月ごとの予定税額を合計する', () => {
  assert.deepEqual(sumTaxPaymentPlansByMonth([
    { procedure_id: 1, due_date: '2026-09-10', amount: 100_000 },
    { procedure_id: 2, due_date: '2026-09-30', amount: 250_000 },
    { procedure_id: 1, due_date: '2026-10-10', amount: 120_000 },
  ]), {
    '2026-09': 350_000,
    '2026-10': 120_000,
  });
});

test('手続きと納期限の組み合わせで予定税額を区別する', () => {
  assert.deepEqual(taxPaymentPlanRowsToMap([
    { procedure_id: 1, due_date: '2026-09-10', amount: 100_000 },
    { procedure_id: 1, due_date: '2026-10-10', amount: 120_000 },
  ]), {
    '1:2026-09-10': 100_000,
    '1:2026-10-10': 120_000,
  });
});
