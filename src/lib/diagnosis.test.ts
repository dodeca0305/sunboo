import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateEventDeadline } from './deadline.ts';

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
