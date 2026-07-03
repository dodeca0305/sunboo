import Link from 'next/link';
import { Plus } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase/server';
import RulesTable, { type RuleRow } from './RulesTable';

export default async function AdminRulesPage() {
  const supabase = await createServerSupabase();

  let rules: RuleRow[] = [];
  if (supabase) {
    const [{ data: rulesRaw }, { data: conditionsRaw }, { data: actionsRaw }] = await Promise.all([
      supabase.from('rules').select('id, name, description, priority, is_active').order('priority'),
      supabase.from('rule_conditions').select('rule_id'),
      supabase.from('rule_actions').select('rule_id'),
    ]);

    const conditionCounts = new Map<number, number>();
    for (const row of (conditionsRaw as { rule_id: number }[] | null) ?? []) {
      conditionCounts.set(row.rule_id, (conditionCounts.get(row.rule_id) ?? 0) + 1);
    }
    const actionCounts = new Map<number, number>();
    for (const row of (actionsRaw as { rule_id: number }[] | null) ?? []) {
      actionCounts.set(row.rule_id, (actionCounts.get(row.rule_id) ?? 0) + 1);
    }

    rules = (
      (rulesRaw as Omit<RuleRow, 'condition_count' | 'action_count'>[] | null) ?? []
    ).map((r) => ({
      ...r,
      condition_count: conditionCounts.get(r.id) ?? 0,
      action_count: actionCounts.get(r.id) ?? 0,
    }));
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

      <RulesTable rules={rules} />
    </div>
  );
}
