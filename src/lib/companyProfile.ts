import type { CorporateType } from './types';
import type { ScheduleProcedure } from './scheduleProcedure';
import {
  consumptionTaxInterimFrequencyFromAmount, corporateTaxRequiresInterimFiling,
  getEntryTwoPeriodsAgo, getLatestEntry, isTaxableSalesAboveExemptionThreshold,
  type TaxReturnProfile,
} from './taxReturnProfile';

// ── Company Profile Engine（Sprint 14 Phase14.2）───────────────
// 会社ごとの税務・労務の実態を localStorage（'sunboo:company-profile'）に持ち、
// Rule Engine・AI参謀の判断材料として使う。DB変更なし・匿名モデル（既存の
// events.ts / src/app/(site)/events/page.tsx と同じ信頼モデル）を踏襲する。
//
// このキーは Phase2（経営イベントエンジン）から既に
// { prefectureCode, prefectureName, municipalityCode, municipalityName, corporateType, hasEmployees }
// という形で使われていた。CompanyProfile はこれを置き換える上位互換の型であり、
// loadCompanyProfile() が旧形式のデータも読み込めるようマイグレーションする。

export type CompanyStage = 'pre_establishment' | 'first_term' | 'second_term_or_later';

export type ConsumptionTaxStatus = 'exempt' | 'taxable';
export type InvoiceRegistrationStatus = 'registered' | 'not_registered';
export type TaxationMethod = 'principle' | 'simplified'; // 原則課税 / 簡易課税
export type InterimFilingStatus = 'none' | 'has'; // 法人税の中間申告 有無
export type ConsumptionTaxInterimFrequency = 'none' | '1' | '3' | '11';

export type WithholdingTaxCycle = 'monthly' | 'special_exception' | 'unset';
export type LocalTaxCollectionMethod = 'special_collection' | 'general_collection';

export type AdvisorPresence = {
  taxAccountant: boolean; // 税理士
  laborConsultant: boolean; // 社労士
  judicialScrivener: boolean; // 司法書士
  administrativeScrivener: boolean; // 行政書士
};

export type CompanyProfile = {
  // 基本情報（既存 sunboo:company-profile と互換）
  prefectureCode: string;
  prefectureName: string;
  municipalityCode: string;
  municipalityName: string;
  corporateType: CorporateType;
  employeeCount: number; // 旧 hasEmployees(boolean) を置き換える。hasEmployees(profile) で判定する
  capital: number | null; // 資本金（円）
  establishedDate: string | null; // ISO日付。設立予定の場合はnull許容
  fiscalMonth: number | null; // 1-12

  // 会社ステージ
  stage: CompanyStage;

  // 税務
  consumptionTaxStatus: ConsumptionTaxStatus;
  invoiceRegistrationStatus: InvoiceRegistrationStatus;
  taxationMethod: TaxationMethod | null;
  corporateTaxInterimFiling: InterimFilingStatus;
  consumptionTaxInterimFrequency: ConsumptionTaxInterimFrequency;

  // 源泉所得税
  withholdingTaxCycle: WithholdingTaxCycle;

  // 地方税
  localTaxCollectionMethod: LocalTaxCollectionMethod;

  // 電子申告
  eTaxEnabled: boolean;
  eLTaxEnabled: boolean;

  // 顧問
  advisors: AdvisorPresence;
};

const PROFILE_KEY = 'sunboo:company-profile';

const DEFAULT_ADVISORS: AdvisorPresence = {
  taxAccountant: false,
  laborConsultant: false,
  judicialScrivener: false,
  administrativeScrivener: false,
};

// 新規プロフィール作成時の初期値（多くの新設法人に当てはまる一般的な値）。
// 所在地・法人種別・従業員数など会社ごとに必ず異なる項目は含まない。
const PROFILE_DEFAULTS = {
  capital: null as number | null,
  establishedDate: null as string | null,
  fiscalMonth: null as number | null,
  stage: 'pre_establishment' as CompanyStage,
  consumptionTaxStatus: 'exempt' as ConsumptionTaxStatus,
  invoiceRegistrationStatus: 'not_registered' as InvoiceRegistrationStatus,
  taxationMethod: null as TaxationMethod | null,
  corporateTaxInterimFiling: 'none' as InterimFilingStatus,
  consumptionTaxInterimFrequency: 'none' as ConsumptionTaxInterimFrequency,
  withholdingTaxCycle: 'unset' as WithholdingTaxCycle,
  localTaxCollectionMethod: 'special_collection' as LocalTaxCollectionMethod,
  eTaxEnabled: false,
  eLTaxEnabled: false,
  advisors: DEFAULT_ADVISORS,
};

// 所在地・法人種別・従業員数（会社ごとに必須の情報）＋任意で他フィールドを上書きして
// 新規 CompanyProfile を組み立てる。/events（簡易フォーム）・/profile（詳細フォーム）の
// どちらからも同じ形の CompanyProfile を作れるようにする共通ヘルパー。
export function createCompanyProfile(
  base: Pick<
    CompanyProfile,
    'prefectureCode' | 'prefectureName' | 'municipalityCode' | 'municipalityName' | 'corporateType' | 'employeeCount'
  > &
    Partial<CompanyProfile>,
): CompanyProfile {
  return {
    ...PROFILE_DEFAULTS,
    ...base,
    advisors: { ...DEFAULT_ADVISORS, ...base.advisors },
  };
}

export function hasEmployees(profile: CompanyProfile): boolean {
  return profile.employeeCount > 0;
}

export function loadCompanyProfile(): CompanyProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed.prefectureCode || !parsed.municipalityCode || !parsed.corporateType) return null;

    // 旧形式（Phase2）は hasEmployees(boolean) のみを持ち employeeCount が無い。
    // 「従業員あり」の事実だけは保持し、正確な人数は /profile での入力を促す。
    const employeeCount =
      typeof parsed.employeeCount === 'number' ? parsed.employeeCount : parsed.hasEmployees ? 1 : 0;

    const advisorsRaw = (parsed.advisors as Partial<AdvisorPresence> | undefined) ?? {};

    return {
      prefectureCode: parsed.prefectureCode as string,
      prefectureName: (parsed.prefectureName as string) ?? '',
      municipalityCode: parsed.municipalityCode as string,
      municipalityName: (parsed.municipalityName as string) ?? '',
      corporateType: parsed.corporateType as CorporateType,
      employeeCount,
      capital: (parsed.capital as number | null | undefined) ?? PROFILE_DEFAULTS.capital,
      establishedDate: (parsed.establishedDate as string | null | undefined) ?? PROFILE_DEFAULTS.establishedDate,
      fiscalMonth: (parsed.fiscalMonth as number | null | undefined) ?? PROFILE_DEFAULTS.fiscalMonth,
      stage: (parsed.stage as CompanyStage | undefined) ?? PROFILE_DEFAULTS.stage,
      consumptionTaxStatus:
        (parsed.consumptionTaxStatus as ConsumptionTaxStatus | undefined) ?? PROFILE_DEFAULTS.consumptionTaxStatus,
      invoiceRegistrationStatus:
        (parsed.invoiceRegistrationStatus as InvoiceRegistrationStatus | undefined) ??
        PROFILE_DEFAULTS.invoiceRegistrationStatus,
      taxationMethod: (parsed.taxationMethod as TaxationMethod | null | undefined) ?? PROFILE_DEFAULTS.taxationMethod,
      corporateTaxInterimFiling:
        (parsed.corporateTaxInterimFiling as InterimFilingStatus | undefined) ??
        PROFILE_DEFAULTS.corporateTaxInterimFiling,
      consumptionTaxInterimFrequency:
        (parsed.consumptionTaxInterimFrequency as ConsumptionTaxInterimFrequency | undefined) ??
        PROFILE_DEFAULTS.consumptionTaxInterimFrequency,
      withholdingTaxCycle:
        (parsed.withholdingTaxCycle as WithholdingTaxCycle | undefined) ?? PROFILE_DEFAULTS.withholdingTaxCycle,
      localTaxCollectionMethod:
        (parsed.localTaxCollectionMethod as LocalTaxCollectionMethod | undefined) ??
        PROFILE_DEFAULTS.localTaxCollectionMethod,
      eTaxEnabled: (parsed.eTaxEnabled as boolean | undefined) ?? PROFILE_DEFAULTS.eTaxEnabled,
      eLTaxEnabled: (parsed.eLTaxEnabled as boolean | undefined) ?? PROFILE_DEFAULTS.eLTaxEnabled,
      advisors: { ...DEFAULT_ADVISORS, ...advisorsRaw },
    };
  } catch {
    return null;
  }
}

export function saveCompanyProfile(profile: CompanyProfile): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

// ── 自動判定（設計書 ③「将来自動判定できる項目」に対応）─────────
// いずれも「確実な事実」からのみ判定し、根拠が無い場合は null を返して
// ユーザー入力に委ねる（誤った断定をしない）。

export function deriveStage(
  establishedDate: string | null,
  fiscalMonth: number | null,
  today: Date = new Date(),
): CompanyStage {
  if (!establishedDate) return 'pre_establishment';
  const established = new Date(`${establishedDate}T00:00:00`);
  if (established > today) return 'pre_establishment';
  if (!fiscalMonth) return 'first_term';

  const estYear = established.getFullYear();
  const estMonth = established.getMonth() + 1;
  const firstPeriodEndYear = estMonth <= fiscalMonth ? estYear : estYear + 1;
  const firstPeriodEnd = new Date(firstPeriodEndYear, fiscalMonth, 0); // fiscalMonth の末日
  return today <= firstPeriodEnd ? 'first_term' : 'second_term_or_later';
}

// 新設法人の消費税納税義務の特例（資本金1,000万円以上は設立事業年度から課税事業者）を最優先の
// 根拠にする。それ以外は Tax Return Profile（Sprint17.2、taxReturnProfile 省略時は従来通り）の
// 基準期間（2期前）の課税売上高から判定する。根拠が無ければ null を返し断定しない。
export function deriveConsumptionTaxStatus(
  capital: number | null,
  stage: CompanyStage,
  taxReturnProfile?: TaxReturnProfile,
): ConsumptionTaxStatus | null {
  if (capital === null) return null;
  if (capital >= 10_000_000) return 'taxable';
  if (stage === 'first_term') return 'exempt';

  const baseline = taxReturnProfile ? getEntryTwoPeriodsAgo(taxReturnProfile) : null;
  if (baseline?.taxableSalesAmount) {
    const isAbove = isTaxableSalesAboveExemptionThreshold(baseline.taxableSalesAmount);
    if (isAbove !== null) return isAbove ? 'taxable' : 'exempt';
  }
  return null;
}

export function deriveLocalTaxCollectionMethod(employeeCount: number): LocalTaxCollectionMethod | null {
  return employeeCount > 0 ? 'special_collection' : null;
}

// 1期目は前年実績が存在しないため確実に「なし」。2期目以降はTax Return Profileの直近期（前期）の
// 確定法人税額から判定する（taxReturnProfile 省略時・データ不足時は従来通りユーザー入力に委ねる）。
export function deriveCorporateTaxInterimFiling(
  stage: CompanyStage,
  taxReturnProfile?: TaxReturnProfile,
): InterimFilingStatus | null {
  if (stage === 'first_term') return 'none';
  const latest = taxReturnProfile ? getLatestEntry(taxReturnProfile) : null;
  if (latest?.corporateTaxAmount) {
    const requiresFiling = corporateTaxRequiresInterimFiling(latest.corporateTaxAmount);
    if (requiresFiling !== null) return requiresFiling ? 'has' : 'none';
  }
  return null;
}

export function deriveConsumptionTaxInterimFrequency(
  stage: CompanyStage,
  taxReturnProfile?: TaxReturnProfile,
): ConsumptionTaxInterimFrequency | null {
  if (stage === 'first_term') return 'none';
  const latest = taxReturnProfile ? getLatestEntry(taxReturnProfile) : null;
  if (latest?.consumptionTaxAmount) {
    const frequency = consumptionTaxInterimFrequencyFromAmount(latest.consumptionTaxAmount);
    if (frequency !== null) return frequency;
  }
  return null;
}

// ── 会社ステージ・納期の特例による手続きの出し分け（設計書 ④⑤、Phase14.2追加分）───

// stage === 'second_term_or_later' のとき非表示にする設立系手続き（procedures.code）。
// roadmap.ts（Sprint21.2）もConfidence判定にこのSetを再利用するためexportする（重複させない）。
export const ESTABLISHMENT_PROCEDURE_CODES = new Set([
  'CORP_ESTABLISH_TAX',   // 法人設立届出書
  'BLUE_RETURN_APPROVAL', // 青色申告承認申請書
  'PAYROLL_OFFICE_OPEN',  // 給与支払事務所等の開設届
  'SOCIAL_INS_NEW',       // 社会保険新規適用届
  'LEGAL_ESTABLISH_KK',   // 株式会社設立登記
  'LEGAL_ESTABLISH_GODO', // 合同会社設立登記
]);

export const WITHHOLDING_TAX_CODE = 'WITHHOLDING_TAX'; // 源泉所得税の納付（roadmap.tsも参照）

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 納期の特例（1/20, 7/10の年2回）の次回期日を計算する。
// diagnosis.ts の calculateNextDeadline とは別に、CompanyProfile側の上書きとして
// クライアント側で計算する（サーバー側の診断結果は毎月納付前提のまま変えない）。
function specialExceptionDeadline(): { label: string; date: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const year = today.getFullYear();
  const candidates = [
    new Date(year, 0, 20),
    new Date(year, 6, 10),
    new Date(year + 1, 0, 20),
  ];
  const next = candidates.find((d) => d.getTime() >= today.getTime()) ?? candidates[candidates.length - 1];
  return {
    label: `${next.getFullYear()}年${next.getMonth() + 1}月${next.getDate()}日（納期の特例）`,
    date: toIsoDate(next),
  };
}

// 診断エンジン・イベントエンジンが返した procedures に対し、CompanyProfileの内容を反映する。
// ① stage === 'second_term_or_later' の場合、設立系手続きを取り除く
// ② withholdingTaxCycle === 'special_exception' の場合、源泉所得税の期限を年2回パターンに
//    上書きする（'unset'/'monthly' の場合は毎月納付のまま表示する。'unset' はAI参謀側の
//    確認コメントで案内する＝buildProfileAdvisories参照）
export function applyCompanyProfileToProcedures(
  procedures: ScheduleProcedure[],
  profile: CompanyProfile | null,
): ScheduleProcedure[] {
  if (!profile) return procedures;

  return procedures
    .filter((p) => !(profile.stage === 'second_term_or_later' && ESTABLISHMENT_PROCEDURE_CODES.has(p.code)))
    .map((p) => {
      if (p.code === WITHHOLDING_TAX_CODE && profile.withholdingTaxCycle === 'special_exception') {
        const next = specialExceptionDeadline();
        return { ...p, next_deadline: next.label, next_deadline_date: next.date };
      }
      return p;
    });
}

// ── Rule Engine 連携（設計書 ⑤）─────────────────────────────────
// RuleContext は Record<string, unknown> のためこのファイルから ruleEngine.ts への
// 依存は発生しない。events.ts 側で registerCompanyEvent の context に spread する。
export function buildProfileRuleContext(profile: CompanyProfile): Record<string, unknown> {
  return {
    consumption_tax_status: profile.consumptionTaxStatus,
    invoice_registration_status: profile.invoiceRegistrationStatus,
    taxation_method: profile.taxationMethod,
    withholding_tax_cycle: profile.withholdingTaxCycle,
    local_tax_collection_method: profile.localTaxCollectionMethod,
    company_stage: profile.stage,
    capital: profile.capital,
  };
}
