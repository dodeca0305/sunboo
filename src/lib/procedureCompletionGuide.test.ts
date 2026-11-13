import test from 'node:test';
import assert from 'node:assert/strict';
import { procedureCompletionGuide } from './procedureCompletionGuide.ts';
import { canPlanTaxPayment } from './workspaceTaxPaymentPlan.ts';

test('申告のみ：2行', () => {
  const g = procedureCompletionGuide('DEPRECIABLE_ASSET_TAX_RETURN');
  assert.deepEqual(g.kind === 'filing_only' ? g.lines : null, ['申告書を提出した', '受付を確認し、控えを保管した']);
  assert.equal(canPlanTaxPayment('DEPRECIABLE_ASSET_TAX_RETURN'), false);
  assert.equal(g.heading, '完了にする前の確認');
  assert.deepEqual(g.kind === 'filing_only' ? g.steps.map((s) => s.title) : null, ['申告書を提出した', '受付を確認し、控えを保管した']);
  assert.ok(g.kind === 'filing_only' && !JSON.stringify(g).includes('支払い'), '納付要件を足さない');
  assert.ok(g.kind === 'filing_only' && g.steps.every((s) => s.condition === undefined && s.note.length > 0));
});

test('申告＋納付：3行。既存の納付区分と一致', () => {
  for (const code of ['CORP_TAX_RETURN', 'CONSUMPTION_TAX_RETURN', 'PREFECTURAL_RESIDENT_TAX_RETURN',
    'PREFECTURAL_BUSINESS_TAX_RETURN', 'MUNICIPAL_RESIDENT_TAX_RETURN']) {
    const g = procedureCompletionGuide(code);
    assert.deepEqual(g.kind === 'filing_and_payment' ? g.lines : null, [
      '申告の受付を確認した',
      '納める税金がある場合は、支払いを済ませた',
      '提出・支払いの控えを保管した',
    ], code);
    assert.equal(canPlanTaxPayment(code), true, code);
    assert.equal(g.heading, '完了にする前の確認', code);
    const steps = g.kind === 'filing_and_payment' ? g.steps : [];
    assert.deepEqual(steps.map((s) => s.title), ['申告の受付を確認した', '支払いを済ませた', '提出・支払いの控えを保管した'], code);
    assert.equal(steps[0].condition, undefined, code);
    assert.equal(steps[1].condition, '納める税金がある場合', code);
    assert.equal(steps[2].condition, '支払いの控えは、納める税金がある場合', code);
    assert.match(steps[0].note, /受付が完了/, code);
    assert.match(steps[2].note, /提出の控えを保管.*納める税金がある場合は、支払いの控えも/, code);
  }
});

test('未知コード・合成税・納付/天引きは推測せず確認の質問にする', () => {
  for (const code of ['SYNTHETIC_TAX', 'WITHHOLDING_TAX', 'RESIDENT_TAX_WITHHOLDING', 'UNKNOWN', '', 'deprecIable_asset_tax_return']) {
    const g = procedureCompletionGuide(code);
    assert.equal(g.kind, 'unconfirmed', code);
    assert.deepEqual(g.kind === 'unconfirmed' ? g.questions : [], ['この手続きは必要ですか？', '何をすれば完了ですか？']);
    assert.equal(g.heading, 'まず、担当者にこの2つを確認');
  }
});

test('情報不足や表示名の詐称でも分類しない', () => {
  for (const code of [null, undefined, 42, {}, '法人税の確定申告']) {
    assert.equal(procedureCompletionGuide(code).kind, 'unconfirmed');
  }
});
