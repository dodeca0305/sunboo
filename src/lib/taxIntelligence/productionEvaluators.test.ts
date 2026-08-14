import test from 'node:test';
import assert from 'node:assert/strict';

import type { CompanyProfile } from '../companyProfile.ts';
import type {
  TaxReturnEntry,
  TaxReturnProfile,
} from '../taxReturnProfile.ts';

import {
  E_GOV_CORPORATE_TAX_FILING_SOURCE_VERSION_SNAPSHOT,
  NTA_C1_1_SOURCE_VERSION_SNAPSHOT,
  PRODUCTION_CONTROL_EVALUATOR_KEYS,
  addCalendarMonths,
  evaluateCorporateTaxFilingBaselineDeadline,
  evaluateProductionTaxControl,
} from './productionEvaluators.ts';

function company(): CompanyProfile {
  return {
    fiscalMonth: 3,
    consumptionTaxStatus: 'taxable',
    invoiceRegistrationStatus: 'registered',
  } as CompanyProfile;
}

function entry(
  id: string,
  overrides: Partial<TaxReturnEntry> = {},
): TaxReturnEntry {
  return {
    id,
    fiscalYear: '2027年3月期',
    fiscalYearStartDate: '2026-04-01',
    fiscalYearEndDate: '2027-03-31',
    filedDate: '2027-05-31',
    capitalAtFiling: null,
    taxableSalesAmount: null,
    consumptionTaxStatus: 'taxable',
    taxationMethod: null,
    invoiceRegistrationStatus: 'registered',
    corporateTaxAmount: null,
    consumptionTaxAmount: null,
    corporateTaxInterimFilingActual: 'none',
    consumptionTaxInterimFrequencyActual: 'none',
    financialStatementPublished: false,
    withholdingTaxCycleActual: null,
    employeeCountAtFiscalYearEnd: null,
    createdAt: '2027-06-01T00:00:00Z',
    updatedAt: '2027-06-01T00:00:00Z',
    ...overrides,
  };
}

function profile(entries: TaxReturnEntry[]): TaxReturnProfile {
  return { entries };
}

test('TI_TAX_001: 申告実績0件は対象外', () => {
  const result = evaluateCorporateTaxFilingBaselineDeadline({
    companyProfile: company(),
    corporateTaxFilingContext: {
      liquidationResidualAssetsCase: 'not_applicable',
    },
    taxReturnProfile: profile([]),
  });

  assert.equal(result.applicable, false);
  assert.equal(result.status, null);
});

test('TI_TAX_001: 検証済みSource適用範囲より前は対象外', () => {
  const result = evaluateCorporateTaxFilingBaselineDeadline({
    companyProfile: company(),
    corporateTaxFilingContext: {
      liquidationResidualAssetsCase: 'not_applicable',
    },
    taxReturnProfile: profile([
      entry('1', {
        fiscalYearEndDate: '2023-03-31',
        filedDate: '2023-05-31',
      }),
    ]),
  });

  assert.equal(result.applicable, false);
  assert.equal(result.status, null);
  assert.equal(
    result.reasonCode,
    'outside_verified_source_effective_period',
  );
});

test('TI_TAX_001: 清算特則の該当有無が未確認ならUNKNOWN', () => {
  const result = evaluateCorporateTaxFilingBaselineDeadline({
    companyProfile: company(),
    corporateTaxFilingContext: {
      liquidationResidualAssetsCase: 'unknown',
    },
    taxReturnProfile: profile([
      entry('1', {
        filedDate: '2027-05-20',
      }),
    ]),
  });

  assert.equal(result.applicable, true);
  assert.equal(result.status, 'unknown');
  assert.equal(
    result.reasonCode,
    'liquidation_residual_assets_case_unknown',
  );
});

test('TI_TAX_001: 清算中の残余財産確定特則が該当する場合はUNKNOWN', () => {
  const result = evaluateCorporateTaxFilingBaselineDeadline({
    companyProfile: company(),
    corporateTaxFilingContext: {
      liquidationResidualAssetsCase: 'applicable',
    },
    taxReturnProfile: profile([
      entry('1', {
        filedDate: '2027-04-30',
      }),
    ]),
  });

  assert.equal(result.applicable, true);
  assert.equal(result.status, 'unknown');
  assert.equal(
    result.reasonCode,
    'liquidation_residual_assets_special_case_requires_evaluation',
  );
});

test('TI_TAX_001: 原則2か月基準日前の申告はPASS', () => {
  const result = evaluateCorporateTaxFilingBaselineDeadline({
    companyProfile: company(),
    corporateTaxFilingContext: {
      liquidationResidualAssetsCase: 'not_applicable',
    },
    taxReturnProfile: profile([
      entry('1', { filedDate: '2027-05-20' }),
    ]),
  });

  assert.equal(result.status, 'pass');
});

test('TI_TAX_001: 原則2か月基準日当日の申告はPASS', () => {
  const result = evaluateCorporateTaxFilingBaselineDeadline({
    companyProfile: company(),
    corporateTaxFilingContext: {
      liquidationResidualAssetsCase: 'not_applicable',
    },
    taxReturnProfile: profile([entry('1')]),
  });

  assert.equal(result.status, 'pass');
  assert.equal(
    result.observedInputs.baselineDueDate,
    '2027-05-31',
  );
});

test('TI_TAX_001: 原則2か月基準日後は延長情報不足のためUNKNOWN', () => {
  const result = evaluateCorporateTaxFilingBaselineDeadline({
    companyProfile: company(),
    corporateTaxFilingContext: {
      liquidationResidualAssetsCase: 'not_applicable',
    },
    taxReturnProfile: profile([
      entry('1', { filedDate: '2027-06-01' }),
    ]),
  });

  assert.equal(result.status, 'unknown');
  assert.equal(
    result.reasonCode,
    'corporate_tax_filing_after_baseline_needs_exception_check',
  );
});

test('TI_TAX_001: 申告日未入力はUNKNOWN', () => {
  const result = evaluateCorporateTaxFilingBaselineDeadline({
    companyProfile: company(),
    corporateTaxFilingContext: {
      liquidationResidualAssetsCase: 'not_applicable',
    },
    taxReturnProfile: profile([
      entry('1', { filedDate: null }),
    ]),
  });

  assert.equal(result.status, 'unknown');
});

test('TI_TAX_001: 決算日前の申告日はUNKNOWN', () => {
  const result = evaluateCorporateTaxFilingBaselineDeadline({
    companyProfile: company(),
    corporateTaxFilingContext: {
      liquidationResidualAssetsCase: 'not_applicable',
    },
    taxReturnProfile: profile([
      entry('1', { filedDate: '2027-03-01' }),
    ]),
  });

  assert.equal(result.status, 'unknown');
});

test('月末決算は2か月後の月末を基準日にする', () => {
  assert.equal(
    addCalendarMonths('2027-02-28', 2),
    '2027-04-30',
  );
});

test('TI_TAX_001は最新決算期を使う', () => {
  const result = evaluateCorporateTaxFilingBaselineDeadline({
    companyProfile: company(),
    corporateTaxFilingContext: {
      liquidationResidualAssetsCase: 'not_applicable',
    },
    taxReturnProfile: profile([
      entry('new', {
        fiscalYearEndDate: '2027-03-31',
        filedDate: '2027-05-31',
      }),
      entry('old', {
        fiscalYearEndDate: '2026-03-31',
        filedDate: '2026-08-01',
      }),
    ]),
  });

  assert.equal(result.status, 'pass');
  assert.equal(result.observedInputs.entryId, 'new');
});

test('Production evaluator registryから実行でき、SourceVersion snapshotを持つ', () => {
  const result = evaluateProductionTaxControl(
    PRODUCTION_CONTROL_EVALUATOR_KEYS.TI_TAX_001,
    {
      companyProfile: company(),
    corporateTaxFilingContext: {
      liquidationResidualAssetsCase: 'not_applicable',
    },
      taxReturnProfile: profile([entry('1')]),
    },
  );

  assert.equal(result.evaluatorVersion, 'ti-0.8-production-v1');
  assert.deepEqual(result.sourceVersionSnapshot, [
    E_GOV_CORPORATE_TAX_FILING_SOURCE_VERSION_SNAPSHOT,
    NTA_C1_1_SOURCE_VERSION_SNAPSHOT,
  ]);
  assert.equal(
    result.sourceVersionSnapshot[0].contentHash,
    'ad289727a57263365d1e64d3931f7f0960e2501384c6da22fead723334474183',
  );
  assert.equal(
    result.sourceVersionSnapshot[1].contentHash,
    'bb1824ef6cb588a16f2cf2047c021f79ea5dce8136d94f52397a18d744053cc5',
  );
});
