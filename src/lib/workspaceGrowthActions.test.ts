import test from 'node:test';
import assert from 'node:assert/strict';
import { growthNotificationToDecisionAction, growthNotificationsToDecisionActions } from './workspaceGrowthActions.ts';
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

test('growthNotificationToDecisionAction: actionHrefは該当月の売上目標画面（/growth?date=YYYY-MM-01）を指す', () => {
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
