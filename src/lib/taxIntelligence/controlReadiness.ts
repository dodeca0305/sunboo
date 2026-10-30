import type { SupabaseClient } from '../supabase';

type Control = { id: number; control_code: string; title: string; control_kind: string; status: string; is_enabled: boolean };
type Rule = { id: number; rule_code: string; status: string };
export type ControlReadiness = Control & { rules: Rule[]; blockers: string[] };

// offsetはサーバーの返却上限を考慮し、実際の取得件数だけ進める。
async function readRows<T>(supabase: SupabaseClient, table: string, columns: string, order: string[]): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; ) {
    let query = supabase.from(table).select(columns);
    for (const column of order) query = query.order(column);
    const { data, error } = await query.range(offset, offset + 99);
    if (error || !data) throw new Error('税務チェックの承認状況を取得できませんでした。');
    if (!data.length) return rows;
    rows.push(...data as T[]);
    offset += data.length;
  }
}

export async function loadControlReadiness(supabase: SupabaseClient): Promise<ControlReadiness[]> {
  const [controls, rules, links, sources] = await Promise.all([
    readRows<Control>(supabase, 'tax_controls', 'id, control_code, title, control_kind, status, is_enabled', ['id']),
    readRows<Rule>(supabase, 'tax_rules', 'id, rule_code, status', ['id']),
    readRows<{ tax_control_id: number; tax_rule_id: number }>(supabase, 'tax_control_rules', 'tax_control_id, tax_rule_id', ['tax_control_id', 'tax_rule_id']),
    readRows<{ tax_source_version_id: number; tax_rule_id: number }>(supabase, 'tax_rule_source_versions', 'tax_rule_id, tax_source_version_id', ['tax_rule_id', 'tax_source_version_id']),
  ]);
  return controls.filter(control => control.control_kind === 'tax_rule').map(control => {
    const ids = [...new Set(links.filter(link => link.tax_control_id === control.id).map(link => link.tax_rule_id))];
    const linkedRules = rules.filter(rule => ids.includes(rule.id));
    const blockers: string[] = [];
    if (control.status !== 'approved') blockers.push('チェック未承認');
    if (!control.is_enabled) blockers.push('チェック無効');
    if (!ids.length) blockers.push('根拠ルール未登録');
    if (linkedRules.length !== ids.length) blockers.push('参照できない根拠ルールあり');
    if (linkedRules.some(rule => rule.status !== 'approved')) blockers.push('根拠ルール未承認');
    if (linkedRules.some(rule => !sources.some(source => source.tax_rule_id === rule.id))) blockers.push('根拠資料との紐付けなし');
    return { ...control, rules: linkedRules, blockers };
  });
}
