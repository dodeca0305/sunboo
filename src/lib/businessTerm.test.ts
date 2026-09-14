import test from 'node:test';
import assert from 'node:assert/strict';
import { getBusinessTermNumber } from './businessTerm.ts';

test('最初の決算日までは設立1期目', () => {
  assert.equal(getBusinessTermNumber('2026-09-09', 3, '2027-03-31'), 1);
});

test('最初の決算日の翌日から2期目', () => {
  assert.equal(getBusinessTermNumber('2026-09-09', 3, '2027-04-01'), 2);
});

test('2回目の決算日の翌日から3期目', () => {
  assert.equal(getBusinessTermNumber('2026-09-09', 3, '2028-04-01'), 3);
});

test('設立日が決算月末なら当日が1期目で翌日が2期目', () => {
  assert.equal(getBusinessTermNumber('2026-03-31', 3, '2026-03-31'), 1);
  assert.equal(getBusinessTermNumber('2026-03-31', 3, '2026-04-01'), 2);
});

test('入力不足や設立日前の日付は判定しない', () => {
  assert.equal(getBusinessTermNumber('', 3, '2026-09-09'), null);
  assert.equal(getBusinessTermNumber('2026-09-09', null, '2026-09-09'), null);
  assert.equal(getBusinessTermNumber('2026-09-09', 3, '2026-09-08'), null);
});
