import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FORECAST_MONEY_KEYS, calculateForecast, emptyForecastInputs, emptyForecastValues, forecastCalcValue, formatYen, proposeForecastPeriod,
  sameForecastValues, validForecastDate, validForecastKey, validForecastMoney, validForecastPeriod, validForecastValues, validScenarioName, type ForecastInputs,
} from './financialForecast.ts';

// 架空の見本（FY2027/03）。本番の既定値ではなくテスト入力としてだけ使う。
const SAMPLE: ForecastInputs = {
  sales: 12000000, cogs: 4800000, opex: 6000000, other_income: 0, other_expense: 0, special_gain: 0, special_loss: 0, tax_expense: 360000,
  opening_cash: 3000000, opening_retained_earnings: 0, capital: 3000000, borrowing: 500000, collections: 10160000, cogs_paid: 4800000,
  opex_paid: 5300000, tax_paid: 360000, equipment: 200000,
};
const val = (i: ForecastInputs, k: string) => forecastCalcValue(calculateForecast(i), k);

test('exact sample derives the approved figures with no balancing plug', () => {
  const expected: Record<string, bigint> = {
    operating_income: BigInt(1200000), pretax_income: BigInt(1200000), net_income: BigInt(840000), ending_cash: BigInt(3000000), receivables: BigInt(1840000), equipment_asset: BigInt(200000),
    total_assets: BigInt(5040000), unpaid: BigInt(700000), loans: BigInt(500000), tax_payable: BigInt(0), total_liabilities: BigInt(1200000), equity: BigInt(3840000), difference: BigInt(0),
  };
  for (const [k, v] of Object.entries(expected)) assert.equal(val(SAMPLE, k), v, k);
});
test('+1,000,000 revenue moves profit and receivables by exactly that, difference stays 0', () => {
  const up = { ...SAMPLE, sales: SAMPLE.sales! + 1000000 };
  assert.equal(val(up, 'net_income'), BigInt(840000) + BigInt(1000000));
  assert.equal(val(up, 'operating_income'), BigInt(2200000));
  assert.equal(val(up, 'receivables'), BigInt(2840000));
  assert.equal(val(up, 'difference'), BigInt(0));
});
test('blank is unavailable, never zero; only dependents are suppressed', () => {
  const noTax = { ...SAMPLE, tax_expense: null };
  assert.equal(val(noTax, 'operating_income'), BigInt(1200000));
  assert.equal(val(noTax, 'pretax_income'), BigInt(1200000));
  for (const k of ['net_income', 'equity', 'difference', 'tax_payable', 'total_liabilities']) assert.equal(val(noTax, k), null, k);
  assert.equal(val(noTax, 'ending_cash'), BigInt(3000000));
  assert.equal(val(noTax, 'total_assets'), BigInt(5040000));
  const row = calculateForecast(noTax).find(r => r.key === 'net_income')!;
  assert.deepEqual(row.missing, ['税金費用（仮定）']);
  assert.ok(calculateForecast(emptyForecastInputs()).every(r => r.value === null));
});
test('explicit zero is a value and differs from blank', () => {
  const zeroSales = { ...SAMPLE, sales: 0, collections: 0 };
  assert.equal(val(zeroSales, 'receivables'), BigInt(0));
  assert.equal(val({ ...zeroSales, sales: null }, 'receivables'), null);
  assert.equal(sameForecastValues({ ...emptyForecastValues(), sales: 0 }, emptyForecastValues()), false);
});
test('signed opening retained earnings flow into equity and expose an honest opening difference', () => {
  assert.equal(val({ ...SAMPLE, opening_retained_earnings: -500000 }, 'equity'), BigInt(3340000));
  assert.equal(val({ ...SAMPLE, opening_retained_earnings: -500000 }, 'difference'), BigInt(500000));
  assert.ok(validForecastMoney('opening_retained_earnings', -1));
  assert.equal(validForecastMoney('sales', -1), false);
});
test('huge values use exact bigint arithmetic without safe-integer loss', () => {
  const max = Number.MAX_SAFE_INTEGER;
  const big = { ...SAMPLE, sales: max, cogs: 0, opex: 0, other_income: max, other_expense: 0, special_gain: max, special_loss: 0, tax_expense: 0 };
  assert.equal(val(big, 'pretax_income'), BigInt(3) * BigInt(max));
  assert.equal(formatYen(BigInt(3) * BigInt(max)), '¥27,021,597,764,222,973');
  assert.equal(formatYen(-BigInt(5)), '−¥5');
  assert.equal(validForecastMoney('sales', max + 1), false);
  assert.equal(validForecastMoney('sales', 1.5), false);
  assert.equal(validForecastMoney('sales', Number.NaN), false);
  assert.equal(validForecastMoney('sales', '1' as unknown), false);
  assert.equal(validForecastMoney('opening_retained_earnings', -(max + 1)), false);
});
test('dates, periods and scenario names reject impossible values', () => {
  assert.ok(validForecastDate('2028-02-29'));
  for (const d of ['2027-02-29', '2027-13-01', '2027-04-31', '2027-4-1', '', null, 20270401]) assert.equal(validForecastDate(d as unknown), false, String(d));
  assert.ok(validForecastPeriod('2026-04-01', '2027-03-31'));
  assert.ok(validForecastPeriod('2027-03-31', '2027-03-31'));
  assert.equal(validForecastPeriod('2027-03-31', '2026-04-01'), false);
  assert.equal(validForecastPeriod('1999-12-31', '2000-12-30'), false);
  assert.equal(validForecastPeriod('2026-04-01', '2029-03-31'), false);
  assert.ok(validScenarioName('標準'));
  for (const n of ['', ' x', 'x ', 'a\nb', 'x'.repeat(61), 1 as unknown]) assert.equal(validScenarioName(n), false);
  assert.ok(validScenarioName('あ'.repeat(60)));
  assert.ok(validForecastKey({ fiscal_start: '2026-04-01', fiscal_end: '2027-03-31', scenario_name: '標準' }));
  assert.equal(validForecastKey({ fiscal_start: '2026-04-01', fiscal_end: '2027-03-31', scenario_name: '' }), false);
});
test('values validator is strict about shape', () => {
  assert.ok(validForecastValues({ ...SAMPLE, is_fictional: true }));
  assert.ok(validForecastValues(emptyForecastValues()));
  assert.equal(validForecastValues({ ...SAMPLE }), false);
  assert.equal(validForecastValues({ ...SAMPLE, is_fictional: 'yes' }), false);
  assert.equal(validForecastValues({ ...SAMPLE, is_fictional: true, sales: undefined }), false);
  assert.equal(validForecastValues(null), false);
  assert.equal(FORECAST_MONEY_KEYS.length, 17);
});
test('proposed period comes only from a registered fiscal month and is never assumed otherwise', () => {
  assert.deepEqual(proposeForecastPeriod(3, '2026-11-18'), { start: '2026-04-01', end: '2027-03-31' });
  assert.deepEqual(proposeForecastPeriod(3, '2027-03-31'), { start: '2026-04-01', end: '2027-03-31' });
  assert.deepEqual(proposeForecastPeriod(3, '2027-04-01'), { start: '2027-04-01', end: '2028-03-31' });
  assert.deepEqual(proposeForecastPeriod(12, '2026-11-18'), { start: '2026-01-01', end: '2026-12-31' });
  assert.deepEqual(proposeForecastPeriod(2, '2027-06-01'), { start: '2027-03-01', end: '2028-02-29' });
  assert.equal(proposeForecastPeriod(null, '2026-11-18'), null);
  assert.equal(proposeForecastPeriod(13, '2026-11-18'), null);
  assert.equal(proposeForecastPeriod(3, 'bad'), null);
});
