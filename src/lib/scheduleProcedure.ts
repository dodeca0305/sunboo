import type { ProcedureCategory, LinkStatus, ProcedureResult } from '@/lib/types';
import type { ProcedureDocumentItem } from '@/components/ProcedureDetailExtra';

export type ProcedureStatus = 'not_started' | 'in_progress' | 'done';

export type ScheduleProcedure = {
  id: number;
  code: string;
  name: string;
  description: string;
  category: ProcedureCategory;
  timing_label: string;
  timing_type: string;
  // 【Sprint55で追加】event_based手続き（役員変更登記等）の期限をCompanyProfile側で
  // 再計算する際に、procedures.timing_data（例: {"days_from_event": 14}）が必要なため運ぶ。
  // 既存の呼び出し元には影響しない追加フィールド。
  timing_data?: Record<string, unknown> | null;
  next_deadline: string | null;
  next_deadline_date: string | null;
  office: {
    name: string;
    map_url?: string | null;
    // 【Sprint50で追加】Roadmapの提出先リンク表示用。resolveOffices（diagnosis.ts）は元々
    // これらを取得済みだが、toScheduleProcedureがname/map_urlだけに絞り込んでいたため
    // 表示側に渡っていなかった（docs/ROADMAP_SUBMISSION_OFFICE_LINKS_DESIGN.md 0-3節）。
    official_url?: string | null;
    website_url?: string | null;
    official_url_status?: LinkStatus;
    fallback_url?: string | null;
  } | null;
  official_links: { label: string; url: string; status?: LinkStatus; fallback_url?: string | null }[];
  procedure_documents?: ProcedureDocumentItem[];
  target_note?: string | null;
  submission_method?: string | null;
  e_filing_system_name?: string | null;
  e_filing_system_url?: string | null;
  caution_note?: string | null;
};

// 診断エンジン（runDiagnosis）・経営イベントエンジン（registerCompanyEvent）どちらの
// 出力（ProcedureResult）からも ScheduleList にそのまま渡せる形に変換する共通ヘルパー。
// サーバーコンポーネント（result/page.tsx）から呼ばれるため 'use client' 配下には置かない。
export function toScheduleProcedure(proc: ProcedureResult): ScheduleProcedure {
  return {
    id: proc.id,
    code: proc.code,
    name: proc.name,
    description: proc.description,
    category: proc.category,
    timing_label: proc.timing_label,
    timing_type: proc.timing_type,
    timing_data: proc.timing_data,
    next_deadline: proc.next_deadline,
    next_deadline_date: proc.next_deadline_date,
    office: proc.office
      ? {
          name: proc.office.name,
          map_url: proc.office.map_url,
          official_url: proc.office.official_url,
          website_url: proc.office.website_url,
          official_url_status: proc.office.official_url_status,
          fallback_url: proc.office.fallback_url,
        }
      : null,
    official_links: proc.official_links,
    procedure_documents: proc.procedure_documents,
    target_note: proc.target_note,
    submission_method: proc.submission_method,
    e_filing_system_name: proc.e_filing_system_name,
    e_filing_system_url: proc.e_filing_system_url,
    caution_note: proc.caution_note,
  };
}
