import type { SupabaseClient } from './supabase';

type Client = Pick<SupabaseClient, 'from'>;
export type AdminRule = { id: number; name: string; description: string | null; priority: number; is_active: boolean; updated_at: string };
export type RuleCondition = { id: number; field: string; operator: string; value: unknown };
export type RuleAction = { id: number; action_type: string; procedure_id: number | null; payload: unknown };
export type RuleProcedure = { id: number; code: string; name: string };
export type RuleConfiguration = {
  rule: { name: string; description: string | null; priority: number; is_active: boolean };
  conditions: { field: string; operator: string; value: unknown }[];
  actions: { action_type: string; procedure_id: number | null; payload: unknown }[];
};
export type AdminRuleData = { rule: AdminRule; conditions: RuleCondition[]; actions: RuleAction[]; procedures: RuleProcedure[] };
export type RuleSaveIntent = {
  version: 1;
  id: number | null;
  expectedUpdatedAt: string | null;
  configuration: RuleConfiguration;
  baseline?: RuleConfiguration;
};
const operators = ['eq','neq','in','not_in','gt','gte','lt','lte'];
const actionTypes = ['add_procedure','show_warning','change_office','change_deadline'];
const positiveId = (id: unknown): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id > 0;
function proceduresValid(rows: unknown): rows is RuleProcedure[] {
  return Array.isArray(rows) && rows.every(row => row && positiveId(row.id) && typeof row.code === 'string' && typeof row.name === 'string');
}
export async function loadAdminRuleProcedures(client: Client): Promise<RuleProcedure[] | null> {
  try {
    const { data, error } = await client.from('procedures').select('id, code, name').order('name');
    return !error && proceduresValid(data) ? data : null;
  } catch { return null; }
}
export async function loadAdminRuleForEditing(client: Client, id: number): Promise<
  { status: 'loaded'; data: AdminRuleData } | { status: 'not_found' } | { status: 'unavailable' }
> {
  try {
    const [rule, conditions, actions, procedures] = await Promise.all([
      client.from('rules').select('*').eq('id', id).maybeSingle(),
      client.from('rule_conditions').select('id, field, operator, value').eq('rule_id', id).order('sort_order').order('id'),
      client.from('rule_actions').select('id, action_type, procedure_id, payload').eq('rule_id', id).order('sort_order').order('id'),
      loadAdminRuleProcedures(client),
    ]);
    if (rule.error || conditions.error || actions.error || rule.data === undefined
      || !Array.isArray(conditions.data) || !Array.isArray(actions.data) || procedures === null) return { status: 'unavailable' };
    if (rule.data === null) return { status: 'not_found' };
    const r = rule.data;
    if (r.id !== id || typeof r.name !== 'string' || (r.description !== null && typeof r.description !== 'string')
      || !Number.isSafeInteger(r.priority) || typeof r.is_active !== 'boolean'
      || typeof r.updated_at !== 'string' || !Number.isFinite(Date.parse(r.updated_at))) return { status: 'unavailable' };
    if (conditions.data.some(c => !c || !positiveId(c.id) || typeof c.field !== 'string' || !c.field.trim()
      || !operators.includes(c.operator) || c.value === undefined)) return { status: 'unavailable' };
    if (actions.data.some(a => !a || !positiveId(a.id) || !actionTypes.includes(a.action_type)
      || (a.procedure_id !== null && !positiveId(a.procedure_id)) || a.payload === undefined)) return { status: 'unavailable' };
    return { status: 'loaded', data: { rule: r as AdminRule, conditions: conditions.data as RuleCondition[], actions: actions.data as RuleAction[], procedures } };
  } catch { return { status: 'unavailable' }; }
}
export function ruleConfiguration(data: AdminRuleData): RuleConfiguration {
  return {
    rule: { name: data.rule.name, description: data.rule.description, priority: data.rule.priority, is_active: data.rule.is_active },
    conditions: data.conditions.map(({ field, operator, value }) => ({ field, operator, value })),
    actions: data.actions.map(({ action_type, procedure_id, payload }) => ({ action_type, procedure_id, payload })),
  };
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.entries(value).sort(([a],[b]) => a.localeCompare(b))
    .map(([k,v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
  return JSON.stringify(value) ?? 'null';
}
export async function reconcileRuleSave(client: Client, intent: RuleSaveIntent): Promise<
  { status: 'saved'; id: number } | { status: 'unchanged' | 'absent' | 'unavailable' } | { status: 'conflict'; id: number }
> {
  try {
    let id = intent.id;
    if (id === null) {
      const { data, error } = await client.from('rules').select('id').eq('name', intent.configuration.rule.name).maybeSingle();
      if (error || data === undefined) return { status: 'unavailable' };
      if (data === null) return { status: 'absent' };
      if (!positiveId(data.id)) return { status: 'unavailable' };
      id = data.id;
    }
    const result = await loadAdminRuleForEditing(client, id);
    if (result.status !== 'loaded') return { status: result.status === 'not_found' ? 'absent' : 'unavailable' };
    const current = ruleConfiguration(result.data);
    if (canonical(current) === canonical(intent.configuration)) return { status: 'saved', id };
    if (intent.id !== null && result.data.rule.updated_at === intent.expectedUpdatedAt && intent.baseline
      && canonical(current) === canonical(intent.baseline)) return { status: 'unchanged' };
    return { status: 'conflict', id };
  } catch { return { status: 'unavailable' }; }
}
export function isRuleSaveIntent(value: unknown): value is RuleSaveIntent {
  if (!value || typeof value !== 'object') return false;
  const v = value as RuleSaveIntent;
  return v.version === 1 && (v.id === null || positiveId(v.id))
    && (v.expectedUpdatedAt === null || typeof v.expectedUpdatedAt === 'string')
    && !!v.configuration && typeof v.configuration.rule?.name === 'string'
    && Array.isArray(v.configuration.conditions) && Array.isArray(v.configuration.actions);
}
