import type { Metadata } from 'next';

// tax-returns/page.tsxは'use client'のため、Server Componentであるこのlayout.tsxにmetadataを持たせる。
// 親（/profile/layout.tsx）のmetadataをこの階層のものが上書きする（Next.jsのmetadataマージ仕様）。
export const metadata: Metadata = {
  title: '申告実績',
  description: '過去の決算・申告実績を登録し、次回の申告期限の精度を上げます。',
  alternates: { canonical: '/profile/tax-returns' },
};

export default function TaxReturnsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
