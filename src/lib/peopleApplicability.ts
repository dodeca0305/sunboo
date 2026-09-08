const OFFICER_COMPENSATION_CODES = new Set([
  'PAYROLL_OFFICE_OPEN',
  'WITHHOLDING_TAX',
  'SOCIAL_INS_SANTEIKISO',
  'YEAR_END_ADJUSTMENT',
  'SALARY_PAYMENT_REPORT',
  'RESIDENT_TAX_WITHHOLDING',
  'WITHHOLDING_SPECIAL_EXCEPTION',
]);

export function isProcedureApplicableByPeople(params: {
  code: string;
  requiresEmployees: boolean;
  hasEmployees: boolean;
  paysOfficerCompensation: boolean;
  hasEmploymentInsuranceEligibleEmployee?: boolean;
  hasSocialInsuranceEligibleEmployee?: boolean;
}): boolean {
  const {
    code,
    requiresEmployees,
    hasEmployees,
    paysOfficerCompensation,
    hasEmploymentInsuranceEligibleEmployee,
    hasSocialInsuranceEligibleEmployee,
  } = params;

  if (code === 'SOCIAL_INS_NEW') {
    return hasEmployees || paysOfficerCompensation;
  }
  if (code === 'EMPLOY_INS_OFFICE') {
    return hasEmploymentInsuranceEligibleEmployee ?? hasEmployees;
  }
  if (code === 'EMPLOY_INS_QUALIFICATION') {
    return hasEmploymentInsuranceEligibleEmployee ?? hasEmployees;
  }
  if (code === 'SOCIAL_INS_QUALIFICATION') {
    return hasSocialInsuranceEligibleEmployee ?? hasEmployees;
  }
  if (!requiresEmployees) return true;
  if (hasEmployees) return true;
  return paysOfficerCompensation && OFFICER_COMPENSATION_CODES.has(code);
}

export function isWithholdingSpecialExceptionApplicable(payrollRecipientCount?: number): boolean {
  return typeof payrollRecipientCount === 'number' &&
    Number.isInteger(payrollRecipientCount) &&
    payrollRecipientCount > 0 &&
    payrollRecipientCount < 10;
}
