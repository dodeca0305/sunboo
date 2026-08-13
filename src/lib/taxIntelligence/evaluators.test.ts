import test from 'node:test';
import assert from 'node:assert/strict';

import type { CompanyProfile } from '../companyProfile.ts';
import type {
  TaxReturnEntry,
  TaxReturnProfile,
} from '../taxReturnProfile.ts';

import {
  SMOKE_CONTROL_EVALUATOR_KEYS,
  evaluateConsumptionTaxStateConsistency,
  evaluateDuplicateFiscalPeriod,
  evaluateFiscalDateOrder,
  evaluateFiscalMonthConsistency,
  evaluateInvoiceRegistrationConsistency,
  evaluateSmokeControl,
} from './evaluators.ts';

function company(
  overrides: Partial<CompanyProfile> = {},
): CompanyProfile {
  return {
    fiscalMonth: 3,
    consumptionTaxStatus: 'taxable',
    invoiceRegistrationStatus: 'registered',
    ...overrides,
  } as CompanyProfile;
}

function entry(
  id: string,
  overrides: Partial<TaxReturnEntry> = {},
): TaxReturnEntry {
  return {
    id,
    fiscalYear: '2026年3月期',
    fiscalYearStartDate: '2025-04-01',
    fiscalYearEndDate: '2026-03-31',
    filedDate: '2026-05-31',
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
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
    ...overrides,
  };
}

function profile(entries: TaxReturnEntry[]): TaxReturnProfile {
  return { entries };
}

test('TI_DATA_001: 重複なしはPASS', () => {
  const result = evaluateDuplicateFiscalPeriod({
    companyProfile: company(),
    taxReturnProfile: profile([
      entry('1', { fiscalYearEndDate: '2025-03-31' }),
      entry('2', { fiscalYearEndDate: '2026-03-31' }),
    ]),
  });

  assert.equal(result.status, 'pass');
});

test('TI_DATA_001: 同じ決算期末日はREVIEW', () => {
  const result = evaluateDuplicateFiscalPeriod({
    companyProfile: company(),
    taxReturnProfile: profile([
      entry('1'),
      entry('2'),
    ]),
  });

  assert.equal(result.status, 'review');
});

test('TI_DATA_001: 申告実績0件は対象外', () => {
  const result = evaluateDuplicateFiscalPeriod({
    companyProfile: company(),
    taxReturnProfile: profile([]),
  });

  assert.equal(result.applicable, false);
  assert.equal(result.status, null);
});

test('TI_DATA_002: 正しい日付順序はPASS', () => {
  const result = evaluateFiscalDateOrder({
    companyProfile: company(),
    taxReturnProfile: profile([entry('1')]),
  });

  assert.equal(result.status, 'pass');
});

test('TI_DATA_002: endよりfiledが前ならREVIEW', () => {
  const result = evaluateFiscalDateOrder({
    companyProfile: company(),
    taxReturnProfile: profile([
      entry('1', { filedDate: '2026-03-01' }),
    ]),
  });

  assert.equal(result.status, 'review');
});

test('TI_DATA_002: 必要日付不足はUNKNOWN', () => {
  const result = evaluateFiscalDateOrder({
    companyProfile: company(),
    taxReturnProfile: profile([
      entry('1', { fiscalYearStartDate: null }),
    ]),
  });

  assert.equal(result.status, 'unknown');
});

test('TI_STATE_001: 消費税状態不一致はREVIEW', () => {
  const result = evaluateConsumptionTaxStateConsistency({
    companyProfile: company({
      consumptionTaxStatus: 'exempt',
    }),
    taxReturnProfile: profile([
      entry('1', {
        consumptionTaxStatus: 'taxable',
      }),
    ]),
  });

  assert.equal(result.status, 'review');
});

test('TI_STATE_001: 最新申告なしはUNKNOWN', () => {
  const result = evaluateConsumptionTaxStateConsistency({
    companyProfile: company(),
    taxReturnProfile: profile([]),
  });

  assert.equal(result.status, 'unknown');
});

test('TI_STATE_002: インボイス状態不一致はREVIEW', () => {
  const result = evaluateInvoiceRegistrationConsistency({
    companyProfile: company({
      invoiceRegistrationStatus: 'not_registered',
    }),
    taxReturnProfile: profile([
      entry('1', {
        invoiceRegistrationStatus: 'registered',
      }),
    ]),
  });

  assert.equal(result.status, 'review');
});

test('TI_STATE_003: 決算月一致はPASS', () => {
  const result = evaluateFiscalMonthConsistency({
    companyProfile: company({
      fiscalMonth: 3,
    }),
    taxReturnProfile: profile([
      entry('1', {
        fiscalYearEndDate: '2026-03-31',
      }),
    ]),
  });

  assert.equal(result.status, 'pass');
});

test('TI_STATE_003: 決算月不一致はREVIEW', () => {
  const result = evaluateFiscalMonthConsistency({
    companyProfile: company({
      fiscalMonth: 12,
    }),
    taxReturnProfile: profile([
      entry('1', {
        fiscalYearEndDate: '2026-03-31',
      }),
    ]),
  });

  assert.equal(result.status, 'review');
});

test('TI_STATE_003: 決算月未設定はUNKNOWN', () => {
  const result = evaluateFiscalMonthConsistency({
    companyProfile: company({
      fiscalMonth: null,
    }),
    taxReturnProfile: profile([
      entry('1'),
    ]),
  });

  assert.equal(result.status, 'unknown');
});

test('state系Controlは最新決算期を使う', () => {
  const result = evaluateConsumptionTaxStateConsistency({
    companyProfile: company({
      consumptionTaxStatus: 'taxable',
    }),
    taxReturnProfile: profile([
      entry('new', {
        fiscalYearEndDate: '2026-03-31',
        consumptionTaxStatus: 'taxable',
      }),
      entry('old', {
        fiscalYearEndDate: '2025-03-31',
        consumptionTaxStatus: 'exempt',
      }),
    ]),
  });

  assert.equal(result.status, 'pass');
});

test('evaluator_key registryからEvaluatorを実行できる', () => {
  const result = evaluateSmokeControl(
    SMOKE_CONTROL_EVALUATOR_KEYS.TI_STATE_003,
    {
      companyProfile: company({
        fiscalMonth: 3,
      }),
      taxReturnProfile: profile([
        entry('1'),
      ]),
    },
  );

  assert.equal(result.status, 'pass');
  assert.equal(
    result.evaluatorVersion,
    'ti-0.5-smoke-v1',
  );
  assert.deepEqual(
    result.sourceVersionSnapshot,
    [],
  );
});
