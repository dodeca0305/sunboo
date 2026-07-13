import type { CorporateType } from './types';
import type { ScheduleProcedure } from './scheduleProcedure';
import { calculateNextDeadline } from './diagnosis';
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

// 個人住民税の特別徴収（地方税法）の納付サイクル。源泉所得税（WithholdingTaxCycle、所得税法）とは
// 別制度・別の特例日程（6/10, 12/10 vs 1/20, 7/10）のため、値の語彙も意図的に揃えない
// （docs/RESIDENT_TAX_SUPPORT_DESIGN.md 2節「命名の整理」）。
export type ResidentTaxPaymentCycle = 'unknown' | 'monthly' | 'special';

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
  // 役員変更（重任・交代）の効力が生じる予定日（ISO日付、株式会社のみ意味を持つ）。
  // 【注意】登記申請期限そのものではない。この日から2週間（14日）以内の登記申請期限は、
  // applyCompanyProfileToProcedures内でcalculateNextDeadlineのevent_based分岐が自動計算する。
  // 【Sprint55レビュー対応】当初「役員任期の定め有無」という3値フラグを検討したが、株式会社の役員には
  // 会社法上必ず任期があるため「定めなし」という選択肢自体が制度上誤りだった。加えて
  // LEGAL_OFFICER_CHANGE（役員変更登記）はtiming_type='event_based'のため、有無フラグだけでは
  // 起算日が無く、Annual Roadmapへoccurrenceを生成できなかった（docs/COMPANY_ADDRESS_OFFICE_RESOLUTION_DESIGN.md
  // 0-5節）。次回の変更（重任・交代）の効力発生予定日そのものを起算日として保持する設計に変更する。
  // src/lib/companyProfile.tsのapplyCompanyProfileToProcedures内でLEGAL_OFFICER_CHANGEの
  // next_deadline_dateをこの値から計算する（calculateNextDeadlineのevent_based分岐を再利用）。
  nextOfficerChangeDate: string | null;
  // 本店所在地の番地・建物名等（表示専用、判定には使用しない）。
  // 【Sprint56】docs/COMPANY_ADDRESS_OFFICE_RESOLUTION_DESIGN.md（Sprint54、案B）に基づき追加。
  // 提出先判定は引き続きmunicipalityCode（唯一の判定キー）のみで行う。この値はExcel/PDF/
  // 共有画面での表示にのみ使う。都道府県・市区町村は既存のprefectureName/municipalityNameを
  // そのまま流用し、重複するフィールドは作らない（郵便番号検索・住所解析は行わない）。
  address: string | null;
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

  // 地方税（住民税特別徴収）。residentTaxPaymentCycle は localTaxCollectionMethod が
  // 'special_collection'（特別徴収）の場合にのみ意味を持つ（'general_collection' の会社には
  // そもそも納付サイクルという概念が無い）。
  localTaxCollectionMethod: LocalTaxCollectionMethod;
  residentTaxPaymentCycle: ResidentTaxPaymentCycle;

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
  nextOfficerChangeDate: null as string | null,
  address: null as string | null,
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
  residentTaxPaymentCycle: 'unknown' as ResidentTaxPaymentCycle,
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

// 都道府県名・市区町村名・番地（address）を結合した表示用の本店所在地文字列を組み立てる。
// 【Sprint56】Excel/PDF/共有画面で同じ組み立てロジックを重複させないための共通関数
// （表示専用。判定には使わない）。いずれかが未入力でも欠けている部分を飛ばして結合する。
export function formatCompanyAddress(profile: CompanyProfile): string {
  return [profile.prefectureName, profile.municipalityName, profile.address].filter(Boolean).join('');
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
      residentTaxPaymentCycle:
        (parsed.residentTaxPaymentCycle as ResidentTaxPaymentCycle | undefined) ??
        PROFILE_DEFAULTS.residentTaxPaymentCycle,
      nextOfficerChangeDate:
        (parsed.nextOfficerChangeDate as string | null | undefined) ?? PROFILE_DEFAULTS.nextOfficerChangeDate,
      address: (parsed.address as string | null | undefined) ?? PROFILE_DEFAULTS.address,
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
export const RESIDENT_TAX_WITHHOLDING_CODE = 'RESIDENT_TAX_WITHHOLDING'; // 住民税特別徴収税額の納付（roadmap.tsも参照）
export const LEGAL_OFFICER_CHANGE_CODE = 'LEGAL_OFFICER_CHANGE'; // 役員変更登記（roadmap.tsも参照）
export const WITHHOLDING_SPECIAL_EXCEPTION_CODE = 'WITHHOLDING_SPECIAL_EXCEPTION'; // 源泉所得税の納期の特例申請

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ── 周期手続きの「毎月納付 / 納期の特例（年2回）」切替（Sprint47で一般化）───────────
// 元は WITHHOLDING_TAX_CODE 専用のif分岐だった。Sprint47で RESIDENT_TAX_WITHHOLDING_CODE が
// 同じ形（毎月10日が基本形、CompanyProfileの特定フィールドが特定の値のときだけ年2回パターンに
// 切り替わる）の2件目として加わったため、procedure.code → 設定 のテーブル参照に一般化した
// （docs/RESIDENT_TAX_SUPPORT_DESIGN.md 5節）。roadmap.ts の expandOccurrences も同じテーブルを
// 参照する（重複させない）。将来3件目が増えてもこのテーブルに1行足すだけでよい。
export type PeriodicCycleOverride = {
  cycleField: 'withholdingTaxCycle' | 'residentTaxPaymentCycle';
  specialValue: string; // profile[cycleField] がこの値のときだけ年2回パターンに切り替える
  specialDates: readonly [number, number][]; // [month(0-indexed), day] を年内昇順で2件
};

export const PERIODIC_CYCLE_OVERRIDES: Record<string, PeriodicCycleOverride> = {
  [WITHHOLDING_TAX_CODE]: {
    cycleField: 'withholdingTaxCycle',
    specialValue: 'special_exception',
    specialDates: [[0, 20], [6, 10]], // 1/20, 7/10（所得税法）
  },
  [RESIDENT_TAX_WITHHOLDING_CODE]: {
    cycleField: 'residentTaxPaymentCycle',
    specialValue: 'special',
    specialDates: [[5, 10], [11, 10]], // 6/10, 12/10（地方税法）
  },
};

// 納期の特例（年2回）の次回期日を計算する。dates は年内昇順の2件を想定（例: [1/20, 7/10]）。
// diagnosis.ts の calculateNextDeadline とは別に、CompanyProfile側の上書きとして
// クライアント側で計算する（サーバー側の診断結果は毎月納付前提のまま変えない）。
function nextPeriodicCycleDeadline(dates: readonly [number, number][]): { label: string; date: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const year = today.getFullYear();
  const [first, second] = dates;
  const candidates = [
    new Date(year, first[0], first[1]),
    new Date(year, second[0], second[1]),
    new Date(year + 1, first[0], first[1]),
  ];
  const next = candidates.find((d) => d.getTime() >= today.getTime()) ?? candidates[candidates.length - 1];
  return {
    label: `${next.getFullYear()}年${next.getMonth() + 1}月${next.getDate()}日（納期の特例）`,
    date: toIsoDate(next),
  };
}

// 診断エンジン・イベントエンジンが返した procedures に対し、CompanyProfileの内容を反映する。
// ① stage === 'second_term_or_later' の場合、設立系手続きを取り除く
// ② localTaxCollectionMethod !== 'special_collection' の場合、住民税特別徴収の納付を取り除く
//    （普通徴収を選択している会社には特別徴収の納付義務が無いため）
// ③ residentTaxPaymentCycle === 'unknown' の場合、住民税特別徴収の納付を取り除く
//    【Sprint47レビュー対応】毎月10日の出現をconfidence='incomplete'付きで表示すると、
//    「毎月10日が予定として存在する」ように見える誤案内リスクがあるため、周期が未確定の間は
//    一覧に出さない（WITHHOLDING_TAX_CODEの'unset'時の既存挙動は変更しない。あちらは
//    Sprint47以前からの確立済み挙動であり、本レビューの対象外）
// ④ PERIODIC_CYCLE_OVERRIDES に該当する手続きは、対象フィールドが specialValue のときだけ
//    期限を年2回パターンに上書きする（それ以外の値は毎月納付のまま表示する）
// ⑤ LEGAL_OFFICER_CHANGE（役員変更登記）は、profile.nextOfficerChangeDateが設定されている
//    場合のみ、その日付を起算日としてcalculateNextDeadline（event_based分岐、diagnosis.ts）を
//    再利用して期限を計算する。未設定の場合は診断エンジン側で既に除外されている（roadmap.tsの
//    hasOfficerTerm判定）ため、ここに到達すること自体が無い想定だが、他経路（/result等）からの
//    呼び出しに備え、念のため未設定時は何もしない（元のnext_deadline_date=nullのまま）
//    （docs/COMPANY_ADDRESS_OFFICE_RESOLUTION_DESIGN.md 0-5節・Sprint55レビュー対応）。
// ⑥ WITHHOLDING_SPECIAL_EXCEPTION（源泉所得税の納期の特例申請）は、常時使用する従業員が
//    10人未満の場合のみ選択できる制度（procedures.target_note）。しかしRule Engine側の条件
//    （'会社設立/従業員採用：源泉所得税の納期の特例申請'）はwithholdingTaxCycleのみを見て
//    employeeCountを見ないため、10人以上の会社にも誤って推薦されうる（docs/
//    COMPANY_PROFILE_OBLIGATION_AUDIT.md 4節で発見）。ここで employeeCount が
//    0 < employeeCount < 10 の場合のみ通す。0人（未入力の代理値、employeeCountはnullを
//    表現できない型のため）は保守的に非表示とする（Sprint58レビュー対応）。
export function applyCompanyProfileToProcedures(
  procedures: ScheduleProcedure[],
  profile: CompanyProfile | null,
): ScheduleProcedure[] {
  if (!profile) return procedures;

  return procedures
    .filter((p) => !(profile.stage === 'second_term_or_later' && ESTABLISHMENT_PROCEDURE_CODES.has(p.code)))
    .filter((p) => !(p.code === RESIDENT_TAX_WITHHOLDING_CODE && profile.localTaxCollectionMethod !== 'special_collection'))
    .filter((p) => !(p.code === RESIDENT_TAX_WITHHOLDING_CODE && profile.residentTaxPaymentCycle === 'unknown'))
    .filter((p) => !(p.code === WITHHOLDING_SPECIAL_EXCEPTION_CODE && !(profile.employeeCount > 0 && profile.employeeCount < 10)))
    .map((p) => {
      if (p.code === LEGAL_OFFICER_CHANGE_CODE && profile.nextOfficerChangeDate) {
        const deadline = calculateNextDeadline(
          p.timing_type,
          p.timing_data ?? null,
          profile.fiscalMonth ?? 0,
          profile.nextOfficerChangeDate,
        );
        return { ...p, next_deadline: deadline.label, next_deadline_date: deadline.date };
      }
      const override = PERIODIC_CYCLE_OVERRIDES[p.code];
      if (override && (profile[override.cycleField] as string) === override.specialValue) {
        const next = nextPeriodicCycleDeadline(override.specialDates);
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
