import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildWorkspaceAdviceSummary,
  selectTodayActionItems,
} from './workspaceAdvicePresentation.ts';
import type { WorkspaceAdviceItem } from './workspaceAdvice.ts';

const warning: WorkspaceAdviceItem = {
  procedureId: 1,
  title: '役員変更登記',
  dueDate: '2025-04-15',
  detail: '期限超過（4月15日）',
};

const priority: WorkspaceAdviceItem = {
  procedureId: 2,
  title: '法人税確定申告',
  dueDate: '2027-05-31',
  detail: 'あと30日（5月31日が期限）',
};

test('警告がある場合は通常の優先項目より警告を表示する', () => {
  const result = selectTodayActionItems({
    warnings: [warning],
    priority: [priority],
  });

  assert.deepEqual(result, [warning]);
});

test('警告がない場合は通常の優先項目を表示する', () => {
  const result = selectTodayActionItems({
    warnings: [],
    priority: [priority],
  });

  assert.deepEqual(result, [priority]);
});

test('警告も優先項目もない場合は空配列を返す', () => {
  const result = selectTodayActionItems({
    warnings: [],
    priority: [],
  });

  assert.deepEqual(result, []);
});


test('期限超過が1件の場合は対象手続きと次の行動を示す', () => {
  assert.equal(
    buildWorkspaceAdviceSummary([warning], []),
    '役員変更登記が期限を過ぎています。必要書類と対応手順を確認し、今日中に着手してください。',
  );
});

test('期限超過が複数件の場合は代表手続き・件数・次の行動を示す', () => {
  const secondWarning: WorkspaceAdviceItem = {
    procedureId: 3,
    title: '法人税確定申告',
    dueDate: '2025-05-31',
    detail: '期限超過（5月31日）',
  };

  assert.equal(
    buildWorkspaceAdviceSummary([warning, secondWarning], []),
    '役員変更登記など2件が期限を過ぎています。優先順位を決め、今日中に最初の1件へ着手してください。',
  );
});

test('期限超過ではない警告の場合は期限接近メッセージを返す', () => {
  const upcomingWarning: WorkspaceAdviceItem = {
    procedureId: 4,
    title: '社会保険算定基礎届',
    dueDate: '2027-07-10',
    detail: 'あと5日（7月10日が期限）',
  };

  assert.equal(
    buildWorkspaceAdviceSummary([upcomingWarning], []),
    '1件、期限が迫っている手続きがあります。',
  );
});

test('警告も優先項目もない場合は遅れがない旨を返す', () => {
  assert.equal(
    buildWorkspaceAdviceSummary([], []),
    '直近の手続きに遅れはありません。',
  );
});
