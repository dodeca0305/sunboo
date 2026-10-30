import test from 'node:test';
import assert from 'node:assert/strict';
import { loadControlReadiness } from './controlReadiness.ts';

type Row = Record<string, unknown>;
function client(tables: Record<string, Row[]>, failed = '') {
  return { from(table: string) {
    const query = {
      select() { return this; }, order() { return this; },
      async range(from: number) {
        // APIの上限が要求100より小さい場合も全行を読む。
        return { data: (tables[table] ?? []).slice(from, from + 1), error: table === failed ? { message: 'denied' } : null };
      },
    };
    return query;
  } } as never;
}
const control = { id: 1, control_code: 'TEST', title: 'Test', control_kind: 'tax_rule', status: 'approved', is_enabled: true };

test('下書き・無効・根拠未承認・資料未紐付けを区別する', async () => {
  const result = await loadControlReadiness(client({
    tax_controls: [{ ...control, status: 'draft', is_enabled: false }],
    tax_rules: [{ id: 2, rule_code: 'RULE', status: 'draft' }],
    tax_control_rules: [{ tax_control_id: 1, tax_rule_id: 2 }],
  }));
  assert.deepEqual(result[0].blockers, ['チェック未承認', 'チェック無効', '根拠ルール未承認', '根拠資料との紐付けなし']);
});
test('返却上限1件でも全チェックを取得し、検証用チェックを除外する', async () => {
  const result = await loadControlReadiness(client({
    tax_controls: [control, { ...control, id: 2 }, { ...control, id: 3, control_kind: 'smoke' }],
    tax_rules: [{ id: 9, rule_code: 'RULE', status: 'approved' }],
    tax_control_rules: [{ tax_control_id: 1, tax_rule_id: 9 }, { tax_control_id: 2, tax_rule_id: 10 }],
    tax_rule_source_versions: [{ tax_rule_id: 9, tax_source_version_id: 1 }],
  }));
  assert.equal(result.length, 2);
  assert.deepEqual(result[0].blockers, []);
  assert.deepEqual(result[1].blockers, ['参照できない根拠ルールあり']);
});
test('取得失敗を未登録と混同しない', async () => {
  await assert.rejects(loadControlReadiness(client({}, 'tax_rules')), /取得できません/);
});
