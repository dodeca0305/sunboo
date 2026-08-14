import type { TaxReturnEntry } from '../taxReturnProfile';
import type {
  ProductionTaxControlEvaluation,
  ProductionTaxControlEvaluator,
  ProductionTaxControlInput,
  TaxSourceVersionSnapshot,
} from './types';

export const PRODUCTION_CONTROL_EVALUATOR_VERSION =
  'ti-0.8-production-v1';

export const PRODUCTION_CONTROL_EVALUATOR_KEYS = {
  TI_TAX_001:
    'tax-intelligence/corporate-tax-filing-baseline-deadline',
} as const;

export type ProductionControlCode =
  keyof typeof PRODUCTION_CONTROL_EVALUATOR_KEYS;

export type ProductionControlEvaluatorKey =
  (typeof PRODUCTION_CONTROL_EVALUATOR_KEYS)[ProductionControlCode];

export const E_GOV_CORPORATE_TAX_FILING_SOURCE_VERSION_SNAPSHOT:
  TaxSourceVersionSnapshot = {
    provider: 'e_gov',
    canonicalLocator:
      'egov:law:340AC0000000034:articles-74-75-3',
    versionLabel:
      '340AC0000000034_20260812_508AC0000000064',
    contentHash:
      'ad289727a57263365d1e64d3931f7f0960e2501384c6da22fead723334474183',
  };

export const NTA_C1_1_SOURCE_VERSION_SNAPSHOT: TaxSourceVersionSnapshot = {
  provider: 'nta',
  canonicalLocator:
    'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/hojin/shinkoku/01.htm',
  versionLabel: 'manual-seed-2026-08-13',
  contentHash:
    'bb1824ef6cb588a16f2cf2047c021f79ea5dce8136d94f52397a18d744053cc5',
};

export const PRODUCTION_CONTROL_SOURCE_VERSION_SNAPSHOT:
  TaxSourceVersionSnapshot[] = [
    E_GOV_CORPORATE_TAX_FILING_SOURCE_VERSION_SNAPSHOT,
    NTA_C1_1_SOURCE_VERSION_SNAPSHOT,
  ];

export const TI_TAX_001_EFFECTIVE_FROM = '2023-04-01';

function result(
  values: Omit<
    ProductionTaxControlEvaluation,
    'sourceVersionSnapshot' | 'evaluatorVersion'
  >,
): ProductionTaxControlEvaluation {
  return {
    ...values,
    sourceVersionSnapshot: PRODUCTION_CONTROL_SOURCE_VERSION_SNAPSHOT,
    evaluatorVersion: PRODUCTION_CONTROL_EVALUATOR_VERSION,
  };
}

type IsoDateParts = {
  year: number;
  month: number;
  day: number;
};

function parseIsoDate(value: string | null): IsoDateParts | null {
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

  return { year, month, day };
}

function formatIsoDate(parts: IsoDateParts): string {
  return [
    String(parts.year).padStart(4, '0'),
    String(parts.month).padStart(2, '0'),
    String(parts.day).padStart(2, '0'),
  ].join('-');
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addCalendarMonths(
  isoDate: string,
  monthsToAdd: number,
): string | null {
  const source = parseIsoDate(isoDate);
  if (!source) return null;

  const zeroBasedTargetMonth =
    source.year * 12 + (source.month - 1) + monthsToAdd;

  const targetYear = Math.floor(zeroBasedTargetMonth / 12);
  const targetMonth = (zeroBasedTargetMonth % 12) + 1;

  const sourceMonthEnd =
    source.day === daysInMonth(source.year, source.month);

  const targetDay = sourceMonthEnd
    ? daysInMonth(targetYear, targetMonth)
    : Math.min(source.day, daysInMonth(targetYear, targetMonth));

  return formatIsoDate({
    year: targetYear,
    month: targetMonth,
    day: targetDay,
  });
}

function latestTaxReturnEntry(
  entries: TaxReturnEntry[],
): TaxReturnEntry | null {
  if (entries.length === 0) return null;

  return entries.reduce((latest, entry) =>
    entry.fiscalYearEndDate.localeCompare(latest.fiscalYearEndDate) > 0
      ? entry
      : latest,
  );
}

export const evaluateCorporateTaxFilingBaselineDeadline:
  ProductionTaxControlEvaluator = ({
    taxReturnProfile,
    corporateTaxFilingContext,
  }) => {
    const latest = latestTaxReturnEntry(taxReturnProfile.entries);

    if (!latest) {
      return result({
        applicable: false,
        status: null,
        reasonCode: 'no_tax_return_entries',
        reasonSummary:
          '申告実績がないため、法人税確定申告の提出時期確認の対象外です。',
        observedInputs: {
          latestTaxReturn: null,
        },
      });
    }

    const fiscalYearEnd = parseIsoDate(latest.fiscalYearEndDate);

    if (!fiscalYearEnd) {
      return result({
        applicable: true,
        status: 'unknown',
        reasonCode: 'fiscal_year_end_date_invalid',
        reasonSummary:
          '決算期末日が不正なため、法人税確定申告の提出時期を判定できません。',
        observedInputs: {
          entryId: latest.id,
          fiscalYearEndDate: latest.fiscalYearEndDate,
          filedDate: latest.filedDate,
        },
      });
    }

    if (latest.fiscalYearEndDate < TI_TAX_001_EFFECTIVE_FROM) {
      return result({
        applicable: false,
        status: null,
        reasonCode: 'outside_verified_source_effective_period',
        reasonSummary:
          '検証済みの法令SourceVersion適用範囲より前の決算期のため、このControlでは判定しません。',
        observedInputs: {
          entryId: latest.id,
          fiscalYearEndDate: latest.fiscalYearEndDate,
          filedDate: latest.filedDate,
          verifiedSourceEffectiveFrom: TI_TAX_001_EFFECTIVE_FROM,
        },
      });
    }

    const liquidationResidualAssetsCase =
      corporateTaxFilingContext?.liquidationResidualAssetsCase ??
      'unknown';

    if (liquidationResidualAssetsCase === 'unknown') {
      return result({
        applicable: true,
        status: 'unknown',
        reasonCode:
          'liquidation_residual_assets_case_unknown',
        reasonSummary:
          '清算中の残余財産確定に関する特則の該当有無が未確認のため、原則2か月期限をPASS判定に使用しません。',
        observedInputs: {
          entryId: latest.id,
          fiscalYearEndDate: latest.fiscalYearEndDate,
          filedDate: latest.filedDate,
          liquidationResidualAssetsCase,
        },
      });
    }

    if (liquidationResidualAssetsCase === 'applicable') {
      return result({
        applicable: true,
        status: 'unknown',
        reasonCode:
          'liquidation_residual_assets_special_case_requires_evaluation',
        reasonSummary:
          '清算中の残余財産確定に関する特則が該当するため、TI_TAX_001 v1の原則2か月Evaluatorでは判定しません。',
        observedInputs: {
          entryId: latest.id,
          fiscalYearEndDate: latest.fiscalYearEndDate,
          filedDate: latest.filedDate,
          liquidationResidualAssetsCase,
        },
      });
    }

    const baselineDueDate = addCalendarMonths(
      latest.fiscalYearEndDate,
      2,
    );

    if (!baselineDueDate) {
      return result({
        applicable: true,
        status: 'unknown',
        reasonCode: 'baseline_due_date_unavailable',
        reasonSummary:
          '原則2か月の基準日を算出できないため判定できません。',
        observedInputs: {
          entryId: latest.id,
          fiscalYearEndDate: latest.fiscalYearEndDate,
          filedDate: latest.filedDate,
        },
      });
    }

    if (latest.filedDate === null) {
      return result({
        applicable: true,
        status: 'unknown',
        reasonCode: 'corporate_tax_filed_date_missing',
        reasonSummary:
          '申告日が未入力のため、法人税確定申告の提出時期を判定できません。',
        observedInputs: {
          entryId: latest.id,
          fiscalYearEndDate: latest.fiscalYearEndDate,
          filedDate: null,
          baselineDueDate,
        },
      });
    }

    const filed = parseIsoDate(latest.filedDate);

    if (!filed) {
      return result({
        applicable: true,
        status: 'unknown',
        reasonCode: 'corporate_tax_filed_date_invalid',
        reasonSummary:
          '申告日が不正なため、法人税確定申告の提出時期を判定できません。',
        observedInputs: {
          entryId: latest.id,
          fiscalYearEndDate: latest.fiscalYearEndDate,
          filedDate: latest.filedDate,
          baselineDueDate,
        },
      });
    }

    if (latest.filedDate < latest.fiscalYearEndDate) {
      return result({
        applicable: true,
        status: 'unknown',
        reasonCode: 'corporate_tax_filed_before_period_end',
        reasonSummary:
          '申告日が決算期末日より前のため、このControlでは提出時期を判定できません。',
        observedInputs: {
          entryId: latest.id,
          fiscalYearEndDate: latest.fiscalYearEndDate,
          filedDate: latest.filedDate,
          baselineDueDate,
        },
      });
    }

    if (latest.filedDate <= baselineDueDate) {
      return result({
        applicable: true,
        status: 'pass',
        reasonCode: 'corporate_tax_filed_within_baseline_period',
        reasonSummary:
          '申告日は、事業年度終了後の原則2か月の基準日以内です。',
        observedInputs: {
          entryId: latest.id,
          fiscalYearEndDate: latest.fiscalYearEndDate,
          filedDate: latest.filedDate,
          baselineDueDate,
        },
      });
    }

    return result({
      applicable: true,
      status: 'unknown',
      reasonCode:
        'corporate_tax_filing_after_baseline_needs_exception_check',
      reasonSummary:
        '申告日は原則2か月の基準日後ですが、申告期限延長や休日等の情報をSUNBOOが保持していないため、期限超過とは判定しません。',
      observedInputs: {
        entryId: latest.id,
        fiscalYearEndDate: latest.fiscalYearEndDate,
        filedDate: latest.filedDate,
        baselineDueDate,
        filingDeadlineExtensionKnown: false,
        holidayAdjustmentEvaluated: false,
      },
    });
  };

export const PRODUCTION_CONTROL_EVALUATORS: Readonly<
  Record<
    ProductionControlEvaluatorKey,
    ProductionTaxControlEvaluator
  >
> = {
  [PRODUCTION_CONTROL_EVALUATOR_KEYS.TI_TAX_001]:
    evaluateCorporateTaxFilingBaselineDeadline,
};

export function evaluateProductionTaxControl(
  evaluatorKey: ProductionControlEvaluatorKey,
  input: ProductionTaxControlInput,
): ProductionTaxControlEvaluation {
  return PRODUCTION_CONTROL_EVALUATORS[evaluatorKey](input);
}
