import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase/server';
import RuleForm from '../RuleForm';

export default async function NewRulePage() {
  const supabase = await createServerSupabase();

  let procedures: { id: number; code: string; name: string }[] = [];
  if (supabase) {
    const { data } = await supabase.from('procedures').select('id, code, name').order('name');
    procedures = (data as { id: number; code: string; name: string }[] | null) ?? [];
  }

  return (
    <div className="space-y-6">
      <Link href="/admin/rules" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
        <ChevronLeft className="h-4 w-4" />
        ルール一覧に戻る
      </Link>
      <h1 className="text-xl font-bold text-gray-900">ルールを追加</h1>
      <RuleForm procedures={procedures} />
    </div>
  );
}
