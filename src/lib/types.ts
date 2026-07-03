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
};

export type ProcedureCategory = 'tax' | 'labor' | 'insurance' | 'registration' | 'other';

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
};

export type ProcedureResult = Procedure & {
  next_deadline: string | null;
  office: JurisdictionOffice | null;
  official_links: { label: string; url: string; status?: LinkStatus; fallback_url?: string | null }[];
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
