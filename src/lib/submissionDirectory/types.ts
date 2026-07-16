import type { LinkStatus } from '../types';

// ── National Submission Directory（Phase2: 福岡県パイロット）──────────────
// 設計: docs/NATIONAL_SUBMISSION_DIRECTORY.md（D1〜D11決定事項）・docs/ADR_NATIONAL_SUBMISSION_DIRECTORY.md
// DBスキーマ: supabase/migration_national_submission_directory.sql
//
// 既存の organization_types / organizations / organization_offices / jurisdictions とは別の
// 新4テーブル（submission_offices / office_sources / submission_jurisdictions /
// procedure_submission_rules）に対応する型定義。既存 JurisdictionOffice 等（src/lib/types.ts）は
// 変更しない（旧テーブルの型のまま残す）。

export type OfficeCategory = string; // organization_types.code をそのまま再利用（新しい列挙型を作らない、D8/0-4節）

export type UpdateFrequency = 'monthly' | 'quarterly' | 'annual' | 'on_change' | 'unknown';

export type SubmissionOffice = {
  id: number;
  officeCategory: OfficeCategory;
  organizationName: string | null;
  name: string;
  postalCode: string | null;
  address: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
  websiteUrl: string | null;
  officialUrl: string | null;
  eFilingUrl: string | null;
  downloadPageUrl: string | null;
  mapUrl: string | null;
  businessHours: string | null;
  notes: string | null;
  officialUrlStatus: LinkStatus;
  officialUrlCheckedAt: string | null;
  fallbackUrl: string | null;
  dataVersion: number;
  lastVerifiedAt: string | null;
  verificationDueAt: string | null;
  updateFrequency: UpdateFrequency;
  isActive: boolean;
};

export type OfficeSourceStatus = 'active' | 'superseded' | 'retracted'; // D6
export type SourceType =
  | 'nta'
  | 'moj'
  | 'nenkin'
  | 'mhlw'
  | 'pref_government'
  | 'municipal_government'
  | 'other';
export type VerificationMethod =
  | 'official_page_check'
  | 'phone_confirmation'
  | 'pdf_document'
  | 'csv_import'
  | 'other';

export type OfficeSource = {
  id: number;
  officeId: number;
  sourceType: SourceType;
  publisherName: string;
  sourceUrl: string | null;
  retrievedAt: string;
  verificationMethod: VerificationMethod;
  verifiedBy: string | null;
  status: OfficeSourceStatus;
  isCurrent: boolean;
  notes: string | null;
};

export type JurisdictionScopeType = 'municipality' | 'prefecture' | 'national';

export type SubmissionJurisdiction = {
  id: number;
  officeId: number;
  officeCategory: OfficeCategory;
  scopeType: JurisdictionScopeType;
  municipalityScopeId: number | null; // D9: municipalities.idへのFK（scope_type='municipality'の時のみ非NULL）
  prefectureScopeId: number | null; // D9: prefectures.idへのFK（scope_type='prefecture'の時のみ非NULL）
  isPrimary: boolean;
  priority: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  notes: string | null;
};

export type RecipientScope = 'company' | 'each_employee' | 'other';

// rule_conditions（src/lib/ruleEngine.ts）と同じ演算子語彙をそのまま踏襲する（D10）。
// procedure_submission_rules.conditions（JSONB配列）はこの型の配列として保持される。
export type RuleOperator = 'eq' | 'neq' | 'in' | 'not_in' | 'gt' | 'gte' | 'lt' | 'lte';
export type RuleConditionRow = { field: string; operator: RuleOperator; value: unknown };

export type ProcedureSubmissionRule = {
  id: number;
  procedureId: number;
  officeCategory: OfficeCategory;
  conditions: RuleConditionRow[];
  recipientScope: RecipientScope;
  priority: number;
  isActive: boolean;
  notes: string | null;
};

// ── 会社所在地（判定キー） ──────────────────────────────────────
// 会社プロフィールの municipality_code/prefecture_code から解決した内部ID。
// 郵便番号は判定キーとして採用しない（D1）。
export type CompanyLocation = {
  municipalityId: number | null;
  prefectureId: number | null;
};

// procedure_submission_rules.conditions の評価コンテキスト。ruleEngine.ts の RuleContext と
// 同じ「呼び出し側が自由に詰めるRecord」という設計を踏襲する（新しい条件フィールドを追加する際に
// このファイルの変更が不要になるようにするため）。
export type SubmissionRuleContext = Record<string, unknown>;

// ── 判定結果（状態モデル） ──────────────────────────────────────

export type ResolutionStatus =
  | 'resolved'
  | 'multiple_candidates'
  | 'insufficient_profile'
  | 'requires_employee_address'
  | 'not_supported';

// D11: official_url_status（リンク生存）とは別軸。unverifiedは排他的な状態ではなく副次フラグ。
export type VerificationStatus = 'verified' | 'unverified';

// 呼び出し元（診断エンジン・Roadmap・PDF・Share等）へ渡す表示用の窓口情報。
// submission_offices の全カラムではなく、表示に必要な範囲のみを運ぶ
// （「必要な分だけ運ぶ」という既存 ScheduleProcedure.office の設計思想を踏襲、D3）。
export type PublicOfficeView = {
  officeCategory: OfficeCategory;
  name: string;
  organizationName: string | null;
  address: string | null;
  phone: string | null;
  officialUrl: string | null;
  websiteUrl: string | null;
  mapUrl: string | null;
  fallbackUrl: string | null;
};

export type SubmissionOfficeSourceView = {
  sourceType: SourceType;
  publisherName: string;
  sourceUrl: string | null;
};

// requiredAction: 呼び出し側（UI）が状態に応じて分岐するための機械可読な短い定数。
// 人間向けの説明文は reason / publicVerificationLabel 側に持たせ、こちらは分岐ロジック専用。
export type RequiredAction =
  | 'complete_company_profile'
  | 'check_each_employee_address'
  | 'review_alternative_offices'
  | 'confirm_with_official_source'
  | 'contact_support_or_wait_for_coverage'
  | null;

export type SubmissionOfficeResolution = {
  status: ResolutionStatus;
  primaryOffice: PublicOfficeView | null;
  alternativeOffices: PublicOfficeView[];
  reason: string; // 管轄理由（jurisdictionReason）。一般公開する説明文（D7）
  source: SubmissionOfficeSourceView | null;
  verificationStatus: VerificationStatus | null; // 該当する窓口が無い状態ではnull
  lastVerifiedAt: string | null; // 内部用の生日付。公開画面に直接出さない（D7）
  publicVerificationLabel: string | null; // 公開表示用の定性ラベル（例:「（未確認）」）。verified時はnull
  requiredAction: RequiredAction;
  metadata: Record<string, unknown>;
};

// ── 判定関数（resolve.ts）の入出力 ──────────────────────────────

export type ResolveCandidateInput = {
  procedureId: number;
  procedureOfficeType: OfficeCategory; // procedures.office_type（デフォルト値）
  location: CompanyLocation;
  context: SubmissionRuleContext;
};

export type ResolveCandidateData = {
  // 呼び出し側（dataAccess.ts）が procedure_id で絞り込み・is_active=true でフィルタ済みのものを渡す
  rules: ProcedureSubmissionRule[];
  // 呼び出し側が 決定済みの office_category で絞り込み・effective_to IS NULL でフィルタ済みのものを渡す
  jurisdictions: SubmissionJurisdiction[];
  officesById: Map<number, SubmissionOffice>;
  currentSourceByOfficeId: Map<number, OfficeSource>;
};

export type JurisdictionScopeTier = JurisdictionScopeType;

// resolve.ts の中間結果（状態変換前）。stateModel.ts がこれを最終的な ResolutionStatus へ変換する。
export type CandidateMatch =
  | { kind: 'insufficient_profile' }
  | { kind: 'requires_employee_address'; officeCategory: OfficeCategory; matchedRuleId: number | null }
  | { kind: 'not_supported'; officeCategory: OfficeCategory }
  | {
      kind: 'found';
      officeCategory: OfficeCategory;
      scopeTier: JurisdictionScopeTier;
      primary: SubmissionJurisdiction;
      alternatives: SubmissionJurisdiction[];
      matchedRuleId: number | null;
    };
