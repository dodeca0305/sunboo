import type { CompanyProfile } from '../companyProfile';
import type { TaxReturnProfile } from '../taxReturnProfile';

export type TaxControlResultStatus = 'pass' | 'review' | 'unknown';

export type TaxControlObservedInputs = Record<string, unknown>;

export type TaxSourceVersionSnapshot = {
  provider: string;
  canonicalLocator: string;
  versionLabel: string | null;
  contentHash: string;
};

export type TaxControlEvaluation = {
  applicable: boolean;
  status: TaxControlResultStatus | null;
  reasonCode: string;
  reasonSummary: string;
  observedInputs: TaxControlObservedInputs;
  sourceVersionSnapshot: TaxSourceVersionSnapshot[];
  evaluatorVersion: string;
};

export type TaxControlInput = {
  companyProfile: CompanyProfile;
  taxReturnProfile: TaxReturnProfile;
};

export type TaxControlEvaluator = (
  input: TaxControlInput,
) => TaxControlEvaluation;

export type SmokeControlObservedInputs = TaxControlObservedInputs;
export type SmokeControlEvaluation = TaxControlEvaluation;
export type SmokeControlInput = TaxControlInput;
export type SmokeControlEvaluator = TaxControlEvaluator;

export type ProductionTaxControlEvaluation = TaxControlEvaluation;

export type CorporateTaxFilingContext = {
  liquidationResidualAssetsCase:
    | 'not_applicable'
    | 'applicable'
    | 'unknown';
};

export type ProductionTaxControlInput = TaxControlInput & {
  corporateTaxFilingContext?: CorporateTaxFilingContext;
};

export type ProductionTaxControlExecutionContext = {
  sourceVersionSnapshot: TaxSourceVersionSnapshot[];
};

export type ProductionTaxControlEvaluator = (
  input: ProductionTaxControlInput,
) => ProductionTaxControlEvaluation;
