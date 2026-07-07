import type {
  ConsumptionTaxInterimFrequency, ConsumptionTaxStatus, InterimFilingStatus,
  InvoiceRegistrationStatus, TaxationMethod,
} from './companyProfile';

// ── Tax Return Profile Engine（Sprint 17 Phase17.2）─────────────
// 「前期申告書を会社の現在地として扱う」ための実績ログ。CompanyProfile（現況の自己申告）とは別に、
// localStorage（'sunboo:tax-return-profile'）へ決算のたびに1件ずつ追記する。
// 設計: docs/TAX_RETURN_PROFILE_ENGINE.md（Sprint17 Phase17.1）
//       docs/TAX_RETURN_PROFILE_MVP_PROPOSAL.md（Sprint17.2提案・レビュー承認済み）

// ── 金額項目の精度（承認済み方針3: 概算レンジを認めるがConfidenceは下げる）───

export type AmountPrecision = 'exact' | 'range';

export type AmountValue = {
  precision: AmountPrecision;
  exactValue: number | null; // precision === 'exact' のとき使用
  rangeBucketId: string | null; // precision === 'range' のとき使用
};

// 課税売上高：消費税の課税/免税の分岐点（1,000万円）をまたがないようバケットの境界を設定する。
// バケットが必ず閾値のどちらか一方に収まるため、「範囲がまたがって判定不能」という曖昧さが生じない。
export const TAXABLE_SALES_BUCKETS = [
  { id: 'under_500', label: '500万円未満', isAboveExemptionThreshold: false },
  { id: '500_800', label: '500万円〜800万円未満', isAboveExemptionThreshold: false },
  { id: '800_1000', label: '800万円〜1,000万円未満', isAboveExemptionThreshold: false },
  { id: '1000_1500', label: '1,000万円〜1,500万円未満', isAboveExemptionThreshold: true },
  { id: 'over_1500', label: '1,500万円以上', isAboveExemptionThreshold: true },
] as const;

// 消費税額：中間申告の回数区分（48万円・400万円・4,800万円）の境界に合わせる
export const CONSUMPTION_TAX_BUCKETS = [
  { id: 'under_48', label: '48万円以下', interimFrequency: 'none' as ConsumptionTaxInterimFrequency },
  { id: '48_400', label: '48万円超400万円以下', interimFrequency: '1' as ConsumptionTaxInterimFrequency },
  { id: '400_4800', label: '400万円超4,800万円以下', interimFrequency: '3' as ConsumptionTaxInterimFrequency },
  { id: 'over_4800', label: '4,800万円超', interimFrequency: '11' as ConsumptionTaxInterimFrequency },
] as const;

// 法人税額：中間申告要否の目安（簡略化。実際は年税額を月数按分するが、MVPでは概算のみを扱う）
export const CORPORATE_TAX_BUCKETS = [
  { id: 'under_20', label: '20万円以下', requiresInterimFiling: false },
  { id: 'over_20', label: '20万円超', requiresInterimFiling: true },
] as const;

// precision === 'exact' のとき is-above 系の判定に使う実額のしきい値（バケット境界と揃えている）
const TAXABLE_SALES_EXEMPTION_THRESHOLD = 10_000_000;
const CONSUMPTION_TAX_INTERIM_THRESHOLDS = { none: 480_000, one: 4_000_000, three: 48_000_000 };
const CORPORATE_TAX_INTERIM_THRESHOLD = 200_000;

export function isTaxableSalesAboveExemptionThreshold(amount: AmountValue): boolean | null {
  if (amount.precision === 'exact') {
    if (amount.exactValue === null) return null;
    return amount.exactValue >= TAXABLE_SALES_EXEMPTION_THRESHOLD;
  }
  const bucket = TAXABLE_SALES_BUCKETS.find((b) => b.id === amount.rangeBucketId);
  return bucket ? bucket.isAboveExemptionThreshold : null;
}

export function consumptionTaxInterimFrequencyFromAmount(amount: AmountValue): ConsumptionTaxInterimFrequency | null {
  if (amount.precision === 'exact') {
    if (amount.exactValue === null) return null;
    const v = amount.exactValue;
    if (v <= CONSUMPTION_TAX_INTERIM_THRESHOLDS.none) return 'none';
    if (v <= CONSUMPTION_TAX_INTERIM_THRESHOLDS.one) return '1';
    if (v <= CONSUMPTION_TAX_INTERIM_THRESHOLDS.three) return '3';
    return '11';
  }
  const bucket = CONSUMPTION_TAX_BUCKETS.find((b) => b.id === amount.rangeBucketId);
  return bucket ? bucket.interimFrequency : null;
}

export function corporateTaxRequiresInterimFiling(amount: AmountValue): boolean | null {
  if (amount.precision === 'exact') {
    if (amount.exactValue === null) return null;
    return amount.exactValue > CORPORATE_TAX_INTERIM_THRESHOLD;
  }
  const bucket = CORPORATE_TAX_BUCKETS.find((b) => b.id === amount.rangeBucketId);
  return bucket ? bucket.requiresInterimFiling : null;
}

// Roadmap Confidence（3分類）への反映方法の契約（設計書5節）。Roadmap Update Engine（未実装）が
// 将来呼び出す想定の純粋関数。正確な金額 > 概算レンジ > 未入力、の順で確からしさを下げる。
export function confidenceOfAmount(amount: AmountValue | null): 'high' | 'medium' | 'low' {
  if (!amount) return 'low';
  if (amount.precision === 'exact' && amount.exactValue === null) return 'low';
  if (amount.precision === 'range' && !amount.rangeBucketId) return 'low';
  return amount.precision === 'exact' ? 'high' : 'medium';
}

// ── TaxReturnEntry / TaxReturnProfile ────────────────────────────

export type TaxReturnEntry = {
  id: string;
  fiscalYear: string; // 対象年度（必須）。例: '2025年3月期'。ユーザーが自由記述で入力する
  fiscalYearStartDate: string | null;
  fiscalYearEndDate: string; // ISO日付（必須）。並び替え・基準期間計算の起点になる
  filedDate: string | null;
  capitalAtFiling: number | null;

  taxableSalesAmount: AmountValue | null;
  consumptionTaxStatus: ConsumptionTaxStatus;
  taxationMethod: TaxationMethod | null;
  invoiceRegistrationStatus: InvoiceRegistrationStatus;

  corporateTaxAmount: AmountValue | null;
  consumptionTaxAmount: AmountValue | null;

  corporateTaxInterimFilingActual: InterimFilingStatus;
  consumptionTaxInterimFrequencyActual: ConsumptionTaxInterimFrequency;
  financialStatementPublished: boolean;
  withholdingTaxCycleActual: 'monthly' | 'special_exception' | null;

  employeeCountAtFiscalYearEnd: number | null;

  createdAt: string;
  updatedAt: string;
};

export type TaxReturnProfile = {
  entries: TaxReturnEntry[]; // fiscalYearEndDate 昇順
};

const TAX_RETURN_PROFILE_KEY = 'sunboo:tax-return-profile';

const EMPTY_PROFILE: TaxReturnProfile = { entries: [] };

function sortEntries(entries: TaxReturnEntry[]): TaxReturnEntry[] {
  return [...entries].sort((a, b) => a.fiscalYearEndDate.localeCompare(b.fiscalYearEndDate));
}

// CompanyProfileと異なり、「まだ1件も申告実績が無い」ことは有効な状態のため、
// null ではなく常に有効な TaxReturnProfile を返す（呼び出し側にnullチェックを強制しない）。
export function loadTaxReturnProfile(): TaxReturnProfile {
  if (typeof window === 'undefined') return EMPTY_PROFILE;
  try {
    const raw = window.localStorage.getItem(TAX_RETURN_PROFILE_KEY);
    if (!raw) return EMPTY_PROFILE;
    const parsed = JSON.parse(raw) as Partial<TaxReturnProfile>;
    if (!Array.isArray(parsed.entries)) return EMPTY_PROFILE;
    return { entries: sortEntries(parsed.entries) };
  } catch {
    return EMPTY_PROFILE;
  }
}

export function saveTaxReturnProfile(profile: TaxReturnProfile): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TAX_RETURN_PROFILE_KEY, JSON.stringify({ entries: sortEntries(profile.entries) }));
}

export function addTaxReturnEntry(
  entry: Omit<TaxReturnEntry, 'id' | 'createdAt' | 'updatedAt'>,
): TaxReturnProfile {
  const now = new Date().toISOString();
  const newEntry: TaxReturnEntry = { ...entry, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
  const current = loadTaxReturnProfile();
  const updated: TaxReturnProfile = { entries: sortEntries([...current.entries, newEntry]) };
  saveTaxReturnProfile(updated);
  return updated;
}

export function updateTaxReturnEntry(id: string, patch: Partial<TaxReturnEntry>): TaxReturnProfile {
  const current = loadTaxReturnProfile();
  const now = new Date().toISOString();
  const entries = current.entries.map((e) => (e.id === id ? { ...e, ...patch, id: e.id, updatedAt: now } : e));
  const updated: TaxReturnProfile = { entries: sortEntries(entries) };
  saveTaxReturnProfile(updated);
  return updated;
}

export function deleteTaxReturnEntry(id: string): TaxReturnProfile {
  const current = loadTaxReturnProfile();
  const updated: TaxReturnProfile = { entries: current.entries.filter((e) => e.id !== id) };
  saveTaxReturnProfile(updated);
  return updated;
}

// 直近1件（＝前期）。「前期申告書を会社の現在地として扱う」の実装上の入口になる。
export function getLatestEntry(profile: TaxReturnProfile): TaxReturnEntry | null {
  return profile.entries.length > 0 ? profile.entries[profile.entries.length - 1] : null;
}

// 2期前（基準期間）。consumptionTaxStatus の導出に使う。
export function getEntryTwoPeriodsAgo(profile: TaxReturnProfile): TaxReturnEntry | null {
  const idx = profile.entries.length - 2;
  return idx >= 0 ? profile.entries[idx] : null;
}
