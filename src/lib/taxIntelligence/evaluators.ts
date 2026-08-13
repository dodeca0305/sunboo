import type { TaxReturnEntry } from '../taxReturnProfile';
import type {
  SmokeControlEvaluation,
  SmokeControlEvaluator,
  SmokeControlInput,
} from './types';

export const SMOKE_CONTROL_EVALUATOR_VERSION = 'ti-0.5-smoke-v1';

export const SMOKE_CONTROL_EVALUATOR_KEYS = {
  TI_DATA_001: 'tax-intelligence/duplicate-fiscal-period',
  TI_DATA_002: 'tax-intelligence/fiscal-date-order',
  TI_STATE_001: 'tax-intelligence/consumption-tax-state-consistency',
  TI_STATE_002: 'tax-intelligence/invoice-registration-consistency',
  TI_STATE_003: 'tax-intelligence/fiscal-month-consistency',
} as const;

export type SmokeControlCode = keyof typeof SMOKE_CONTROL_EVALUATOR_KEYS;
export type SmokeControlEvaluatorKey =
  (typeof SMOKE_CONTROL_EVALUATOR_KEYS)[SmokeControlCode];

function result(
  values: Omit<SmokeControlEvaluation, 'sourceVersionSnapshot' | 'evaluatorVersion'>,
): SmokeControlEvaluation {
  return {
    ...values,
    sourceVersionSnapshot: [],
    evaluatorVersion: SMOKE_CONTROL_EVALUATOR_VERSION,
  };
}

function latestTaxReturnEntry(entries: TaxReturnEntry[]): TaxReturnEntry | null {
  if (entries.length === 0) return null;

  return entries.reduce((latest, entry) =>
    entry.fiscalYearEndDate.localeCompare(latest.fiscalYearEndDate) > 0
      ? entry
      : latest,
  );
}

function parseIsoDate(value: string | null): number | null {
  if (!value) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date.getTime();
}

function isoMonth(value: string): number | null {
  const timestamp = parseIsoDate(value);
  if (timestamp === null) return null;
  return new Date(timestamp).getUTCMonth() + 1;
}

export const evaluateDuplicateFiscalPeriod: SmokeControlEvaluator = ({
  taxReturnProfile,
}) => {
  const fiscalYearEndDates = taxReturnProfile.entries.map(
    (entry) => entry.fiscalYearEndDate,
  );

  if (fiscalYearEndDates.length === 0) {
    return result({
      applicable: false,
      status: null,
      reasonCode: 'no_tax_return_entries',
      reasonSummary: '申告実績がないため、決算期重複の判定対象外です。',
      observedInputs: { fiscalYearEndDates },
    });
  }

  const counts = new Map<string, number>();
  for (const fiscalYearEndDate of fiscalYearEndDates) {
    counts.set(
      fiscalYearEndDate,
      (counts.get(fiscalYearEndDate) ?? 0) + 1,
    );
  }

  const duplicateFiscalYearEndDates = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([fiscalYearEndDate]) => fiscalYearEndDate)
    .sort();

  if (duplicateFiscalYearEndDates.length > 0) {
    return result({
      applicable: true,
      status: 'review',
      reasonCode: 'duplicate_fiscal_period',
      reasonSummary: `同じ決算期末日の申告実績が重複しています: ${duplicateFiscalYearEndDates.join(', ')}`,
      observedInputs: {
        fiscalYearEndDates,
        duplicateFiscalYearEndDates,
      },
    });
  }

  return result({
    applicable: true,
    status: 'pass',
    reasonCode: 'fiscal_period_unique',
    reasonSummary: '同じ決算期末日の申告実績に重複はありません。',
    observedInputs: { fiscalYearEndDates },
  });
};

export const evaluateFiscalDateOrder: SmokeControlEvaluator = ({
  taxReturnProfile,
}) => {
  const observedEntries = taxReturnProfile.entries.map((entry) => ({
    id: entry.id,
    fiscalYearStartDate: entry.fiscalYearStartDate,
    fiscalYearEndDate: entry.fiscalYearEndDate,
    filedDate: entry.filedDate,
  }));

  if (observedEntries.length === 0) {
    return result({
      applicable: false,
      status: null,
      reasonCode: 'no_tax_return_entries',
      reasonSummary: '申告実績がないため、日付順序の判定対象外です。',
      observedInputs: { entries: observedEntries },
    });
  }

  const invalidEntryIds: string[] = [];
  const unknownEntryIds: string[] = [];

  for (const entry of taxReturnProfile.entries) {
    const start = parseIsoDate(entry.fiscalYearStartDate);
    const end = parseIsoDate(entry.fiscalYearEndDate);
    const filed = parseIsoDate(entry.filedDate);

    if (start === null || end === null || filed === null) {
      unknownEntryIds.push(entry.id);
      continue;
    }

    if (!(start <= end && end <= filed)) {
      invalidEntryIds.push(entry.id);
    }
  }

  if (invalidEntryIds.length > 0) {
    return result({
      applicable: true,
      status: 'review',
      reasonCode: 'fiscal_date_order_invalid',
      reasonSummary: `決算期間または申告日の日付順序に矛盾があります: ${invalidEntryIds.join(', ')}`,
      observedInputs: {
        entries: observedEntries,
        invalidEntryIds,
        unknownEntryIds,
      },
    });
  }

  if (unknownEntryIds.length > 0) {
    return result({
      applicable: true,
      status: 'unknown',
      reasonCode: 'fiscal_date_order_input_missing',
      reasonSummary: `日付不足または不正な日付のため判定できない申告実績があります: ${unknownEntryIds.join(', ')}`,
      observedInputs: {
        entries: observedEntries,
        invalidEntryIds,
        unknownEntryIds,
      },
    });
  }

  return result({
    applicable: true,
    status: 'pass',
    reasonCode: 'fiscal_date_order_consistent',
    reasonSummary: '決算開始日、決算終了日、申告日の順序に矛盾はありません。',
    observedInputs: { entries: observedEntries },
  });
};

export const evaluateConsumptionTaxStateConsistency: SmokeControlEvaluator = ({
  companyProfile,
  taxReturnProfile,
}) => {
  const latest = latestTaxReturnEntry(taxReturnProfile.entries);

  const observedInputs = {
    companyProfile: {
      consumptionTaxStatus: companyProfile.consumptionTaxStatus,
    },
    latestTaxReturn: latest
      ? {
          id: latest.id,
          fiscalYearEndDate: latest.fiscalYearEndDate,
          consumptionTaxStatus: latest.consumptionTaxStatus,
        }
      : null,
  };

  if (!latest) {
    return result({
      applicable: true,
      status: 'unknown',
      reasonCode: 'latest_tax_return_missing',
      reasonSummary: '最新の申告実績がないため、消費税状態を比較できません。',
      observedInputs,
    });
  }

  if (companyProfile.consumptionTaxStatus !== latest.consumptionTaxStatus) {
    return result({
      applicable: true,
      status: 'review',
      reasonCode: 'consumption_tax_state_mismatch',
      reasonSummary: 'CompanyProfileと最新TaxReturnProfileの消費税状態が一致しません。',
      observedInputs,
    });
  }

  return result({
    applicable: true,
    status: 'pass',
    reasonCode: 'consumption_tax_state_consistent',
    reasonSummary: 'CompanyProfileと最新TaxReturnProfileの消費税状態は一致しています。',
    observedInputs,
  });
};

export const evaluateInvoiceRegistrationConsistency: SmokeControlEvaluator = ({
  companyProfile,
  taxReturnProfile,
}) => {
  const latest = latestTaxReturnEntry(taxReturnProfile.entries);

  const observedInputs = {
    companyProfile: {
      invoiceRegistrationStatus: companyProfile.invoiceRegistrationStatus,
    },
    latestTaxReturn: latest
      ? {
          id: latest.id,
          fiscalYearEndDate: latest.fiscalYearEndDate,
          invoiceRegistrationStatus: latest.invoiceRegistrationStatus,
        }
      : null,
  };

  if (!latest) {
    return result({
      applicable: true,
      status: 'unknown',
      reasonCode: 'latest_tax_return_missing',
      reasonSummary: '最新の申告実績がないため、インボイス登録状態を比較できません。',
      observedInputs,
    });
  }

  if (
    companyProfile.invoiceRegistrationStatus !==
    latest.invoiceRegistrationStatus
  ) {
    return result({
      applicable: true,
      status: 'review',
      reasonCode: 'invoice_registration_state_mismatch',
      reasonSummary: 'CompanyProfileと最新TaxReturnProfileのインボイス登録状態が一致しません。',
      observedInputs,
    });
  }

  return result({
    applicable: true,
    status: 'pass',
    reasonCode: 'invoice_registration_state_consistent',
    reasonSummary: 'CompanyProfileと最新TaxReturnProfileのインボイス登録状態は一致しています。',
    observedInputs,
  });
};

export const evaluateFiscalMonthConsistency: SmokeControlEvaluator = ({
  companyProfile,
  taxReturnProfile,
}) => {
  const latest = latestTaxReturnEntry(taxReturnProfile.entries);
  const latestFiscalMonth = latest
    ? isoMonth(latest.fiscalYearEndDate)
    : null;

  const observedInputs = {
    companyProfile: {
      fiscalMonth: companyProfile.fiscalMonth,
    },
    latestTaxReturn: latest
      ? {
          id: latest.id,
          fiscalYearEndDate: latest.fiscalYearEndDate,
          fiscalMonth: latestFiscalMonth,
        }
      : null,
  };

  if (!latest) {
    return result({
      applicable: true,
      status: 'unknown',
      reasonCode: 'latest_tax_return_missing',
      reasonSummary: '最新の申告実績がないため、決算月を比較できません。',
      observedInputs,
    });
  }

  if (companyProfile.fiscalMonth === null || latestFiscalMonth === null) {
    return result({
      applicable: true,
      status: 'unknown',
      reasonCode: 'fiscal_month_input_missing',
      reasonSummary: '決算月または最新申告実績の決算日が不足・不正なため比較できません。',
      observedInputs,
    });
  }

  if (companyProfile.fiscalMonth !== latestFiscalMonth) {
    return result({
      applicable: true,
      status: 'review',
      reasonCode: 'fiscal_month_mismatch',
      reasonSummary: 'Workspace会社情報の決算月と最新TaxReturnProfileの決算日の月が一致しません。',
      observedInputs,
    });
  }

  return result({
    applicable: true,
    status: 'pass',
    reasonCode: 'fiscal_month_consistent',
    reasonSummary: 'Workspace会社情報の決算月と最新TaxReturnProfileの決算日の月は一致しています。',
    observedInputs,
  });
};

export const SMOKE_CONTROL_EVALUATORS: Readonly<
  Record<SmokeControlEvaluatorKey, SmokeControlEvaluator>
> = {
  [SMOKE_CONTROL_EVALUATOR_KEYS.TI_DATA_001]: evaluateDuplicateFiscalPeriod,
  [SMOKE_CONTROL_EVALUATOR_KEYS.TI_DATA_002]: evaluateFiscalDateOrder,
  [SMOKE_CONTROL_EVALUATOR_KEYS.TI_STATE_001]:
    evaluateConsumptionTaxStateConsistency,
  [SMOKE_CONTROL_EVALUATOR_KEYS.TI_STATE_002]:
    evaluateInvoiceRegistrationConsistency,
  [SMOKE_CONTROL_EVALUATOR_KEYS.TI_STATE_003]:
    evaluateFiscalMonthConsistency,
};

export function evaluateSmokeControl(
  evaluatorKey: SmokeControlEvaluatorKey,
  input: SmokeControlInput,
): SmokeControlEvaluation {
  return SMOKE_CONTROL_EVALUATORS[evaluatorKey](input);
}
