import type { CompanyProfile } from '../companyProfile';
import type { TaxReturnProfile } from '../taxReturnProfile';

export type TaxControlResultStatus = 'pass' | 'review' | 'unknown';

export type SmokeControlObservedInputs = Record<string, unknown>;

export type SmokeControlEvaluation = {
  applicable: boolean;
  status: TaxControlResultStatus | null;
  reasonCode: string;
  reasonSummary: string;
  observedInputs: SmokeControlObservedInputs;
  sourceVersionSnapshot: [];
  evaluatorVersion: string;
};

export type SmokeControlInput = {
  companyProfile: CompanyProfile;
  taxReturnProfile: TaxReturnProfile;
};

export type SmokeControlEvaluator = (
  input: SmokeControlInput,
) => SmokeControlEvaluation;
