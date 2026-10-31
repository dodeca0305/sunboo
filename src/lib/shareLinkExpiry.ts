export type ShareLinkExpiry = '7' | '30' | 'unlimited';

export const DEFAULT_SHARE_LINK_EXPIRY: ShareLinkExpiry = '30';

export function getShareLinkExpiresAt(
  expiry: ShareLinkExpiry = DEFAULT_SHARE_LINK_EXPIRY,
  now: number = Date.now(),
): string | null {
  if (expiry === 'unlimited') return null;
  if (expiry !== '7' && expiry !== '30') throw new Error('Invalid share link expiry');
  // 経過時間として計算し、月末や夏時間でも指定日数を保証する。
  return new Date(now + Number(expiry) * 24 * 60 * 60 * 1000).toISOString();
}

export function getShareLinkStatus(
  link: { revoked_at: string | null; expires_at: string | null },
  now: number = Date.now(),
): '有効' | '期限切れ' | '失効済み' {
  if (link.revoked_at) return '失効済み';
  // DBの expires_at > NOW() と同じ境界で判定する。
  if (link.expires_at !== null && !(Date.parse(link.expires_at) > now)) return '期限切れ';
  return '有効';
}
