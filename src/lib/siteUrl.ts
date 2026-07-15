// 本番URLの単一情報源。robots.ts・sitemap.ts・各ページのmetadata（canonical/OG）から共通利用する。
// 優先順位：NEXT_PUBLIC_SITE_URL（本番ドメイン確定後に設定） → VERCEL_URL（Vercelのプレビュー/本番URL）
// → localhost（ローカル開発）。本番ドメインが未確定の間は、誤ったドメインをrobots.txt/sitemap.xmlに
// 出力しないよう、Vercelが自動付与するURLをそのまま使う。
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
).replace(/\/$/, '');

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
