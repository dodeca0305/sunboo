import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type { ProcedureCategory } from '@/lib/types';
import ProcedureList from './ProcedureList';

// 手続きデータはSupabase側（管理画面・マイグレーション）で随時更新されるため、
// ビルド時に静的化せず常に最新状態を取得する。
export const dynamic = 'force-dynamic';

type ProcedureItem = {
  id: number;
  name: string;
  description: string;
  category: ProcedureCategory;
  office_type: string;
  timing_label: string;
  official_links: { label: string; url: string; status?: string; fallback_url?: string | null }[];
  procedure_documents: { name: string; form_number: string | null; is_required: boolean; notes: string | null }[];
  target_note: string | null;
  submission_method: string | null;
  e_filing_system_name: string | null;
  e_filing_system_url: string | null;
  caution_note: string | null;
};

// Supabase の JOIN 結果（公式リンクは配列で返る）
type RawOfficialLink = { label: string; url: string; status?: string | null; fallback_url?: string | null };
type RawDocument = { name: string; form_number: string | null; is_required: boolean; notes: string | null };
type RawProcedure = Omit<ProcedureItem, 'official_links' | 'procedure_documents'> & {
  official_links: RawOfficialLink[] | null;
  procedure_documents: RawDocument[] | null;
};

export default async function ProceduresPage() {
  let procedures: ProcedureItem[] = [];

  if (supabase) {
    const { data } = await supabase
      .from('procedures')
      .select(
        'id, name, description, category, office_type, timing_label, ' +
          'official_links(label, url, status, fallback_url), procedure_documents(name, form_number, is_required, notes), ' +
          'target_note, submission_method, e_filing_system_name, e_filing_system_url, caution_note',
      )
      .eq('is_active', true)
      .order('priority');

    procedures = ((data as RawProcedure[] | null) ?? []).map((p) => ({
      ...p,
      official_links: (p.official_links ?? []).map((link) => ({
        ...link,
        status: link.status ?? undefined,
      })),
      procedure_documents: p.procedure_documents ?? [],
    }));
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      {/* ページヘッダー */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">手続き一覧</h1>
          <p className="mt-1 text-sm text-gray-500">
            法人設立・運営に必要な行政手続きの一覧です
          </p>
        </div>
        <Link href="/start" className="btn-primary shrink-0 px-4 py-2 text-xs">
          診断する →
        </Link>
      </div>

      <ProcedureList procedures={procedures} />
    </div>
  );
}
