import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceToConfirm, allDocsChecked, backToDocs, canAdvanceToConfirm, canCompleteFlow, completionConfirmLines, completionConfirmSteps,
  completionDocCondition, completionFlowScope, initialCompletionFlowState, isCompletionFlowTarget,
  reconcileCompletionFlowState, shouldShowCompletionFlow, statusChangeRoute, toggleCompletionConfirm,
  toggleCompletionDoc,
} from './procedureCompletionFlow.ts';
import { buildRoadmapDocumentItems } from './roadmapDocuments.ts';
import type { ScheduleProcedure } from './scheduleProcedure.ts';

type Doc = NonNullable<ScheduleProcedure['procedure_documents']>[number];
const doc = (name: string, is_required = true, extra: Partial<Doc> = {}): Doc =>
  ({ name, form_number: null, is_required, notes: null, item_type: 'document', sort_order: 0, ...extra });
const groupsOf = (docs: Doc[] | undefined) => buildRoadmapDocumentItems({ procedure_documents: docs } as ScheduleProcedure);
const readyOf = (docs: Doc[]) => {
  const c = completionDocCondition(groupsOf(docs));
  assert.equal(c.kind, 'ready');
  return c.kind === 'ready' ? c : (undefined as never);
};

test('対象は編集可能な償却資産申告だけ', () => {
  assert.equal(isCompletionFlowTarget('DEPRECIABLE_ASSET_TAX_RETURN', true), true);
  assert.equal(isCompletionFlowTarget('DEPRECIABLE_ASSET_TAX_RETURN', false), false);
  for (const code of ['CORP_TAX_RETURN', 'UNKNOWN', '', null, undefined, 'deprecIable_asset_tax_return']) {
    assert.equal(isCompletionFlowTarget(code, true), false, String(code));
  }
  assert.deepEqual(completionConfirmLines('DEPRECIABLE_ASSET_TAX_RETURN'), ['申告書を提出した', '受付を確認し、控えを保管した']);
  assert.deepEqual(completionConfirmLines('CORP_TAX_RETURN'), []);
  const steps = completionConfirmSteps('DEPRECIABLE_ASSET_TAX_RETURN');
  assert.deepEqual(steps.map((s) => s.title), completionConfirmLines('DEPRECIABLE_ASSET_TAX_RETURN'));
  assert.ok(steps.every((s) => s.note.length > 0), '補足を失わない');
  assert.deepEqual(completionConfirmSteps('CORP_TAX_RETURN'), []);
});

test('対応状況：対象のdoneだけ確認導線。他の状態・他手続きは従来どおり保存', () => {
  assert.equal(statusChangeRoute(true, 'done'), 'open_flow');
  for (const s of ['not_started', 'in_progress', 'on_hold']) assert.equal(statusChangeRoute(true, s), 'save', s);
  assert.equal(statusChangeRoute(false, 'done'), 'save');
});

test('保存済みの完了では導線を出さず、未完了へ戻さない', () => {
  assert.equal(shouldShowCompletionFlow('done'), false);
  for (const s of ['not_started', 'in_progress', 'on_hold']) assert.equal(shouldShowCompletionFlow(s), true, s);
});

test('書類条件：必須だけが条件。任意は条件外。実データ名を使う', () => {
  const c = readyOf([doc('申告書A'), doc('控えB', false), doc('明細C')]);
  assert.deepEqual(c.required.map((d) => d.name), ['申告書A', '明細C']);
  assert.deepEqual(c.optional.map((d) => d.name), ['控えB']);
});

test('準備・提出前チェックは条件に含めない', () => {
  const c = completionDocCondition(groupsOf([
    doc('申告書A'), doc('準備X', true, { item_type: 'preparation' }), doc('確認Y', true, { item_type: 'checklist' }),
  ]));
  assert.equal(c.kind, 'ready');
  assert.deepEqual(c.kind === 'ready' ? c.required.map((d) => d.name) : null, ['申告書A']);
});

test('書類なし・空・必須0件は準備済みにせず保留', () => {
  for (const docs of [undefined, [], [doc('任意だけ', false)], [doc('準備だけ', true, { item_type: 'preparation' })]]) {
    const c = completionDocCondition(groupsOf(docs));
    assert.equal(c.kind, 'blocked');
  }
  assert.equal((completionDocCondition(groupsOf([])) as { reason: string }).reason, 'no_documents');
  assert.equal((completionDocCondition(groupsOf([doc('任意', false)])) as { reason: string }).reason, 'no_required');
});

test('書類の識別子：並べ替え・位置では変わらず、内容や重複で区別。署名は条件変更で変わる', () => {
  const a = readyOf([doc('A', true, { sort_order: 1 }), doc('B', true, { sort_order: 2 })]);
  const reordered = readyOf([doc('B', true, { sort_order: 1 }), doc('A', true, { sort_order: 2 })]);
  const idOf = (c: typeof a, n: string) => c.required.find((d) => d.name === n)?.id;
  assert.equal(idOf(a, 'A'), idOf(reordered, 'A'));
  assert.notEqual(a.signature, reordered.signature, '順序が変わった条件は別署名（古いチェックを流用しない）');
  const dup = readyOf([doc('A'), doc('A')]);
  assert.equal(new Set(dup.required.map((d) => d.id)).size, 2);
  assert.notEqual(readyOf([doc('A')]).signature, readyOf([doc('A'), doc('B')]).signature);
  assert.notEqual(readyOf([doc('A')]).signature, readyOf([doc('A', true, { form_number: 'X' })]).signature);
  assert.equal(readyOf([doc('A'), doc('任意', false)]).signature, readyOf([doc('A')]).signature, '任意の増減は条件を変えない');
  assert.notEqual(readyOf([doc('A')]).signature, readyOf([doc('A', true, { notes: '補足' })]).signature, 'notesだけの変更でも署名が変わる');
});

test('スコープ：画面・会社・手続き・期限・書類署名で分離', () => {
  const base = { pathname: '/p', companyId: 1, procedureId: 2, dueDate: '2027-01-31', signature: 's', status: 'not_started' };
  const s = completionFlowScope(base);
  assert.equal(completionFlowScope({ ...base }), s);
  for (const diff of [{ pathname: '/q' }, { companyId: 9 }, { companyId: undefined }, { procedureId: 3 }, { dueDate: '2028-01-31' }, { signature: 't' }, { status: 'in_progress' }]) {
    assert.notEqual(completionFlowScope({ ...base, ...diff }), s, JSON.stringify(diff));
  }
});

test('初期・一部・全チェックの遷移。確認は書類が揃うまで進めない', () => {
  const ids = ['a', 'b'];
  let s = initialCompletionFlowState();
  assert.equal(canAdvanceToConfirm(s, ids), false);
  assert.equal(advanceToConfirm(s, ids).step, 'docs');
  s = toggleCompletionDoc(s, ids, 'a', true);
  assert.equal(allDocsChecked(s, ids), false);
  assert.equal(advanceToConfirm(s, ids).step, 'docs');
  s = toggleCompletionDoc(s, ids, 'b', true);
  assert.equal(allDocsChecked(s, ids), true);
  s = advanceToConfirm(s, ids);
  assert.equal(s.step, 'confirm');
  assert.equal(toggleCompletionDoc(s, ids, 'zzz', true), s, '未知idは無視');
});

test('空集合は全チェック扱いにならない', () => {
  const s = initialCompletionFlowState();
  assert.equal(allDocsChecked(s, []), false);
  assert.equal(canAdvanceToConfirm(s, []), false);
  assert.equal(canCompleteFlow({ step: 'confirm', docs: [], confirms: [true, true] }, [], false), false);
});

test('2確認が両方揃ってはじめて完了可。確認だけでは保存にならず、blocked中は不可', () => {
  const ids = ['a'];
  let s = advanceToConfirm(toggleCompletionDoc(initialCompletionFlowState(), ids, 'a', true), ids);
  assert.equal(canCompleteFlow(s, ids, false), false);
  s = toggleCompletionConfirm(s, ids, 0, true);
  assert.equal(canCompleteFlow(s, ids, false), false);
  s = toggleCompletionConfirm(s, ids, 1, true);
  assert.equal(canCompleteFlow(s, ids, false), true);
  assert.equal(canCompleteFlow(s, ids, true), false, '保存中・結果未確認は不可');
});

test('書類確認前は提出後の確認をチェックできない', () => {
  const s = toggleCompletionConfirm(initialCompletionFlowState(), ['a'], 0, true);
  assert.deepEqual(s.confirms, [false, false]);
});

test('戻る：書類・確認を保持。書類を外すと確認を消して書類へ戻す', () => {
  const ids = ['a', 'b'];
  let s = initialCompletionFlowState();
  for (const id of ids) s = toggleCompletionDoc(s, ids, id, true);
  s = toggleCompletionConfirm(advanceToConfirm(s, ids), ids, 0, true);
  const back = backToDocs(s);
  assert.equal(back.step, 'docs');
  assert.deepEqual(back.docs, ['a', 'b']);
  assert.deepEqual(back.confirms, [true, false]);
  assert.equal(canCompleteFlow(back, ids, false), false);
  const unchecked = toggleCompletionDoc(back, ids, 'a', false);
  assert.deepEqual(unchecked.confirms, [false, false]);
  assert.equal(unchecked.step, 'docs');
  assert.deepEqual(unchecked.docs, ['b']);
  const again = advanceToConfirm(toggleCompletionDoc(unchecked, ids, 'a', true), ids);
  assert.deepEqual(again.confirms, [false, false], '再確認が必要');
});

test('書類条件が変わったら古いidを捨て、確認も消す', () => {
  const s = advanceToConfirm({ step: 'docs', docs: ['a', 'b'], confirms: [true, true] }, ['a', 'b']);
  const r = reconcileCompletionFlowState(s, ['a', 'c']);
  assert.deepEqual(r.docs, ['a']);
  assert.deepEqual(r.confirms, [false, false]);
  assert.equal(r.step, 'docs');
  assert.equal(reconcileCompletionFlowState(s, ['a', 'b']), s);
});
