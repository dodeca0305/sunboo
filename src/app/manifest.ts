import type { MetadataRoute } from 'next';
import { BRAND_MARK_NAVY } from '@/components/BrandMark';

// Android/Chromeの「ホーム画面に追加」用の最小限のWeb Manifest。既存のicon.tsx（64x64）・
// apple-icon.tsx（180x180）をそのまま流用する。Chromeのインストールバナー表示条件（192x192/512x512の
// 専用アイコン）までは満たしていないため、あくまで「アイコン・名称が正しく認識される」最小構成として
// 扱う（docs/RELEASE_INFRASTRUCTURE.mdに残課題として明記）。
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SUNBOO経営ナビ',
    short_name: 'SUNBOO',
    description: '法人設立・行政手続きの情報サービス',
    start_url: '/',
    display: 'standalone',
    background_color: '#FFFFFF',
    theme_color: BRAND_MARK_NAVY,
    icons: [
      { src: '/icon', sizes: '64x64', type: 'image/png' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
