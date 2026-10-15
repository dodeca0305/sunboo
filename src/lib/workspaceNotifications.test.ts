import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWorkspaceNotifications, DEFAULT_MAX_ITEMS, type WorkspaceNotification,
} from './workspaceNotifications.ts';
import type { WorkspaceDecisions } from './workspaceDecisions.ts';
import type { WorkspaceAdvice } from './workspaceAdvice.ts';

const EMPTY_DECISIONS: WorkspaceDecisions = { actions: [], watchItems: [], completed: [], summary: '' };
const EMPTY_ADVICE: WorkspaceAdvice = { priority: [], warnings: [], opportunities: [], summary: '' };

// high優先度のDecision.actionsをN件持つDecisionsを作る（maxItems検証用）。
function decisionsWithActions(count: number): WorkspaceDecisions {
  return {
    actions: Array.from({ length: count }, (_, i) => ({
      priority: 'high' as const,
      title: `手続き${i + 1}`,
      reason: `あと${i + 1}日以内に対応してください（期限: 1月${i + 1}日）。`,
      dueDate: `2026-01-0${(i % 9) + 1}`,
    })),
    watchItems: [],
    completed: [],
    summary: '',
  };
}

test('第6引数（companyId, decisions, advice, procedureStatusMap, documentStatusMap, maxItems）という既存の呼び出し形のまま、件数制限が効く', () => {
  // レビュー対応前の呼び出し形（growthNotificationsを渡さない5引数、または
  // 第6引数にmaxItemsを渡す6引数）が引き続き成立することを確認する。
  const notifications = buildWorkspaceNotifications(1, decisionsWithActions(10), EMPTY_ADVICE, {}, {}, 3);
  assert.equal(notifications.length, 3);
});

test('maxItemsを省略（5引数呼び出し）した場合はDEFAULT_MAX_ITEMS件に制限される', () => {
  const notifications = buildWorkspaceNotifications(1, decisionsWithActions(10), EMPTY_ADVICE, {}, {});
  assert.equal(notifications.length, DEFAULT_MAX_ITEMS);
});

test('growthNotifications（第7引数）を渡さない場合は空のまま動作する（既存呼び出しとの互換性）', () => {
  const notifications = buildWorkspaceNotifications(1, EMPTY_DECISIONS, EMPTY_ADVICE, {}, {});
  assert.deepEqual(notifications, []);
});

test('maxItemsにundefinedを渡すとデフォルト値が適用され、第7引数のgrowthNotificationsのみ渡せる', () => {
  const growth: WorkspaceNotification[] = [
    { id: 'sales:shortfall:2026-10', severity: 'high', category: 'sales', title: '今月の売上目標', message: '不足しています。' },
  ];
  const notifications = buildWorkspaceNotifications(1, EMPTY_DECISIONS, EMPTY_ADVICE, {}, {}, undefined, growth);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].category, 'sales');
});

test('maxItemsを明示的に指定しつつgrowthNotificationsも渡せる（第6・第7引数を両方使う呼び出し）', () => {
  const growth: WorkspaceNotification[] = [
    { id: 'cash:shortage:2026-10', severity: 'high', category: 'cash', title: '今月の資金繰り', message: '不足する見込みです。' },
  ];
  const notifications = buildWorkspaceNotifications(1, decisionsWithActions(10), EMPTY_ADVICE, {}, {}, 2, growth);
  // high優先度が10件＋cashが1件（いずれもhigh）の合計11件からmaxItems=2件に絞られる
  assert.equal(notifications.length, 2);
});

test('growthNotificationsのsales/cashカテゴリは/growthへのhrefが付与される', () => {
  const growth: WorkspaceNotification[] = [
    { id: 'sales:shortfall:2026-10', severity: 'high', category: 'sales', title: '今月の売上目標', message: '不足しています。' },
    { id: 'cash:shortage:2026-10', severity: 'high', category: 'cash', title: '今月の資金繰り', message: '不足する見込みです。' },
  ];
  const notifications = buildWorkspaceNotifications(42, EMPTY_DECISIONS, EMPTY_ADVICE, {}, {}, undefined, growth);
  for (const n of notifications) {
    assert.equal(n.href, '/admin/workspaces/42/growth');
  }
});

test('既存のDecision/Advice由来の通知とgrowthNotificationsが重要度順に合流する', () => {
  const decisions: WorkspaceDecisions = {
    actions: [{ priority: 'low', title: '低優先度の手続き', reason: '早めに着手することをおすすめします。', dueDate: '2026-02-01' }],
    watchItems: [],
    completed: [],
    summary: '',
  };
  const growth: WorkspaceNotification[] = [
    { id: 'cash:shortage:2026-10', severity: 'high', category: 'cash', title: '今月の資金繰り', message: '不足する見込みです。' },
  ];
  const notifications = buildWorkspaceNotifications(1, decisions, EMPTY_ADVICE, {}, {}, undefined, growth);
  assert.equal(notifications.length, 2);
  assert.equal(notifications[0].category, 'cash'); // highがlowより先
  assert.equal(notifications[1].category, 'deadline');
});
