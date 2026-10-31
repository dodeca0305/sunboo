import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SHARE_LINK_EXPIRY, getShareLinkExpiresAt, getShareLinkStatus, type ShareLinkExpiry } from './shareLinkExpiry.ts';

const now = Date.parse('2026-10-31T03:00:00.000Z');

test('初期値は30日、月をまたいで発行から30日後を保存する', () => {
  assert.equal(DEFAULT_SHARE_LINK_EXPIRY, '30');
  assert.equal(getShareLinkExpiresAt(undefined, now), '2026-11-30T03:00:00.000Z');
});

test('7日は発行時から168時間後、無期限は既存DB仕様のnull', () => {
  assert.equal(getShareLinkExpiresAt('7', now), '2026-11-07T03:00:00.000Z');
  assert.equal(getShareLinkExpiresAt('unlimited', now), null);
});

test('不正な選択値を無期限にフォールバックしない', () => {
  assert.throws(() => getShareLinkExpiresAt('365' as ShareLinkExpiry, now));
});

test('期限の直前は有効、期限ちょうどと直後は期限切れ', () => {
  const link = { revoked_at: null, expires_at: new Date(now).toISOString() };
  assert.equal(getShareLinkStatus(link, now - 1), '有効');
  assert.equal(getShareLinkStatus(link, now), '期限切れ');
  assert.equal(getShareLinkStatus(link, now + 1), '期限切れ');
});

test('既存の無期限リンクを維持し、手動失効を期限より優先表示する', () => {
  assert.equal(getShareLinkStatus({ revoked_at: null, expires_at: null }, now), '有効');
  assert.equal(getShareLinkStatus({ revoked_at: new Date(now).toISOString(), expires_at: null }, now), '失効済み');
  assert.equal(getShareLinkStatus({ revoked_at: new Date(now).toISOString(), expires_at: new Date(now - 1).toISOString() }, now), '失効済み');
});
