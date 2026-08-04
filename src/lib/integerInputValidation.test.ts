import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseIntegerInput,
} from './integerInputValidation.ts';

test('全角数字を整数へ変換する', () => {
  const result = parseIntegerInput('１０００');

  assert.equal(result.status, 'valid');
  assert.equal(result.digits, '1000');
  assert.equal(result.value, 1000);
});

test('3桁区切りの数値を整数へ変換する', () => {
  const result = parseIntegerInput('1,000');

  assert.equal(result.status, 'valid');
  assert.equal(result.value, 1000);
});

test('先頭ゼロを除去する', () => {
  const result = parseIntegerInput('００１０００');

  assert.equal(result.status, 'valid');
  assert.equal(result.digits, '1000');
  assert.equal(result.value, 1000);
});

test('数字以外の文字を除去する', () => {
  const result = parseIntegerInput('abc１２３円');

  assert.equal(result.status, 'valid');
  assert.equal(result.digits, '123');
  assert.equal(result.value, 123);
});

test('空文字は空欄と判定する', () => {
  const result = parseIntegerInput('');

  assert.equal(result.status, 'empty');
  assert.equal(result.digits, '');
  assert.equal(result.value, null);
});

test('ゼロは有効な整数として扱う', () => {
  const result = parseIntegerInput('0');

  assert.equal(result.status, 'valid');
  assert.equal(result.value, 0);
});

test('安全整数の最大値は有効と判定する', () => {
  const result = parseIntegerInput('9007199254740991');

  assert.equal(result.status, 'valid');
  assert.equal(result.value, Number.MAX_SAFE_INTEGER);
});

test('安全整数を超える値は無効と判定する', () => {
  const result = parseIntegerInput('9007199254740992');

  assert.equal(result.status, 'unsafe');
  assert.equal(result.value, null);
});
