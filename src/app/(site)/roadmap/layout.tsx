import type { Metadata } from 'next';

// roadmap/page.tsxは'use client'のため、Server Componentであるこのlayout.tsxにmetadataを持たせる。
export const metadata: Metadata = {
  title: '年間ロードマップ',
  description: '今年度から今後2年分の手続き予定を一覧表示します。期限・提出先・必要書類を確認できます。',
  alternates: { canonical: '/roadmap' },
};

export default function RoadmapLayout({ children }: { children: React.ReactNode }) {
  return children;
}
