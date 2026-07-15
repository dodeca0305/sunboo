import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/siteUrl';

// 管理画面（/admin配下）・顧問先向け共有ページ（/share配下、閲覧に有効なトークンが必要で
// 検索結果に載せる意味が無い）はクロール対象外とする。公開の診断入口・情報ページはすべて許可する。
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/share'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
