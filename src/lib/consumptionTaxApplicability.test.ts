import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isConsumptionTaxReturnRequired,
  isConsumptionTaxReturnRequiredByCapital,
} from './consumptionTaxApplicability.ts';

test('資本金1,000万円以上なら新設法人の消費税申告対象', () => {
  assert.equal(isConsumptionTaxReturnRequiredByCapital(10_000_000), true);
  assert.equal(isConsumptionTaxReturnRequiredByCapital(30_000_000), true);
});

test('インボイス登録済みなら資本金1,000万円未満でも消費税申告対象', () => {
  assert.equal(isConsumptionTaxReturnRequired({
    capitalAmount: 1_000_000,
    isInvoiceRegistered: true,
  }), true);
});

test('インボイス未登録かつ資本金1,000万円未満なら対象と断定しない', () => {
  assert.equal(isConsumptionTaxReturnRequired({
    capitalAmount: 9_999_999,
    isInvoiceRegistered: false,
  }), false);
});

test('課税事業者選択届出書が現在有効なら資本金1,000万円未満でも消費税申告対象', () => {
  assert.equal(isConsumptionTaxReturnRequired({
    capitalAmount: 1_000_000,
    isInvoiceRegistered: false,
    isConsumptionTaxElectionEffective: true,
  }), true);
});

test('課税事業者選択が無効なら他の該当条件がない限り対象と断定しない', () => {
  assert.equal(isConsumptionTaxReturnRequired({
    capitalAmount: 9_999_999,
    isInvoiceRegistered: false,
    isConsumptionTaxElectionEffective: false,
  }), false);
});

test('特定期間の課税売上高と給与等支払額が両方1,000万円超なら消費税申告対象', () => {
  assert.equal(isConsumptionTaxReturnRequired({
    capitalAmount: 1_000_000,
    isInvoiceRegistered: false,
    isConsumptionTaxElectionEffective: false,
    specificPeriodThresholdStatus: 'both_over',
  }), true);
});

test('特定期間のいずれかが1,000万円以下または不明なら対象と断定しない', () => {
  for (const status of ['either_not_over', 'not_applicable_or_unknown'] as const) {
    assert.equal(isConsumptionTaxReturnRequired({
      capitalAmount: 9_999_999,
      isInvoiceRegistered: false,
      isConsumptionTaxElectionEffective: false,
      specificPeriodThresholdStatus: status,
    }), false);
  }
});

test('資本金1,000万円未満・不明なら資本金だけでは消費税申告対象と断定しない', () => {
  assert.equal(isConsumptionTaxReturnRequiredByCapital(9_999_999), false);
  assert.equal(isConsumptionTaxReturnRequiredByCapital(undefined), false);
});
