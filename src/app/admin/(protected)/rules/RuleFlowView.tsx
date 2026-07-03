import { ArrowDown, Plus, AlertTriangle, MapPin, Clock, Workflow } from 'lucide-react';
import { ruleOperatorLabel } from '@/lib/adminConstants';
import type { RuleWithDetails, RuleActionDetail } from './RulesView';

const ACTION_ICON: Record<string, typeof Plus> = {
  add_procedure: Plus,
  show_warning: AlertTriangle,
  change_office: MapPin,
  change_deadline: Clock,
};

const ACTION_COLOR: Record<string, string> = {
  add_procedure: 'border-blue-200 bg-blue-50 text-blue-700',
  show_warning: 'border-amber-200 bg-amber-50 text-amber-700',
  change_office: 'border-gray-200 bg-gray-50 text-gray-700',
  change_deadline: 'border-gray-200 bg-gray-50 text-gray-700',
};

function formatConditionValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.join(', ')}]`;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

function actionLabel(action: RuleActionDetail, procedureMap: Map<number, string>): string {
  const procName = action.procedure_id ? (procedureMap.get(action.procedure_id) ?? `#${action.procedure_id}`) : null;
  switch (action.action_type) {
    case 'add_procedure':
      return `手続き追加: ${procName ?? '(未設定)'}`;
    case 'show_warning': {
      const msg = (action.payload?.message as string | undefined) ?? '(メッセージ未設定)';
      return `警告表示: ${msg}`;
    }
    case 'change_office': {
      const officeType = (action.payload?.office_type as string | undefined) ?? '?';
      return `提出先変更: ${procName ?? '(未設定)'} → ${officeType}`;
    }
    case 'change_deadline': {
      const days = action.payload?.days_from_event;
      return `期限変更: ${procName ?? '(未設定)'} → ${typeof days === 'number' ? `${days}日` : '?'}`;
    }
    default:
      return action.action_type;
  }
}

export default function RuleFlowView({
  rules,
  procedures,
}: {
  rules: RuleWithDetails[];
  procedures: { id: number; name: string }[];
}) {
  const procedureMap = new Map(procedures.map((p) => [p.id, p.name]));

  if (rules.length === 0) {
    return (
      <div className="card py-12 text-center">
        <Workflow className="mx-auto mb-3 h-10 w-10 text-gray-300" />
        <p className="font-semibold text-gray-700">ルールがまだ登録されていません</p>
      </div>
    );
  }

  const sortedRules = [...rules].sort((a, b) => a.priority - b.priority);

  return (
    <div className="space-y-4">
      {sortedRules.map((rule) => {
        const conditions = [...rule.rule_conditions].sort((a, b) => a.sort_order - b.sort_order);
        const actions = [...rule.rule_actions].sort((a, b) => a.sort_order - b.sort_order);

        return (
          <div key={rule.id} className={`card ${rule.is_active ? '' : 'opacity-50'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-gray-900">{rule.name}</p>
                {rule.description && <p className="mt-0.5 text-xs text-gray-400">{rule.description}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="tag">優先度 {rule.priority}</span>
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    rule.is_active ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {rule.is_active ? '有効' : '無効'}
                </span>
              </div>
            </div>

            <div className="mt-5 flex flex-col items-center gap-2.5">
              <p className="text-xs font-semibold text-gray-400">
                条件{conditions.length > 1 ? '（すべて満たす）' : ''}
              </p>
              {conditions.length === 0 ? (
                <span className="inline-flex items-center rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-500">
                  条件なし（常に成立）
                </span>
              ) : (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {conditions.map((c, idx) => (
                    <div key={c.id} className="flex items-center gap-2">
                      {idx > 0 && <span className="text-xs font-medium text-gray-400">AND</span>}
                      <span className="inline-flex items-center rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 font-mono text-xs text-gray-700">
                        {c.field} {ruleOperatorLabel(c.operator)} {formatConditionValue(c.value)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <ArrowDown className="h-4 w-4 text-gray-300" />
              <p className="text-xs font-semibold text-gray-400">成立すると実行</p>

              <div className="flex flex-wrap items-center justify-center gap-2">
                {actions.map((a) => {
                  const Icon = ACTION_ICON[a.action_type] ?? Plus;
                  return (
                    <span
                      key={a.id}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                        ACTION_COLOR[a.action_type] ?? 'border-gray-200 bg-gray-50 text-gray-700'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      {actionLabel(a, procedureMap)}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
