import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareDecisionActions,
  mergeDecisionActions,
  summarizeDecisionActions,
  selectUrgentDecisionActions,
  ACTION_MAX_ITEMS,
  type WorkspaceDecisionAction,
} from './workspaceDecisions.ts';

function action(overrides: Partial<WorkspaceDecisionAction> = {}): WorkspaceDecisionAction {
  return {
    priority: 'medium',
    title: 'サンプル手続き',
    reason: '早めに着手することをおすすめします。',
    dueDate: null,
    ...overrides,
  };
}

test('compareDecisionActions: 優先度が異なる場合はhigh→medium→lowの順になる', () => {
  const low = action({ priority: 'low', title: 'low' });
  const high = action({ priority: 'high', title: 'high' });
  const medium = action({ priority: 'medium', title: 'medium' });
  const sorted = [low, high, medium].sort(compareDecisionActions);
  assert.deepEqual(sorted.map((a) => a.title), ['high', 'medium', 'low']);
});

test('compareDecisionActions: 同じ優先度では実際の期限が近いものを優先する', () => {
  const later = action({ priority: 'high', title: 'later', dueDate: '2026-11-30' });
  const sooner = action({ priority: 'high', title: 'sooner', dueDate: '2026-10-20' });
  const sorted = [later, sooner].sort(compareDecisionActions);
  assert.deepEqual(sorted.map((a) => a.title), ['sooner', 'later']);
});

test('compareDecisionActions: 期限の無い項目（架空の期限を付けない）は同優先度内で最後方になる', () => {
  const noDueDate = action({ priority: 'medium', title: '入力案内', dueDate: null });
  const withDueDate = action({ priority: 'medium', title: '手続き', dueDate: '2026-12-31' });
  const sorted = [noDueDate, withDueDate].sort(compareDecisionActions);
  assert.deepEqual(sorted.map((a) => a.title), ['手続き', '入力案内']);
});

test('mergeDecisionActions: 手続き起因と売上・資金繰り起因のactionsを共通の優先順位で合流させる', () => {
  const procedureActions = [action({ priority: 'medium', title: '消費税申告', dueDate: '2026-11-30' })];
  const growthActions = [action({ priority: 'high', title: '今月の資金繰り', dueDate: '2026-10-31' })];
  const merged = mergeDecisionActions(procedureActions, growthActions);
  assert.deepEqual(merged.map((a) => a.title), ['今月の資金繰り', '消費税申告']);
});

test('mergeDecisionActions: 件数上限（既定ACTION_MAX_ITEMS）を超えた分は切り捨てる', () => {
  const base = Array.from({ length: 6 }, (_, i) => action({ priority: 'high', title: `手続き${i}`, dueDate: `2026-10-0${i + 1}` }));
  const extra = Array.from({ length: 6 }, (_, i) => action({ priority: 'high', title: `growth${i}`, dueDate: `2026-10-1${i}` }));
  const merged = mergeDecisionActions(base, extra);
  assert.equal(merged.length, ACTION_MAX_ITEMS);
});

test('summarizeDecisionActions: マージ後の配列から件数を数えるため、表示件数とsummaryが一致する（二重計上防止）', () => {
  const merged = [
    action({ priority: 'high', title: 'A' }),
    action({ priority: 'high', title: 'B' }),
    action({ priority: 'medium', title: 'C' }),
  ];
  assert.equal(summarizeDecisionActions(merged), '優先度の高い対応が2件あります。至急ご確認ください。');
});

test('summarizeDecisionActions: high優先度が無い場合は件数のみの文言になる', () => {
  const merged = [action({ priority: 'medium', title: 'A' }), action({ priority: 'low', title: 'B' })];
  assert.equal(summarizeDecisionActions(merged), '対応が必要な項目が2件あります。');
});

test('summarizeDecisionActions: 空配列なら急ぎの意思決定は無い旨を返す', () => {
  assert.equal(summarizeDecisionActions([]), '現時点で急ぎの意思決定は必要ありません。');
});

test('selectUrgentDecisionActions: high優先度が1件以上あればhighのみを返す（mediumは含めない）', () => {
  const merged = [
    action({ priority: 'high', title: 'A' }),
    action({ priority: 'medium', title: 'B' }),
    action({ priority: 'low', title: 'C' }),
  ];
  assert.deepEqual(selectUrgentDecisionActions(merged).map((a) => a.title), ['A']);
});

test('selectUrgentDecisionActions: high優先度が0件ならmediumを返す（既存のwarnings優先・無ければpriorityと同じ二段フォールバック）', () => {
  const merged = [action({ priority: 'medium', title: 'B' }), action({ priority: 'low', title: 'C' })];
  assert.deepEqual(selectUrgentDecisionActions(merged).map((a) => a.title), ['B']);
});

test('selectUrgentDecisionActions: high・mediumともに0件なら空配列を返す（low単体は今日やることに出さない）', () => {
  const merged = [action({ priority: 'low', title: 'C' })];
  assert.deepEqual(selectUrgentDecisionActions(merged), []);
});
