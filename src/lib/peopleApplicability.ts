const OFFICER_COMPENSATION_CODES = new Set([
  'PAYROLL_OFFICE_OPEN',
  'WITHHOLDING_TAX',
  'SOCIAL_INS_SANTEIKISO',
  'YEAR_END_ADJUSTMENT',
  'SALARY_PAYMENT_REPORT',
  'RESIDENT_TAX_WITHHOLDING',
]);

export function isProcedureApplicableByPeople(params: {
  code: string;
  requiresEmployees: boolean;
  hasEmployees: boolean;
  paysOfficerCompensation: boolean;
}): boolean {
  const { code, requiresEmployees, hasEmployees, paysOfficerCompensation } = params;

  if (code === 'SOCIAL_INS_NEW') {
    return hasEmployees || paysOfficerCompensation;
  }
  if (!requiresEmployees) return true;
  if (hasEmployees) return true;
  return paysOfficerCompensation && OFFICER_COMPENSATION_CODES.has(code);
}
