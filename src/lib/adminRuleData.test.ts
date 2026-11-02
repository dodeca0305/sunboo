import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAdminRuleForEditing, loadAdminRuleProcedures, ruleConfiguration, reconcileRuleSave, isRuleSaveIntent, type RuleSaveIntent } from './adminRuleData.ts';
const base = {
  rules: { data: { id: 900001, name: 'synthetic rule', description: null, priority: 1, is_active: false, updated_at: '2026-01-01T00:00:00+00:00' }, error: null },
  rule_conditions: { data: [{ id: 1, field: 'event_type_code', operator: 'eq', value: { b: true, a: 'old' } }], error: null },
  rule_actions: { data: [{ id: 1, action_type: 'show_warning', procedure_id: null, payload: { message: 'old' } }], error: null },
  procedures: { data: [{ id: 1, code: 'SYNTHETIC', name: 'synthetic procedure' }], error: null },
};
type Response = { data?: unknown; error?: unknown };
function fake(overrides: Record<string, Response | Error> = {}) {
  const calls: unknown[][] = [];
  const client = { from(table: keyof typeof base) {
    calls.push(['from', table]);
    const query = {
      select(columns: string) { calls.push(['select', table, columns]); return query; },
      eq(column: string, value: unknown) { calls.push(['eq', table, column, value]); return query; },
      order(column: string) { calls.push(['order', table, column]); return query; },
      maybeSingle() { return query; },
      then(resolve: (value: Response) => unknown, reject: (e: Error) => unknown) {
        const r = overrides[table] ?? base[table];
        return (r instanceof Error ? Promise.reject(r) : Promise.resolve(r)).then(resolve, reject);
      },
    };
    return query;
  } } as unknown as Parameters<typeof loadAdminRuleForEditing>[0];
  return { client, calls };
}
async function loaded() {
  const r = await loadAdminRuleForEditing(fake().client, 900001);
  assert.equal(r.status, 'loaded');
  if (r.status !== 'loaded') throw new Error('fixture');
  return r.data;
}
test('取得した全設定とJSON値・更新時刻・順序を維持し、IDで絞る', async () => {
  const { client, calls } = fake();
  const r = await loadAdminRuleForEditing(client, 900001);
  assert.equal(r.status, 'loaded');
  assert.ok(calls.some(c => JSON.stringify(c) === JSON.stringify(['eq', 'rules', 'id', 900001])));
  for (const table of ['rule_conditions','rule_actions']) assert.ok(calls.some(c => JSON.stringify(c) === JSON.stringify(['eq',table,'rule_id',900001])));
  if (r.status === 'loaded') assert.deepEqual(ruleConfiguration(r.data).conditions[0].value, { b: true, a: 'old' });
});
test('正常な空設定・空の手続き候補でも編集可能', async () => {
  assert.equal((await loadAdminRuleForEditing(fake({ rule_conditions: { data: [], error: null }, rule_actions: { data: [], error: null }, procedures: { data: [], error: null } }).client, 900001)).status, 'loaded');
});
test('正常なnullだけをnot_foundとし、取得失敗とは区別する', async () => {
  assert.equal((await loadAdminRuleForEditing(fake({ rules: { data: null, error: null } }).client, 900001)).status, 'not_found');
});
for (const table of Object.keys(base)) for (const [kind,response] of Object.entries({
  error: { data: null, error: { message: 'failed' } }, partial: { ...base[table as keyof typeof base], error: { message: 'failed' } },
  missing: { error: null }, malformed: { data: 'invalid', error: null }, exception: new Error('network'),
})) test(`${table}: ${kind}で空の編集フォームを渡さない`, async () => {
  assert.equal((await loadAdminRuleForEditing(fake({ [table]: response }).client,900001)).status, 'unavailable');
});
for (const table of ['rule_conditions','rule_actions','procedures']) test(`${table}: nullは正常な0件ではない`, async () => {
  assert.equal((await loadAdminRuleForEditing(fake({ [table]: { data: null, error: null } }).client,900001)).status,'unavailable');
});
test('新規ページも手続き候補の失敗を空配列へ変換しない', async () => {
  assert.equal(await loadAdminRuleProcedures(fake({ procedures: new Error('network') }).client), null);
  assert.deepEqual(await loadAdminRuleProcedures(fake({ procedures: { data: [], error: null } }).client), []);
});
for (const [table,data] of Object.entries({
  rules: { ...base.rules.data, updated_at: null },
  rule_conditions: [{ ...base.rule_conditions.data[0], value: undefined }],
  rule_actions: [{ ...base.rule_actions.data[0], action_type: 'unknown' }],
  procedures: [{ id: 0, code: 'x', name: 'x' }],
})) test(`${table}: 不正な行を拒否`, async () => {
  assert.equal((await loadAdminRuleForEditing(fake({ [table]: { data, error: null } }).client,900001)).status,'unavailable');
});
async function intent(): Promise<RuleSaveIntent> {
  const d = await loaded();
  return { version: 1, id: d.rule.id, expectedUpdatedAt: d.rule.updated_at, baseline: ruleConfiguration(d), configuration: { ...ruleConfiguration(d), rule: { ...ruleConfiguration(d).rule, name: 'changed' } } };
}
test('通信例外後の再取得: 同じ全設定の保存済みを確認', async () => {
  const i = await intent();
  assert.deepEqual(await reconcileRuleSave(fake({ rules: { data: { ...base.rules.data, name: 'changed', updated_at: '2026-02-01Z' }, error: null } }).client,i), { status: 'saved', id: 900001 });
});
test('通信例外後の再取得: 全設定・更新時刻が元のままなら未反映', async () => {
  assert.deepEqual(await reconcileRuleSave(fake().client,await intent()), { status: 'unchanged' });
});
test('別の更新や一部だけ一致する設定は保存済みとしない', async () => {
  const i = await intent();
  assert.deepEqual(await reconcileRuleSave(fake({ rules: { data: { ...base.rules.data, name: 'changed' }, error: null }, rule_actions: { data: [], error: null } }).client,i), { status: 'conflict', id: 900001 });
});
test('再取得が失敗したら結果不明を維持する', async () => {
  assert.deepEqual(await reconcileRuleSave(fake({ rule_conditions: new Error('offline') }).client,await intent()), { status: 'unavailable' });
});
test('新規作成の応答喪失は名称で探し、同じ全設定を確認', async () => {
  const i = await intent(); i.id = null;
  const { client, calls } = fake({ rules: { data: { ...base.rules.data, name: 'changed' }, error: null } });
  assert.deepEqual(await reconcileRuleSave(client,i), { status: 'saved', id: 900001 });
  assert.ok(calls.some(c => JSON.stringify(c) === JSON.stringify(['eq','rules','name','changed'])));
});
test('新規名の検索失敗と正常な不存在は区別', async () => {
  const i = await intent(); i.id = null;
  assert.deepEqual(await reconcileRuleSave(fake({ rules: { data: null, error: null } }).client,i), { status: 'absent' });
  assert.deepEqual(await reconcileRuleSave(fake({ rules: new Error('offline') }).client,i), { status: 'unavailable' });
});
test('保存記録の形式を確認し、不明な記録を再送しない', async () => {
  assert.ok(isRuleSaveIntent(await intent()));
  for (const x of [null,{}, { version: 2 },{ ...(await intent()), id: -1 }]) assert.equal(isRuleSaveIntent(x),false);
});
