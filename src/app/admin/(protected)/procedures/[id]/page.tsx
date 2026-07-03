import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase/server';
import ProcedureForm, { type ProcedureFormValues } from '../ProcedureForm';

export default async function EditProcedurePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();

  if (!supabase) {
    return <p className="text-sm text-gray-500">Supabase が設定されていません。</p>;
  }

  const { data: procRaw } = await supabase.from('procedures').select('*').eq('id', id).maybeSingle();
  if (!procRaw) notFound();

  const proc = procRaw as {
    id: number;
    code: string;
    name: string;
    description: string | null;
    category: string;
    requires_employees: boolean;
    applicable_industries: string[] | null;
    office_type: string;
    frequency: string;
    timing_label: string;
    timing_type: string;
    timing_data: Record<string, unknown> | null;
    priority: number;
    is_active: boolean;
    corporate_type: string | null;
    requires_officer_term: boolean;
    include_in_diagnosis: boolean;
    target_note: string | null;
    submission_method: string | null;
    e_filing_system_name: string | null;
    e_filing_system_url: string | null;
    caution_note: string | null;
  };

  const initialValues: ProcedureFormValues = {
    id: proc.id,
    code: proc.code,
    name: proc.name,
    description: proc.description ?? '',
    category: proc.category,
    requires_employees: proc.requires_employees,
    applicable_industries: (proc.applicable_industries ?? []).join(', '),
    office_type: proc.office_type,
    frequency: proc.frequency,
    timing_label: proc.timing_label,
    timing_type: proc.timing_type,
    timing_data: proc.timing_data ? JSON.stringify(proc.timing_data) : '',
    priority: proc.priority,
    is_active: proc.is_active,
    corporate_type: proc.corporate_type ?? '',
    requires_officer_term: proc.requires_officer_term,
    include_in_diagnosis: proc.include_in_diagnosis,
    target_note: proc.target_note ?? '',
    submission_method: proc.submission_method ?? '',
    e_filing_system_name: proc.e_filing_system_name ?? '',
    e_filing_system_url: proc.e_filing_system_url ?? '',
    caution_note: proc.caution_note ?? '',
  };

  return (
    <div className="space-y-6">
      <Link
        href="/admin/procedures"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
      >
        <ChevronLeft className="h-4 w-4" />
        手続き一覧に戻る
      </Link>
      <h1 className="text-xl font-bold text-gray-900">手続きを編集</h1>
      <ProcedureForm initialValues={initialValues} />
    </div>
  );
}
