import type { Metadata } from 'next';

// events/page.tsxは'use client'のため、Server Componentであるこのlayout.tsxにmetadataを持たせる。
export const metadata: Metadata = {
  title: 'イベント登録',
  description: '会社設立・役員変更などのイベントを登録すると、そのイベントに伴う手続きを追加で診断します。',
  alternates: { canonical: '/events' },
};

export default function EventsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
