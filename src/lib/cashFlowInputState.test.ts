import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyCashFlowInputState,
  initCashFlowInputState,
  isCashFlowInputReady,
  missingCashFlowFields,
  updateCashFlowInput,
} from './cashFlowInputState.ts';
import { calculateMonthlyCashFlow, emptyMonthlySalesEntry } from './monthlySalesProgress.ts';

const allZero = { cashBalance: 0, expectedCashInflows: 0, expectedCashOutflows: 0, plannedTaxPayments: 0 };

test('blank state is unknown and lists all four fields', () => {
  const state = emptyCashFlowInputState();
  assert.equal(isCashFlowInputReady(state), false);
  assert.equal(missingCashFlowFields(state).length, 4);
});

test('explicit zero is known; unknown differs from zero', () => {
  let state = emptyCashFlowInputState();
  for (const f of Object.keys(allZero) as (keyof typeof allZero)[]) state = updateCashFlowInput(state, f, 0);
  assert.equal(isCashFlowInputReady(state), true);
  assert.deepEqual(state, allZero);
});

test('partial input stays unknown and reports only missing fields', () => {
  let state = updateCashFlowInput(emptyCashFlowInputState(), 'cashBalance', 0);
  state = updateCashFlowInput(state, 'expectedCashInflows', 500);
  assert.equal(isCashFlowInputReady(state), false);
  assert.deepEqual(missingCashFlowFields(state), ['expectedCashOutflows', 'plannedTaxPayments']);
});

test('clearing a known field returns it to unknown', () => {
  let state = updateCashFlowInput(emptyCashFlowInputState(), 'cashBalance', 0);
  state = updateCashFlowInput(state, 'cashBalance', null);
  assert.equal(state.cashBalance, null);
});

test('invalid values are never known', () => {
  for (const bad of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 2]) {
    const state = updateCashFlowInput(emptyCashFlowInputState(), 'cashBalance', bad);
    assert.equal(state.cashBalance, null, String(bad));
  }
});

test('init from saved entry: positives known, legacy zero unknown', () => {
  const state = initCashFlowInputState({ cashBalance: 3000000, expectedCashInflows: 0, expectedCashOutflows: 200, plannedTaxPayments: 0 });
  assert.deepEqual(state, { cashBalance: 3000000, expectedCashInflows: null, expectedCashOutflows: 200, plannedTaxPayments: null });
  assert.equal(isCashFlowInputReady(state), false);
  assert.equal(isCashFlowInputReady(initCashFlowInputState(allZero)), false);
  assert.equal(isCashFlowInputReady(initCashFlowInputState(undefined)), false);
});

test('init with all positive values is ready', () => {
  assert.equal(isCashFlowInputReady(initCashFlowInputState({ cashBalance: 1, expectedCashInflows: 2, expectedCashOutflows: 3, plannedTaxPayments: 4 })), true);
});

test('linked tax does not affect readiness; cash formula unchanged for explicit zeros', () => {
  const entry = { ...emptyMonthlySalesEntry('2026-11', 500000), ...allZero };
  assert.equal(isCashFlowInputReady(emptyCashFlowInputState()), false);
  const flow = calculateMonthlyCashFlow(entry);
  assert.equal(flow.fundingGap, 500000);
  const zero = calculateMonthlyCashFlow({ ...entry, linkedTaxPayments: 0 });
  assert.equal(zero.fundingGap, 0);
  assert.equal(zero.runwayMonths, null);
});
