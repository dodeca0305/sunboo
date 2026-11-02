import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase/server';
import { loadAdminRuleForEditing, ruleConfiguration } from '@/lib/adminRuleData';
import RuleLoadError from '../RuleLoadError';
import RuleForm, { type ConditionFormRow, type ActionFormRow, type RuleFormValues } from '../RuleForm';

export default async function EditRulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();

  if (!supabase) {
    return <p className="text-sm text-gray-500">Supabase が設定されていません。</p>;
  }

  const ruleId = Number(id);
  if (!Number.isSafeInteger(ruleId) || ruleId <= 0) notFound();
  const result = await loadAdminRuleForEditing(supabase, ruleId);
  if (result.status === 'not_found') notFound();
  if (result.status === 'unavailable') {
    return <RuleLoadError href={`/admin/rules/${ruleId}`} />;
  }
  const { rule, conditions, actions, procedures } = result.data;
  const initialRule: RuleFormValues = { ...rule, description: rule.description ?? '' };
  const initialConditions: ConditionFormRow[] = conditions.map(c => ({
    key: `existing-${c.id}`, field: c.field, operator: c.operator, value: JSON.stringify(c.value),
  }));
  const initialActions: ActionFormRow[] = actions.map(a => ({
    key: `existing-${a.id}`, action_type: a.action_type,
    procedure_id: a.procedure_id === null ? '' : String(a.procedure_id),
    payload: a.payload === null ? '' : JSON.stringify(a.payload),
  }));

  return (
    <div className="space-y-6">
      <Link href="/admin/rules" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
        <ChevronLeft className="h-4 w-4" />
        ルール一覧に戻る
      </Link>
      <h1 className="text-xl font-bold text-gray-900">ルールを編集</h1>
      <RuleForm
        key={JSON.stringify(result.data)}
        initialConfiguration={ruleConfiguration(result.data)}
        initialRule={initialRule}
        initialConditions={initialConditions}
        initialActions={initialActions}
        procedures={procedures}
      />
    </div>
  );
}
