import type { Metadata } from 'next';
import { Inter, Noto_Sans_JP } from 'next/font/google';
import { SITE_URL } from '@/lib/siteUrl';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const notoSansJP = Noto_Sans_JP({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-noto-jp',
  display: 'swap',
});

const SITE_NAME = 'SUNBOO経営ナビ';
const SITE_DESCRIPTION =
  '会社情報を入力するだけで、あなたの会社が提出すべき書類・申告・届出を一覧表示。期限・提出先・公式リンク付き。';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} | 法人設立・行政手続きガイド`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: ['法人設立', '行政手続き', '届出', '申告', '税務', '労務', '社会保険', '会社設立', 'SUNBOO'],
  openGraph: {
    type: 'website',
    locale: 'ja_JP',
    siteName: SITE_NAME,
    title: `${SITE_NAME} | 法人設立・行政手続きガイド`,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} | 法人設立・行政手続きガイド`,
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" className={`${inter.variable} ${notoSansJP.variable}`}>
      <body className="flex min-h-screen flex-col bg-white">{children}</body>
    </html>
  );
}
