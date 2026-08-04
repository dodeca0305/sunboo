import test from 'node:test';
import assert from 'node:assert/strict';
import { toHalfWidthDigits } from './inputNormalization.ts';

test('半角数字はそのまま返す', () => {
  assert.equal(
    toHalfWidthDigits('0123456789'),
    '0123456789',
  );
});

test('全角数字を半角数字へ変換する', () => {
  assert.equal(
    toHalfWidthDigits('０１２３４５６７８９'),
    '0123456789',
  );
});

test('数字以外の文字や記号は変更しない', () => {
  assert.equal(
    toHalfWidthDigits('２０２６/０８/０１,abc'),
    '2026/08/01,abc',
  );
});
