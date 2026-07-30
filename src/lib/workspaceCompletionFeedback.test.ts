import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseWorkspaceCompletionFeedback,
  serializeWorkspaceCompletionFeedback,
  workspaceCompletionFeedbackKey,
  type WorkspaceCompletionFeedbackPayload,
} from './workspaceCompletionFeedback.ts';

const validPayload = {
  procedureId: 42,
  dueDate: '2026-07-29',
  procedureName: '役員変更登記',
  previousStatus: 'in_progress',
} satisfies WorkspaceCompletionFeedbackPayload;

test('会社IDごとのsessionStorageキーを生成する', () => {
  assert.equal(
    workspaceCompletionFeedbackKey(12),
    'sunboo:workspace:12:completion-feedback',
  );
});

test('正常な完了通知データを直列化して復元できる', () => {
  const serialized =
    serializeWorkspaceCompletionFeedback(validPayload);

  assert.deepEqual(
    parseWorkspaceCompletionFeedback(serialized),
    validPayload,
  );
});

test('保存値がない場合と不正なJSONはnullを返す', () => {
  assert.equal(parseWorkspaceCompletionFeedback(null), null);
  assert.equal(parseWorkspaceCompletionFeedback('{invalid'), null);
});

test('procedureIdが正の整数でない場合は拒否する', () => {
  assert.equal(
    parseWorkspaceCompletionFeedback(JSON.stringify({
      ...validPayload,
      procedureId: 1.5,
    })),
    null,
  );

  assert.equal(
    parseWorkspaceCompletionFeedback(JSON.stringify({
      ...validPayload,
      procedureId: 0,
    })),
    null,
  );
});

test('dueDateがYYYY-MM-DD形式でない場合は拒否する', () => {
  assert.equal(
    parseWorkspaceCompletionFeedback(JSON.stringify({
      ...validPayload,
      dueDate: '2026/07/29',
    })),
    null,
  );
});

test('procedureNameが空文字または空白だけの場合は拒否する', () => {
  assert.equal(
    parseWorkspaceCompletionFeedback(JSON.stringify({
      ...validPayload,
      procedureName: '   ',
    })),
    null,
  );
});

test('previousStatusが定義済みステータスでない場合は拒否する', () => {
  assert.equal(
    parseWorkspaceCompletionFeedback(JSON.stringify({
      ...validPayload,
      previousStatus: 'unknown',
    })),
    null,
  );
});
