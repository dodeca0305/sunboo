import type { SupabaseClient } from './supabase';

// ── ルールエンジン（Phase 2.5）───────────────────────────────
// rules × rule_conditions × rule_actions を評価し、「どの手続きを追加するか」
// 「どの警告を出すか」「提出先・期限をどう上書きするか」を求める汎用エンジン。
// 特定のイベント種別や条件フィールドをこのファイルにハードコードしない
// （新しい条件・アクションはDBにルールを追加するだけで反映される）。

export type RuleOperator = 'eq' | 'neq' | 'in' | 'not_in' | 'gt' | 'gte' | 'lt' | 'lte';

export type RuleActionType = 'add_procedure' | 'show_warning' | 'change_office' | 'change_deadline';

// 評価対象のコンテキスト。呼び出し側（例: 経営イベントエンジン）が用意する。
// 将来 capital（資本金）や industry_code（業種）等のキーを追加しても、
// このファイルの評価ロジックは変更不要（rule_conditions.field で参照するだけ）。
export type RuleContext = Record<string, unknown>;

export type RuleWarning = { message: string; severity: 'info' | 'warning' };

export type RuleEvaluationResult = {
  matchedRuleNames: string[];
  addProcedureIds: number[];
  warnings: RuleWarning[];
  officeOverrides: Map<number, string>; // procedure_id -> office_type（procedures.office_type の代わりに使う）
  deadlineOverrides: Map<number, number>; // procedure_id -> days_from_event（procedures.timing_data の代わりに使う）
};

type ConditionRow = {
  field: string;
  operator: RuleOperator;
  value: unknown;
};

type ActionRow = {
  action_type: RuleActionType;
  procedure_id: number | null;
  payload: Record<string, unknown> | null;
  sort_order: number;
};

type RuleRow = {
  id: number;
  name: string;
  priority: number;
  is_active: boolean;
  rule_conditions: ConditionRow[];
  rule_actions: ActionRow[];
};

function evaluateCondition(context: RuleContext, cond: ConditionRow): boolean {
  const actual = context[cond.field];
  const expected = cond.value;

  switch (cond.operator) {
    case 'eq':
      return actual === expected;
    case 'neq':
      return actual !== expected;
    case 'in':
      return Array.isArray(expected) && expected.some((v) => v === actual);
    case 'not_in':
      return Array.isArray(expected) && !expected.some((v) => v === actual);
    case 'gt':
      return Number(actual) > Number(expected);
    case 'gte':
      return Number(actual) >= Number(expected);
    case 'lt':
      return Number(actual) < Number(expected);
    case 'lte':
      return Number(actual) <= Number(expected);
    default:
      return false;
  }
}

export async function evaluateRules(
  client: SupabaseClient,
  context: RuleContext,
): Promise<RuleEvaluationResult> {
  const { data: rulesRaw } = await client
    .from('rules')
    .select(
      `id, name, priority, is_active,
       rule_conditions(field, operator, value),
       rule_actions(action_type, procedure_id, payload, sort_order)`,
    )
    .eq('is_active', true)
    .order('priority');

  const rules = (rulesRaw as RuleRow[] | null) ?? [];

  const result: RuleEvaluationResult = {
    matchedRuleNames: [],
    addProcedureIds: [],
    warnings: [],
    officeOverrides: new Map(),
    deadlineOverrides: new Map(),
  };

  for (const rule of rules) {
    const conditions = rule.rule_conditions ?? [];
    const isMatch = conditions.every((c) => evaluateCondition(context, c));
    if (!isMatch) continue;

    result.matchedRuleNames.push(rule.name);

    const actions = [...(rule.rule_actions ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    for (const action of actions) {
      switch (action.action_type) {
        case 'add_procedure': {
          if (action.procedure_id && !result.addProcedureIds.includes(action.procedure_id)) {
            result.addProcedureIds.push(action.procedure_id);
          }
          break;
        }
        case 'show_warning': {
          const message = action.payload?.message as string | undefined;
          const severity = (action.payload?.severity as 'info' | 'warning' | undefined) ?? 'info';
          if (message) result.warnings.push({ message, severity });
          break;
        }
        case 'change_office': {
          const officeType = action.payload?.office_type as string | undefined;
          if (action.procedure_id && officeType) {
            // priority昇順で評価するため、競合時は後（priorityが大きい方）が勝つ
            result.officeOverrides.set(action.procedure_id, officeType);
          }
          break;
        }
        case 'change_deadline': {
          const days = action.payload?.days_from_event as number | undefined;
          if (action.procedure_id && typeof days === 'number') {
            result.deadlineOverrides.set(action.procedure_id, days);
          }
          break;
        }
      }
    }
  }

  return result;
}
