import type { Metadata } from 'next';

// profile/page.tsxは'use client'のため、Server Componentであるこのlayout.tsxにmetadataを持たせる。
// profile/tax-returns配下は同じ階層のlayout.tsxで個別に上書きする。
export const metadata: Metadata = {
  title: '会社プロフィール',
  description: '会社の所在地・法人の種類・決算月などを登録し、年間ロードマップの精度を上げます。',
  alternates: { canonical: '/profile' },
};

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
