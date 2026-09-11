export const NEW_CORPORATION_CAPITAL_THRESHOLD = 10_000_000;

export function isConsumptionTaxReturnRequiredByCapital(capitalAmount?: number): boolean {
  return typeof capitalAmount === 'number' &&
    Number.isSafeInteger(capitalAmount) &&
    capitalAmount >= NEW_CORPORATION_CAPITAL_THRESHOLD;
}

export function isConsumptionTaxReturnRequired({
  capitalAmount,
  isInvoiceRegistered,
  isConsumptionTaxElectionEffective,
  specificPeriodThresholdStatus,
  specifiedNewCorporationStatus,
  basePeriodTaxableSalesStatus,
  reorganizationTaxabilityStatus,
}: {
  capitalAmount?: number;
  isInvoiceRegistered?: boolean;
  isConsumptionTaxElectionEffective?: boolean;
  specificPeriodThresholdStatus?: 'both_over' | 'either_not_over' | 'not_applicable_or_unknown';
  specifiedNewCorporationStatus?: 'applies' | 'does_not_apply' | 'needs_review';
  basePeriodTaxableSalesStatus?: 'over_threshold' | 'at_or_below_threshold' | 'not_applicable' | 'unknown';
  reorganizationTaxabilityStatus?: 'none' | 'taxable_confirmed' | 'needs_review';
}): boolean {
  return isInvoiceRegistered === true ||
    isConsumptionTaxElectionEffective === true ||
    specificPeriodThresholdStatus === 'both_over' ||
    specifiedNewCorporationStatus === 'applies' ||
    basePeriodTaxableSalesStatus === 'over_threshold' ||
    reorganizationTaxabilityStatus === 'taxable_confirmed' ||
    isConsumptionTaxReturnRequiredByCapital(capitalAmount);
}
