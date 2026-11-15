import test from 'node:test';
import assert from 'node:assert/strict';
import {
  groupRequiredDocumentsByNearestDue,
  requiredDocumentNextAction,
  REQUIRED_DOCUMENT_NEXT_ACTION,
} from './workspaceDocumentPresentation.ts';
import type { WorkspaceRequiredDocument } from './workspaceRequiredDocuments.ts';

const d = (name: string, nearestDueDate: string): WorkspaceRequiredDocument => ({
  name, formNumber: null, nearestDueDate, procedures: ['手続き'],
});
const names = (docs: WorkspaceRequiredDocument[]) => docs.map((x) => x.name);

test('状態ごとの次にすることは承認済みの文言', () => {
  assert.equal(requiredDocumentNextAction('not_ready'), '手元に書類があるか確認し、なければ担当者に準備を相談してください。');
  assert.equal(requiredDocumentNextAction('in_progress'), '不足している書類や記載内容をそろえてください。');
  assert.equal(requiredDocumentNextAction('ready'), '使う年度を確かめ、年間ロードマップで提出先・提出方法を確認してください。');
  // 準備済みは提出済み・完了ではない（そのように言い切る文言を含めない）。
  assert.doesNotMatch(REQUIRED_DOCUMENT_NEXT_ACTION.ready, /提出しました|完了/);
});

test('不明・不正な状態では次にすることを主張しない', () => {
  for (const bad of [undefined, null, '', 'done', 'READY', 'submitted', 0, {}, ['ready']]) {
    assert.equal(requiredDocumentNextAction(bad), null, String(bad));
  }
});

test('0件・1件', () => {
  assert.deepEqual(groupRequiredDocumentsByNearestDue([]), { primary: [], later: [] });
  const one = [d('A', '2027-01-31')];
  assert.deepEqual(groupRequiredDocumentsByNearestDue(one), { primary: one, later: [] });
});

test('期限→書類名の順に並べ、最も近い期限だけを主要にする（元配列は変更しない）', () => {
  const input = [d('ウ', '2027-05-31'), d('イ', '2027-01-31'), d('ア', '2027-01-31'), d('エ', '2027-03-31')];
  const snapshot = JSON.stringify(input);
  const g = groupRequiredDocumentsByNearestDue(input);
  assert.deepEqual(names(g.primary), ['ア', 'イ']);
  assert.deepEqual(names(g.later), ['エ', 'ウ']);
  assert.equal(JSON.stringify(input), snapshot);
});

test('同じ最も近い期限が3件以上でも全件を主要にし、後の組は空', () => {
  const g = groupRequiredDocumentsByNearestDue([d('C', '2027-01-31'), d('A', '2027-01-31'), d('B', '2027-01-31')]);
  assert.deepEqual(names(g.primary), ['A', 'B', 'C']);
  assert.deepEqual(g.later, []);
});

test('同期限の同名順は日本語照合で安定', () => {
  const g = groupRequiredDocumentsByNearestDue([d('明細書', '2027-01-31'), d('申告書', '2027-01-31')]);
  assert.deepEqual(names(g.primary), ['明細書', '申告書'].sort((a, b) => a.localeCompare(b, 'ja')));
});

test('グループ分けは準備状況に依存しない（入力は状態を持たず、状態変更でカードは移動しない）', () => {
  const input = [d('B', '2027-03-31'), d('A', '2027-01-31')];
  const before = groupRequiredDocumentsByNearestDue(input);
  for (const status of ['not_ready', 'in_progress', 'ready']) {
    void status; // 状態は引数に存在しない: どの状態でも同じ入力から同じ結果になる。
    assert.deepEqual(groupRequiredDocumentsByNearestDue(input), before);
  }
  assert.deepEqual(names(before.primary), ['A']);
  assert.deepEqual(names(before.later), ['B']);
});
