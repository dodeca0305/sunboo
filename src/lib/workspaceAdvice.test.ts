import test from 'node:test';
import assert from 'node:assert/strict';

import { selectTodayActionItems } from './workspaceAdvicePresentation.ts';
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
