import test from 'node:test';
import assert from 'node:assert/strict';
import { isProcedureApplicableByPeople } from './peopleApplicability.ts';

test('従業員なしでも役員報酬ありなら給与・源泉・社会保険手続きを表示する', () => {
  for (const code of ['PAYROLL_OFFICE_OPEN', 'WITHHOLDING_TAX', 'SOCIAL_INS_SANTEIKISO', 'YEAR_END_ADJUSTMENT']) {
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
