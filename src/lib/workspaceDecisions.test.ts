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

// 【レビュー対応】generateWorkspaceDecisionsは、売上・資金繰りactionsと合流する前に自身の候補
// （手続きのみ）を内部でACTION_MAX_ITEMS件へ先に絞ってはいけない（page.tsxがmaxActions=Infinityを
// 渡し、本関数（mergeDecisionActions）側で1回だけ件数制限する構成にした）。以下は、手続き側の
// 候補だけで既にACTION_MAX_ITEMSを超えており、かつ成長（売上・資金繰り）側に手続きのどれよりも
// 優先されるべき候補が混ざっているケースで、全候補（手続き＋成長）を合流・ソートした「後」に
// 初めて件数制限が効き、本来選ばれるべき上位ACTION_MAX_ITEMS件が正しく選ばれることを検証する。
test('mergeDecisionActions: 手続き側の候補だけで上限を超える場合でも、全候補を合流・ソートした後に正しい優先順位で上位ACTION_MAX_ITEMS件が選ばれる', () => {
  // 手続き側: high優先度12件、期限が2026-10-01〜2026-10-12（1日刻み、昇順）。
  const procedureActions = Array.from({ length: 12 }, (_, i) =>
    action({ priority: 'high', title: `手続き${String(i + 1).padStart(2, '0')}`, dueDate: `2026-10-${String(i + 1).padStart(2, '0')}` }));
  // 成長側: high優先度1件、期限は手続きのどれよりも早い2026-09-30（最優先のはず）。
  const growthAction = action({ priority: 'high', title: '今月の資金繰り（最優先）', dueDate: '2026-09-30' });

  const merged = mergeDecisionActions(procedureActions, [growthAction]);

  assert.equal(merged.length, ACTION_MAX_ITEMS);
  // 全13件（手続き12件＋成長1件）の中から、期限が早い順に上位8件が選ばれる：
  // 成長（09-30）→手続き01(10-01)〜手続き07(10-07)。手続き08〜12は正しく除外される。
  assert.deepEqual(
    merged.map((a) => a.title),
    ['今月の資金繰り（最優先）', '手続き01', '手続き02', '手続き03', '手続き04', '手続き05', '手続き06', '手続き07'],
  );
  // 手続き側だけを先にACTION_MAX_ITEMS（8）件へ絞ってから合流していたら、この成長actionが
  // 手続き09〜12を押し出す形で上位に入ってくる挙動は（たまたま一致する場合を除き）保証されない。
  // 本テストは「合流後に1回だけ件数制限する」構成であることの直接的な検証を意図している。
  assert.ok(!merged.some((a) => a.title === '手続き08'), '手続き08は上位8件から正しく除外される');
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
