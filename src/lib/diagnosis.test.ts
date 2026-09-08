import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateEventDeadline, calculateEventNextMonthDeadline } from './deadline.ts';

test('設立日から10日後の福岡市設立申告期限を計算する', () => {
  assert.deepEqual(
    calculateEventDeadline({ days_from_event: 10 }, '2026-08-23'),
    { label: '2026年9月2日', date: '2026-09-02' },
  );
});

test('設立日から15日後の福岡県設立届期限を計算する', () => {
  assert.deepEqual(
    calculateEventDeadline({ days_from_event: 15 }, '2026-08-23'),
    { label: '2026年9月7日', date: '2026-09-07' },
  );
});

test('設立日が無ければ設立系期限を断定しない', () => {
  assert.deepEqual(
    calculateEventDeadline({ days_from_event: 10 }),
    { label: null, date: null },
  );
});

test('最初の雇用日から10日後の労働保険期限を計算する', () => {
  assert.deepEqual(
    calculateEventDeadline({ days_from_event: 10 }, '2026-09-01'),
    { label: '2026年9月11日', date: '2026-09-11' },
  );
});

test('雇用保険資格取得届は雇用日の翌月10日を計算する', () => {
  assert.deepEqual(
    calculateEventNextMonthDeadline({ day: 10 }, '2026-09-03'),
    { label: '2026年10月10日', date: '2026-10-10' },
  );
});
