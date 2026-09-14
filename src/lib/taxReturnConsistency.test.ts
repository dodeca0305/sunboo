import test from 'node:test';
import assert from 'node:assert/strict';
import type { CompanyProfile } from './companyProfile.ts';
import type { TaxReturnEntry } from './taxReturnProfile.ts';
import { detectTaxReturnConsistencyIssues } from './taxReturnConsistency.ts';

const profile: CompanyProfile = {
  fiscalMonth: 3,
  consumptionTaxStatus: 'exempt',
  invoiceRegistrationStatus: 'not_registered',
} as CompanyProfile;

const entry: TaxReturnEntry = {
  id: '1',
  fiscalYear: '2026年3月期',
  fiscalYearStartDate: '2025-04-01',
  fiscalYearEndDate: '2026-03-31',
  filedDate: '2026-05-31',
  capitalAtFiling: null,
  taxableSalesAmount: null,
  consumptionTaxStatus: 'exempt',
  taxationMethod: null,
  invoiceRegistrationStatus: 'not_registered',
  corporateTaxAmount: null,
  consumptionTaxAmount: null,
  corporateTaxInterimFilingActual: 'none',
  consumptionTaxInterimFrequencyActual: 'none',
  financialStatementPublished: false,
  withholdingTaxCycleActual: null,
  employeeCountAtFiscalYearEnd: null,
  createdAt: '2026-05-31T00:00:00.000Z',
  updatedAt: '2026-05-31T00:00:00.000Z',
};

test('一致する決算実績では警告しない', () => {
  assert.deepEqual(detectTaxReturnConsistencyIssues(profile, entry), []);
});

test('消費税・インボイス・決算月の不一致をすべて検出する', () => {
  const issues = detectTaxReturnConsistencyIssues(profile, {
    ...entry,
    fiscalYearEndDate: '2026-12-31',
    consumptionTaxStatus: 'taxable',
    invoiceRegistrationStatus: 'registered',
  });

  assert.deepEqual(
    issues.map((issue) => issue.field),
    ['consumptionTaxStatus', 'invoiceRegistrationStatus', 'fiscalMonth'],
  );
});

test('会社プロフィールの決算月が未入力なら決算月を比較しない', () => {
  const issues = detectTaxReturnConsistencyIssues(
    { ...profile, fiscalMonth: null },
    { ...entry, fiscalYearEndDate: '2026-12-31' },
  );

  assert.deepEqual(issues, []);
});
