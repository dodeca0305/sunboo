import test from 'node:test';
import assert from 'node:assert/strict';
import { isConsumptionTaxReturnRequiredByCapital } from './consumptionTaxApplicability.ts';

test('資本金1,000万円以上なら新設法人の消費税申告対象', () => {
  assert.equal(isConsumptionTaxReturnRequiredByCapital(10_000_000), true);
  assert.equal(isConsumptionTaxReturnRequiredByCapital(30_000_000), true);
});

test('資本金1,000万円未満・不明なら資本金だけでは消費税申告対象と断定しない', () => {
  assert.equal(isConsumptionTaxReturnRequiredByCapital(9_999_999), false);
  assert.equal(isConsumptionTaxReturnRequiredByCapital(undefined), false);
});
