import type { CorporateType } from './types';
import type {
  AdvisorPresence, CompanyProfile, CompanyStage, ConsumptionTaxInterimFrequency, ConsumptionTaxStatus,
  InterimFilingStatus, InvoiceRegistrationStatus, LocalTaxCollectionMethod,
  ResidentTaxPaymentCycle, TaxationMethod, WithholdingTaxCycle,
} from './companyProfile';

// ── Company Workspace — CompanyProfile境界変換（Sprint 23 Phase23.2）─────
// workspace_companies / workspace_company_profiles（Sprint22.4 MVP migration）のDB行と、
// 既存の CompanyProfile 型（src/lib/companyProfile.ts）を相互変換する境界関数。
// docs/WORKSPACE_DB_DESIGN.md 14節の設計をコード化したもの。CompanyProfile型自体・
// 既存Engine（診断エンジン・Rule Engine・AI参謀等）は一切変更しない。
//
// 法人種別・決算月は workspace_companies に、それ以外の税務・労務の詳細は
// workspace_company_profiles に分かれている（Sprint22.4 migration schema）ため、
// 更新payloadも2テーブル分に分けて返す。

export type WorkspaceCompanyRow = {
  id: number;
  name: string;
  prefecture_code: string;
  municipality_code: string;
  corporate_type: string;
  fiscal_month: number | null;
};

export type WorkspaceCompanyProfileRow = {
  company_id: number;
  employee_count: number;
  capital: number | null;
  established_date: string | null;
  stage: string;
  consumption_tax_status: string;
  invoice_registration_status: string;
  taxation_method: string | null;
  corporate_tax_interim_filing: string;
  consumption_tax_interim_frequency: string;
  withholding_tax_cycle: string;
  local_tax_collection_method: string;
  resident_tax_payment_cycle: string;
  next_officer_change_date: string | null;
  address: string | null;
  e_tax_enabled: boolean;
  e_ltax_enabled: boolean;
  advisors: AdvisorPresence;
};

// company_id分の行がまだ無い会社（workspace_companiesへの登録直後等）向けのデフォルト値。
// src/lib/companyProfile.ts の PROFILE_DEFAULTS と同じ値に揃える。
const DEFAULT_PROFILE_FIELDS: Omit<WorkspaceCompanyProfileRow, 'company_id'> = {
  employee_count: 0,
  capital: null,
  established_date: null,
  stage: 'pre_establishment',
  consumption_tax_status: 'exempt',
  invoice_registration_status: 'not_registered',
  taxation_method: null,
  corporate_tax_interim_filing: 'none',
  consumption_tax_interim_frequency: 'none',
  withholding_tax_cycle: 'unset',
  local_tax_collection_method: 'special_collection',
  resident_tax_payment_cycle: 'unknown',
  next_officer_change_date: null,
  address: null,
  e_tax_enabled: false,
  e_ltax_enabled: false,
  advisors: {
    taxAccountant: false,
    laborConsultant: false,
    judicialScrivener: false,
    administrativeScrivener: false,
  },
};

// DB行 → CompanyProfile（読み取り）。profileRowがまだ存在しない会社（登録直後等）はデフォルト値を使う。
export function workspaceRowsToCompanyProfile(
  company: WorkspaceCompanyRow,
  profile: WorkspaceCompanyProfileRow | null,
  prefectureName: string,
  municipalityName: string,
): CompanyProfile {
  const p = profile ?? DEFAULT_PROFILE_FIELDS;
  return {
    prefectureCode: company.prefecture_code,
    prefectureName,
    municipalityCode: company.municipality_code,
    municipalityName,
    corporateType: company.corporate_type as CorporateType,
    employeeCount: p.employee_count,
    capital: p.capital,
    establishedDate: p.established_date,
    fiscalMonth: company.fiscal_month,
    stage: p.stage as CompanyStage,
    consumptionTaxStatus: p.consumption_tax_status as ConsumptionTaxStatus,
    invoiceRegistrationStatus: p.invoice_registration_status as InvoiceRegistrationStatus,
    taxationMethod: p.taxation_method as TaxationMethod | null,
    corporateTaxInterimFiling: p.corporate_tax_interim_filing as InterimFilingStatus,
    consumptionTaxInterimFrequency: p.consumption_tax_interim_frequency as ConsumptionTaxInterimFrequency,
    withholdingTaxCycle: p.withholding_tax_cycle as WithholdingTaxCycle,
    localTaxCollectionMethod: p.local_tax_collection_method as LocalTaxCollectionMethod,
    residentTaxPaymentCycle: p.resident_tax_payment_cycle as ResidentTaxPaymentCycle,
    nextOfficerChangeDate: p.next_officer_change_date,
    address: p.address,
    eTaxEnabled: p.e_tax_enabled,
    eLTaxEnabled: p.e_ltax_enabled,
    advisors: p.advisors,
  };
}

export type WorkspaceProfileUpdatePayload = {
  companyFields: { corporate_type: CorporateType; fiscal_month: number | null };
  profileFields: Omit<WorkspaceCompanyProfileRow, 'company_id'>;
};

// CompanyProfile → DB更新payload（書き込み）。workspace_companies分とworkspace_company_profiles分に分ける。
export function companyProfileToWorkspaceUpdatePayload(profile: CompanyProfile): WorkspaceProfileUpdatePayload {
  return {
    companyFields: {
      corporate_type: profile.corporateType,
      fiscal_month: profile.fiscalMonth,
    },
    profileFields: {
      employee_count: profile.employeeCount,
      capital: profile.capital,
      established_date: profile.establishedDate,
      stage: profile.stage,
      consumption_tax_status: profile.consumptionTaxStatus,
      invoice_registration_status: profile.invoiceRegistrationStatus,
      taxation_method: profile.taxationMethod,
      corporate_tax_interim_filing: profile.corporateTaxInterimFiling,
      consumption_tax_interim_frequency: profile.consumptionTaxInterimFrequency,
      withholding_tax_cycle: profile.withholdingTaxCycle,
      local_tax_collection_method: profile.localTaxCollectionMethod,
      resident_tax_payment_cycle: profile.residentTaxPaymentCycle,
      next_officer_change_date: profile.nextOfficerChangeDate,
      address: profile.address,
      e_tax_enabled: profile.eTaxEnabled,
      e_ltax_enabled: profile.eLTaxEnabled,
      advisors: profile.advisors,
    },
  };
}
