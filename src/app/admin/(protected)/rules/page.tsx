import Link from 'next/link';
import { Plus } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase/server';
import RulesView, { type RuleWithDetails } from './RulesView';

export default async function AdminRulesPage() {
  const supabase = await createServerSupabase();

  let rules: RuleWithDetails[] = [];
  let procedures: { id: number; name: string }[] = [];

  if (supabase) {
    const [{ data: rulesRaw }, { data: proceduresRaw }] = await Promise.all([
      supabase
        .from('rules')
        .select(
          `id, name, description, priority, is_active,
           rule_conditions(id, field, operator, value, sort_order),
           rule_actions(id, action_type, procedure_id, payload, sort_order)`,
        )
        .order('priority'),
      supabase.from('procedures').select('id, name').order('name'),
    ]);
    rules = (rulesRaw as RuleWithDetails[] | null) ?? [];
    procedures = (proceduresRaw as { id: number; name: string }[] | null) ?? [];
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">ルール</h1>
          <p className="mt-1 text-sm text-gray-500">
            経営イベントエンジンの判定ルールです。{rules.length}件。条件（AND）を満たすと実行内容が発動します。
          </p>
        </div>
        <Link href="/admin/rules/new" className="btn-primary inline-flex items-center gap-1.5 text-sm">
          <Plus className="h-4 w-4" />
          ルールを追加
        </Link>
      </div>

      <RulesView rules={rules} procedures={procedures} />
    </div>
  );
}
