import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isProcedureApplicableByPeople,
  isWithholdingSpecialExceptionApplicable,
} from './peopleApplicability.ts';

test('従業員なしでも役員報酬ありなら給与・源泉・社会保険手続きを表示する', () => {
  for (const code of ['PAYROLL_OFFICE_OPEN', 'WITHHOLDING_TAX', 'SOCIAL_INS_SANTEIKISO', 'YEAR_END_ADJUSTMENT', 'WITHHOLDING_SPECIAL_EXCEPTION']) {
    assert.equal(isProcedureApplicableByPeople({ code, requiresEmployees: true, hasEmployees: false, paysOfficerCompensation: true }), true);
  }
  assert.equal(isProcedureApplicableByPeople({ code: 'SOCIAL_INS_NEW', requiresEmployees: false, hasEmployees: false, paysOfficerCompensation: true }), true);
});

test('役員報酬だけでは労働保険・雇用保険を表示しない', () => {
  for (const code of ['LABOR_INS_ESTABLISH', 'EMPLOY_INS_OFFICE', 'LABOR_INS_RENEWAL']) {
    assert.equal(isProcedureApplicableByPeople({ code, requiresEmployees: true, hasEmployees: false, paysOfficerCompensation: true }), false);
  }
});

test('従業員も役員報酬もなければ社会保険新規適用届を表示しない', () => {
  assert.equal(isProcedureApplicableByPeople({ code: 'SOCIAL_INS_NEW', requiresEmployees: false, hasEmployees: false, paysOfficerCompensation: false }), false);
});

test('給与支給人員が1〜9人なら納期の特例を表示できる', () => {
  assert.equal(isWithholdingSpecialExceptionApplicable(1), true);
  assert.equal(isWithholdingSpecialExceptionApplicable(9), true);
});

test('給与支給人員が0人・10人以上・不明なら納期の特例を表示しない', () => {
  assert.equal(isWithholdingSpecialExceptionApplicable(0), false);
  assert.equal(isWithholdingSpecialExceptionApplicable(10), false);
  assert.equal(isWithholdingSpecialExceptionApplicable(undefined), false);
});

test('雇用保険の対象者がいない場合は適用事業所設置届を表示しない', () => {
  assert.equal(isProcedureApplicableByPeople({
    code: 'EMPLOY_INS_OFFICE',
    requiresEmployees: true,
    hasEmployees: true,
    paysOfficerCompensation: false,
    hasEmploymentInsuranceEligibleEmployee: false,
  }), false);
});

test('雇用保険の対象者がいる場合は適用事業所設置届を表示する', () => {
  assert.equal(isProcedureApplicableByPeople({
    code: 'EMPLOY_INS_OFFICE',
    requiresEmployees: true,
    hasEmployees: true,
    paysOfficerCompensation: false,
    hasEmploymentInsuranceEligibleEmployee: true,
  }), true);
});

test('雇用保険の対象者条件は資格取得届にも適用する', () => {
  assert.equal(isProcedureApplicableByPeople({
    code: 'EMPLOY_INS_QUALIFICATION', requiresEmployees: true, hasEmployees: true,
    paysOfficerCompensation: false, hasEmploymentInsuranceEligibleEmployee: false,
  }), false);
});

test('社会保険の対象者がいる場合だけ資格取得届を表示する', () => {
  assert.equal(isProcedureApplicableByPeople({
    code: 'SOCIAL_INS_QUALIFICATION', requiresEmployees: true, hasEmployees: true,
    paysOfficerCompensation: false, hasSocialInsuranceEligibleEmployee: true,
  }), true);
  assert.equal(isProcedureApplicableByPeople({
    code: 'SOCIAL_INS_QUALIFICATION', requiresEmployees: true, hasEmployees: true,
    paysOfficerCompensation: false, hasSocialInsuranceEligibleEmployee: false,
  }), false);
});
