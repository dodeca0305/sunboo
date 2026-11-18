import test from 'node:test';
import assert from 'node:assert/strict';
import { growthNotificationToDecisionAction, growthNotificationsToDecisionActions } from './workspaceGrowthActions.ts';
import { currentWeekStart } from './monthlySalesProgress.ts';
import type { WorkspaceNotification } from './workspaceNotifications';

function notification(overrides: Partial<WorkspaceNotification> = {}): WorkspaceNotification {
  return {
    id: 'sales:shortfall:2026-10',
    severity: 'high',
    category: 'sales',
    title: '今月の売上目標',
    message: '目標に対して¥600,000不足しています。',
    dueDate: '2026-10-31',
    ...overrides,
  };
}

test('growthNotificationToDecisionAction: severity/title/messageをpriority/title/reasonへそのまま転記する（新しい判断ロジックを持たない）', () => {
  const action = growthNotificationToDecisionAction(notification(), 17, '2026-10');
  assert.equal(action.priority, 'high');
  assert.equal(action.title, '今月の売上目標');
  assert.equal(action.reason, '目標に対して¥600,000不足しています。');
});

test('growthNotificationToDecisionAction: dueDateをそのまま引き継ぐ（架空の期限を補わない）', () => {
  const action = growthNotificationToDecisionAction(notification({ dueDate: '2026-10-31' }), 17, '2026-10');
  assert.equal(action.dueDate, '2026-10-31');
});

test('growthNotificationToDecisionAction: dueDateがnullの通知（入力案内・取得失敗）はnullのまま引き継ぐ', () => {
  const action = growthNotificationToDecisionAction(notification({ dueDate: null }), 17, '2026-10');
  assert.equal(action.dueDate, null);
});

test('growthNotificationToDecisionAction: dueDateがundefinedの通知もnull扱いにする', () => {
  const withoutDueDate = notification();
  delete (withoutDueDate as Partial<WorkspaceNotification>).dueDate;
  const action = growthNotificationToDecisionAction(withoutDueDate, 17, '2026-10');
  assert.equal(action.dueDate, null);
});

test('growthNotificationToDecisionAction: procedureIdは常にnull（手続き起因ではないことを示す）', () => {
  const action = growthNotificationToDecisionAction(notification(), 17, '2026-10');
  assert.equal(action.procedureId, null);
});

test('growthNotificationToDecisionAction: actionHrefは該当月の売上目標画面（基準日なしは/growth?date=YYYY-MM-01）を指す', () => {
  const action = growthNotificationToDecisionAction(notification(), 17, '2026-10');
  assert.equal(action.actionHref, '/admin/workspaces/17/growth?date=2026-10-01');
});

test('growthNotificationsToDecisionActions: 複数件をまとめて変換する', () => {
  const actions = growthNotificationsToDecisionActions(
    [notification({ id: 'sales:shortfall:2026-10' }), notification({ id: 'cash:shortage:2026-10', category: 'cash', title: '今月の資金繰り' })],
    17,
    '2026-10',
  );
  assert.equal(actions.length, 2);
  assert.deepEqual(actions.map((a) => a.title), ['今月の売上目標', '今月の資金繰り']);
  assert.ok(actions.every((a) => a.actionHref === '/admin/workspaces/17/growth?date=2026-10-01'));
});

test('growthNotificationsToDecisionActions: 空配列なら空配列を返す', () => {
  assert.deepEqual(growthNotificationsToDecisionActions([], 17, '2026-10'), []);
});

const hrefOf = (ym: string, ref?: string | null, n = notification()) =>
  growthNotificationToDecisionAction(n, 23, ym, ref).actionHref;

test('基準日が対象月内なら、その日をgrowth?date=に使う（2026-11-18、週は11-16）', () => {
  const href = hrefOf('2026-11', '2026-11-18');
  assert.equal(href, '/admin/workspaces/23/growth?date=2026-11-18');
  assert.equal(currentWeekStart(new Date('2026-11-18T03:00:00Z')), '2026-11-16');
});

test('売上・資金繰りの両通知で同じ基準日が使われ、優先度/文言/dueDateは不変', () => {
  const sales = notification({ dueDate: null });
  const cash = notification({ category: 'cash', title: '今月の資金繰り', severity: 'medium', dueDate: '2026-11-30' });
  const [a, b] = growthNotificationsToDecisionActions([sales, cash], 23, '2026-11', '2026-11-18');
  assert.equal(a.actionHref, '/admin/workspaces/23/growth?date=2026-11-18');
  assert.equal(b.actionHref, '/admin/workspaces/23/growth?date=2026-11-18');
  assert.equal(a.dueDate, null);
  assert.equal(b.dueDate, '2026-11-30');
  assert.equal(b.priority, 'medium');
  assert.equal(b.title, '今月の資金繰り');
  assert.equal(b.reason, cash.message);
});

test('閏日は実在する年だけ有効、2026-02-30等は1日へフォールバック', () => {
  assert.equal(hrefOf('2028-02', '2028-02-29'), '/admin/workspaces/23/growth?date=2028-02-29');
  assert.equal(hrefOf('2026-02', '2026-02-29'), '/admin/workspaces/23/growth?date=2026-02-01');
  assert.equal(hrefOf('2026-02', '2026-02-30'), '/admin/workspaces/23/growth?date=2026-02-01');
  assert.equal(hrefOf('2026-11', '2026-11-31'), '/admin/workspaces/23/growth?date=2026-11-01');
});

test('基準日が未指定/null/空/不正形式/別月なら従来の月初', () => {
  const first = '/admin/workspaces/23/growth?date=2026-11-01';
  assert.equal(hrefOf('2026-11'), first);
  assert.equal(hrefOf('2026-11', null), first);
  assert.equal(hrefOf('2026-11', ''), first);
  assert.equal(hrefOf('2026-11', '2026-1-18'), first);
  assert.equal(hrefOf('2026-11', '2026-11-18T00:00'), first);
  assert.equal(hrefOf('2026-11', '2026-10-18'), first);
  assert.equal(hrefOf('2026-11', '2027-11-18'), first);
});

test('過去・未来月の選択でも基準日が別月なら対象月の1日（従来）', () => {
  assert.equal(hrefOf('2026-09', '2026-11-18'), '/admin/workspaces/23/growth?date=2026-09-01');
  assert.equal(hrefOf('2027-01', '2026-11-18'), '/admin/workspaces/23/growth?date=2027-01-01');
});

test('対象月内の月末日（有効）はそのまま使う', () => {
  assert.equal(hrefOf('2026-11', '2026-11-30'), '/admin/workspaces/23/growth?date=2026-11-30');
  assert.equal(hrefOf('2026-12', '2026-12-31'), '/admin/workspaces/23/growth?date=2026-12-31');
});
