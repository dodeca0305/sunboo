import Link from 'next/link';
import { Plus } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase/server';
import ProceduresTable, { type ProcedureRow } from './ProceduresTable';

export default async function AdminProceduresPage() {
  const supabase = await createServerSupabase();

  let procedures: ProcedureRow[] = [];
  if (supabase) {
    const { data } = await supabase
      .from('procedures')
      .select('id, code, name, category, office_type, requires_employees, priority, is_active')
      .order('priority');
    procedures = (data as ProcedureRow[] | null) ?? [];
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">手続き</h1>
          <p className="mt-1 text-sm text-gray-500">{procedures.length}件</p>
        </div>
        <Link href="/admin/procedures/new" className="btn-primary shrink-0 py-2 px-4 text-xs">
          <Plus className="h-3.5 w-3.5" />
          新規追加
        </Link>
      </div>

      <ProceduresTable procedures={procedures} />
    </div>
  );
}
