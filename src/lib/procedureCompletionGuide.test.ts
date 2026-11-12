import test from 'node:test';
import assert from 'node:assert/strict';
import { procedureCompletionGuide } from './procedureCompletionGuide.ts';
import { canPlanTaxPayment } from './workspaceTaxPaymentPlan.ts';

test('申告のみ：2行', () => {
  const g = procedureCompletionGuide('DEPRECIABLE_ASSET_TAX_RETURN');
  assert.deepEqual(g.kind === 'filing_only' ? g.lines : null, ['申告書を提出した', '受付完了を確認し、控えを残した']);
  assert.equal(canPlanTaxPayment('DEPRECIABLE_ASSET_TAX_RETURN'), false);
});

test('申告＋納付：3行。既存の納付区分と一致', () => {
  for (const code of ['CORP_TAX_RETURN', 'CONSUMPTION_TAX_RETURN', 'PREFECTURAL_RESIDENT_TAX_RETURN',
    'PREFECTURAL_BUSINESS_TAX_RETURN', 'MUNICIPAL_RESIDENT_TAX_RETURN']) {
    const g = procedureCompletionGuide(code);
    assert.deepEqual(g.kind === 'filing_and_payment' ? g.lines : null, [
      '申告書を提出し、受付完了を確認した',
      '納める税金がある場合は、支払いを済ませた',
      '提出と支払いの控えを残した',
    ], code);
    assert.equal(canPlanTaxPayment(code), true, code);
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
