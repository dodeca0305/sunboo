// ── DB エンティティ ────────────────────────────────────────────

export type Prefecture = {
  id?: number;          // DB から取得する場合のみ存在
  code: string;
  name: string;
  region?: string;      // 静的データとの互換（DBには存在しない）
};

export type Municipality = {
  id: number;
  prefecture_id: number;
  code: string;
  name: string;
};

// クエリ層（lib/diagnosis.ts, offices/page.tsx, search/page.tsx）の出力形。
// 実データは organization_types / organizations / organization_offices / jurisdictions から取得するが、
// UIコンポーネント（ScheduleList, ProcedureList, OfficeList, SearchClient 等）はこの形のまま消費する。
export type JurisdictionOffice = {
  id: number;
  municipality_id: number;
  office_type: string;
  name: string;
  address: string | null;
  phone: string | null;
  website_url: string | null;
  map_url: string | null;
  official_url?: string | null;
  official_url_status?: LinkStatus;
  official_url_checked_at?: string | null;
  fallback_url?: string | null;
  created_at?: string;
  // 新スキーマ由来の追加情報（値がある場合のみUIに表示、無ければ従来通り）
  postal_code?: string | null;
  fax?: string | null;
  email?: string | null;
  e_filing_url?: string | null;
  download_page_url?: string | null;
  business_hours?: string | null;
  notes?: string | null;
  municipality_names?: string[]; // このオフィスが対応する市区町村名（一覧表示用）
};

// ── 行政機関マスター（新スキーマ）──────────────────────────────

export type OrganizationType = {
  id: number;
  code: string; // 'legal_affairs_bureau' 等。procedures.office_type と同じ値体系
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
};

export type Organization = {
  id: number;
  organization_type_id: number;
  name: string; // 例:「福岡法務局」
  official_url: string | null;
  created_at?: string;
};

export type OrganizationOffice = {
  id: number;
  organization_id: number;
  name: string; // 例:「福岡法務局 久留米支局」
  postal_code: string | null;
  address: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
  website_url: string | null;
  official_url: string | null;
  e_filing_url: string | null;
  download_page_url: string | null;
  map_url: string | null;
  business_hours: string | null;
  notes: string | null;
  official_url_status: LinkStatus;
  official_url_checked_at: string | null;
  fallback_url: string | null;
  created_at?: string;
  updated_at?: string;
};

export type Jurisdiction = {
  id: number;
  municipality_id: number;
  organization_type_id: number;
  organization_office_id: number;
};

export type ProcedureCategory = 'tax' | 'labor' | 'insurance' | 'registration' | 'legal' | 'other';

export type CorporateType = 'kabushiki' | 'godo';

export type LinkStatus = 'ok' | 'broken' | 'redirected' | 'unchecked';

export type Procedure = {
  id: number;
  code: string;
  name: string;
  description: string;
  category: ProcedureCategory;
  requires_employees: boolean;
  applicable_industries: string[] | null;
  office_type: string;
  frequency: string;
  timing_label: string;
  timing_type: string;
  timing_data: Record<string, unknown> | null;
  priority: number;
  is_active: boolean;
  corporate_type: CorporateType | null;
  requires_officer_term: boolean;
  include_in_diagnosis: boolean;
  target_note: string | null;
  submission_method: string | null;
  e_filing_system_name: string | null;
  e_filing_system_url: string | null;
  caution_note: string | null;
  created_at?: string;
};

export type ProcedureDocument = {
  id: number;
  procedure_id: number;
  name: string;
  form_number: string | null;
  is_required: boolean;
  notes: string | null;
  sort_order: number;
};

export type OfficialLink = {
  id: number;
  procedure_id: number | null;
  office_id: number | null;
  label: string;
  url: string;
  sort_order: number;
  status?: LinkStatus;
  checked_at?: string | null;
  fallback_url?: string | null;
  created_at?: string;
};

export type Company = {
  id: string;
  session_id: string | null;
  prefecture_id: number | null;
  municipality_id: number | null;
  has_employees: boolean;
  employee_count: number | null;
  fiscal_month: number;
  industry_code: string | null;
  created_at?: string;
};

// ── 診断 I/O ──────────────────────────────────────────────────

export type DiagnosisInput = {
  prefectureCode: string;    // '13'
  municipalityCode: string;  // '13113'
  hasEmployees: boolean;
  fiscalMonth: number;       // 1〜12
  industryCode?: string;     // 将来用
  corporateType: CorporateType;
  hasOfficerTerm?: boolean;  // 株式会社のときのみ意味を持つ
};

export type ProcedureResult = Procedure & {
  next_deadline: string | null;
  next_deadline_date: string | null; // ISO (YYYY-MM-DD)。残り日数計算用
  office: JurisdictionOffice | null;
  official_links: { label: string; url: string; status?: LinkStatus; fallback_url?: string | null }[];
  procedure_documents: { name: string; form_number: string | null; is_required: boolean; notes: string | null }[];
};

export type DiagnosisResult = {
  offices: JurisdictionOffice[];
  procedures: ProcedureResult[];
};

// ── 旧静的データとの互換型（src/data/ で使用）────────────────

export type Industry = {
  code: string;
  name: string;
};
