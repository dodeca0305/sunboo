import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase/server';
import RuleForm from '../RuleForm';
import RuleLoadError from '../RuleLoadError';
import { loadAdminRuleProcedures } from '@/lib/adminRuleData';

export default async function NewRulePage() {
  const supabase = await createServerSupabase();

  const procedures = supabase ? await loadAdminRuleProcedures(supabase) : null;
  if (procedures === null) return <RuleLoadError href="/admin/rules/new" />;

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
