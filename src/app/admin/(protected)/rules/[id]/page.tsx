import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase/server';
import RuleForm, { type ConditionFormRow, type ActionFormRow, type RuleFormValues } from '../RuleForm';

export default async function EditRulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();

  if (!supabase) {
    return <p className="text-sm text-gray-500">Supabase が設定されていません。</p>;
  }

  const [{ data: ruleRaw }, { data: conditionsRaw }, { data: actionsRaw }, { data: proceduresRaw }] =
    await Promise.all([
      supabase.from('rules').select('*').eq('id', id).maybeSingle(),
      supabase.from('rule_conditions').select('id, field, operator, value').eq('rule_id', id).order('sort_order'),
      supabase
        .from('rule_actions')
        .select('id, action_type, procedure_id, payload')
        .eq('rule_id', id)
        .order('sort_order'),
      supabase.from('procedures').select('id, code, name').order('name'),
    ]);

  if (!ruleRaw) notFound();

  const rule = ruleRaw as {
    id: number;
    name: string;
    description: string | null;
    priority: number;
    is_active: boolean;
  };

  const initialRule: RuleFormValues = {
    id: rule.id,
    name: rule.name,
    description: rule.description ?? '',
    priority: rule.priority,
    is_active: rule.is_active,
  };

  const initialConditions: ConditionFormRow[] = (
    (conditionsRaw as { id: number; field: string; operator: string; value: unknown }[] | null) ?? []
  ).map((c) => ({
    key: `existing-${c.id}`,
    field: c.field,
    operator: c.operator,
    value: JSON.stringify(c.value),
  }));

  const initialActions: ActionFormRow[] = (
    (actionsRaw as {
      id: number;
      action_type: string;
      procedure_id: number | null;
      payload: Record<string, unknown> | null;
    }[] | null) ?? []
  ).map((a) => ({
    key: `existing-${a.id}`,
    action_type: a.action_type,
    procedure_id: a.procedure_id ? String(a.procedure_id) : '',
    payload: a.payload ? JSON.stringify(a.payload) : '',
  }));

  const procedures = (proceduresRaw as { id: number; code: string; name: string }[] | null) ?? [];

  return (
    <div className="space-y-6">
      <Link href="/admin/rules" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
        <ChevronLeft className="h-4 w-4" />
        ルール一覧に戻る
      </Link>
      <h1 className="text-xl font-bold text-gray-900">ルールを編集</h1>
      <RuleForm
        initialRule={initialRule}
        initialConditions={initialConditions}
        initialActions={initialActions}
        procedures={procedures}
      />
    </div>
  );
}
