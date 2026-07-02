import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type { ProcedureCategory } from '@/lib/types';
import ProcedureList from './ProcedureList';

type ProcedureItem = {
  id: number;
  name: string;
  description: string;
  category: ProcedureCategory;
  office_type: string;
  timing_label: string;
  official_links: { label: string; url: string }[];
};

// Supabase の JOIN 結果（公式リンクは配列で返る）
type RawProcedure = Omit<ProcedureItem, 'official_links'> & {
  official_links: { label: string; url: string }[] | null;
};

export default async function ProceduresPage() {
  let procedures: ProcedureItem[] = [];

  if (supabase) {
    const { data } = await supabase
      .from('procedures')
      .select('id, name, description, category, office_type, timing_label, official_links(label, url)')
      .eq('is_active', true)
      .order('priority');

    procedures = ((data as RawProcedure[] | null) ?? []).map((p) => ({
      ...p,
      official_links: p.official_links ?? [],
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
        <Link href="/start" className="btn-primary shrink-0 py-2 px-4 text-xs">
          診断する →
        </Link>
      </div>

      <ProcedureList procedures={procedures} />
    </div>
  );
}
