import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/siteUrl';

// 公開の静的URLのみを対象にする。以下は意図的に除外する。
// - /result：クエリパラメータ（pref/muni/emp/fm/corp）依存で無数のURLが存在し、
//   パラメータ無しでは中身が無い薄いページになるため対象外（metadataでnoindexも設定）
// - /diagnosis・/form：/startへのリダイレクトのみを行う廃止済みページ
// - /admin配下・/share/[token]：非公開または閲覧に有効なトークンが必要なページ
const STATIC_PAGES: { path: string; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']; priority: number }[] = [
  { path: '/', changeFrequency: 'weekly', priority: 1 },
  { path: '/start', changeFrequency: 'monthly', priority: 0.9 },
  { path: '/procedures', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/offices', changeFrequency: 'weekly', priority: 0.7 },
  { path: '/roadmap', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/events', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/profile', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/profile/tax-returns', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/search', changeFrequency: 'weekly', priority: 0.5 },
  { path: '/help', changeFrequency: 'monthly', priority: 0.4 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return STATIC_PAGES.map(({ path, changeFrequency, priority }) => ({
    url: absoluteUrl(path),
    lastModified,
    changeFrequency,
    priority,
  }));
}
