import type { Metadata } from 'next';

// start/page.tsxは'use client'のため、Server Componentであるこのlayout.tsxにmetadataを持たせる
// （Next.jsの制約：metadataはServer Componentからのみexportできる）。見た目には影響しない。
export const metadata: Metadata = {
  title: '会社情報を入力',
  description: '会社の所在地・法人の種類・従業員の有無・決算月を入力して、必要な行政手続きを診断します。',
  alternates: { canonical: '/start' },
};

export default function StartLayout({ children }: { children: React.ReactNode }) {
  return children;
}
