import test from 'node:test';
import assert from 'node:assert/strict';
import { canPlanTaxPayment, confirmedTaxPaymentPlanRows, sumTaxPaymentPlansByMonth, taxPaymentPlanRowsToMap } from './workspaceTaxPaymentPlan.ts';

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

for (const code of ['DEPRECIABLE_ASSET_TAX_RETURN', 'SALARY_PAYMENT_REPORT', 'BLUE_RETURN_APPROVAL', 'PAYROLL_OFFICE_OPEN', 'YEAR_END_ADJUSTMENT', 'WITHHOLDING_SPECIAL_EXCEPTION', 'TAX_OFFICE_CHANGE_NOTICE', 'FUKUOKA_PREFECTURAL_ESTABLISHMENT_NOTICE', 'FUKUOKA_CITY_ESTABLISHMENT_NOTICE', 'UNKNOWN']) {
  test(`${code}: 申告・届出や未知の手続きに税額を入力させない`, () => {
    assert.equal(canPlanTaxPayment(code), false);
  });
}
test('納付を含む手続きの登録額は維持し、申告だけの0円は未登録の集計と区別する', () => {
  const rows = [
    {procedure_id: 7, due_date: '2027-01-10', amount: 500, procedures: {code:'WITHHOLDING_TAX'}},
    {procedure_id: 66, due_date: '2027-01-31', amount: 0, procedures: {code:'DEPRECIABLE_ASSET_TAX_RETURN'}},
  ];
  assert.deepEqual(sumTaxPaymentPlansByMonth(confirmedTaxPaymentPlanRows(rows)), {'2027-01':500});
  assert.equal(rows.length,2);
});
test('申告だけの既存額を消去・0円化・別月へ移動せず、混合集計全体を停止する', () => {
  const rows = [
    {procedure_id: 7, due_date: '2027-01-10', amount: 500, procedures: {code:'WITHHOLDING_TAX'}},
    {procedure_id: 66, due_date: '2027-01-31', amount: 1000, procedures: {code:'DEPRECIABLE_ASSET_TAX_RETURN'}},
  ];
  const before = structuredClone(rows);
  assert.throws(()=>confirmedTaxPaymentPlanRows(rows));
  assert.deepEqual(rows,before);
});
test('手続きマスターが欠落すると0円でも集計しない', () => {
  assert.throws(()=>confirmedTaxPaymentPlanRows([{procedure_id:66,due_date:'2027-01-31',amount:0,procedures:null}]));
});

for (const code of ['WITHHOLDING_TAX','RESIDENT_TAX_WITHHOLDING','CORP_TAX_RETURN','CONSUMPTION_TAX_RETURN','PREFECTURAL_RESIDENT_TAX_RETURN','PREFECTURAL_BUSINESS_TAX_RETURN','MUNICIPAL_RESIDENT_TAX_RETURN']) {
  test(`${code}: 納付を含む既存手続きの入力を維持する`,()=>assert.equal(canPlanTaxPayment(code),true));
}
for (const row of [null,{}, {procedure_id:1,due_date:'2027-01-31',amount:100,procedures:[]}, {procedure_id:1,due_date:null,amount:100,procedures:{code:'WITHHOLDING_TAX'}}]) {
  test(`不正な納税予定を集計しない: ${JSON.stringify(row)}`,()=>assert.throws(()=>confirmedTaxPaymentPlanRows([row])));
}
