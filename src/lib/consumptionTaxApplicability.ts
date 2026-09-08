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
}: {
  capitalAmount?: number;
  isInvoiceRegistered?: boolean;
  isConsumptionTaxElectionEffective?: boolean;
}): boolean {
  return isInvoiceRegistered === true ||
    isConsumptionTaxElectionEffective === true ||
    isConsumptionTaxReturnRequiredByCapital(capitalAmount);
}
