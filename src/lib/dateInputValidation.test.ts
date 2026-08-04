import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateManualDateInput,
} from './dateInputValidation.ts';

test('半角8桁の日付をISO形式へ変換する', () => {
  const result = validateManualDateInput('20260801');

  assert.equal(result.status, 'valid');
  assert.equal(result.displayValue, '2026/08/01');
  assert.equal(result.isoValue, '2026-08-01');
});

test('全角8桁の日付をISO形式へ変換する', () => {
  const result = validateManualDateInput('２０２６０８０１');

  assert.equal(result.status, 'valid');
  assert.equal(result.displayValue, '2026/08/01');
  assert.equal(result.isoValue, '2026-08-01');
});

test('平年の2月29日は無効と判定する', () => {
  const result = validateManualDateInput('20260229');

  assert.equal(result.status, 'invalid');
  assert.equal(result.isoValue, null);
  assert.equal(
    result.error,
    '実在する年月日を入力してください。',
  );
});

test('うるう年の2月29日は有効と判定する', () => {
  const result = validateManualDateInput('20240229');

  assert.equal(result.status, 'valid');
  assert.equal(result.isoValue, '2024-02-29');
});

test('存在しない4月31日は無効と判定する', () => {
  const result = validateManualDateInput('20260431');

  assert.equal(result.status, 'invalid');
  assert.equal(result.isoValue, null);
});

test('8桁未満の日付は入力途中と判定する', () => {
  const result = validateManualDateInput('202608');

  assert.equal(result.status, 'incomplete');
  assert.equal(result.displayValue, '2026/08');
  assert.equal(result.isoValue, null);
  assert.equal(result.error, null);
});

test('最大日付より後の日付は無効と判定する', () => {
  const result = validateManualDateInput(
    '20260802',
    '2026-08-01',
  );

  assert.equal(result.status, 'after-max');
  assert.equal(result.isoValue, null);
  assert.equal(
    result.error,
    '2026/08/01以前の日付を入力してください。',
  );
});
