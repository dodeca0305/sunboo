export const NEW_CORPORATION_CAPITAL_THRESHOLD = 10_000_000;

export function isConsumptionTaxReturnRequiredByCapital(capitalAmount?: number): boolean {
  return typeof capitalAmount === 'number' &&
    Number.isSafeInteger(capitalAmount) &&
    capitalAmount >= NEW_CORPORATION_CAPITAL_THRESHOLD;
}

export function isConsumptionTaxReturnRequired({
  capitalAmount,
  isInvoiceRegistered,
}: {
  capitalAmount?: number;
  isInvoiceRegistered?: boolean;
}): boolean {
  return isInvoiceRegistered === true || isConsumptionTaxReturnRequiredByCapital(capitalAmount);
}
