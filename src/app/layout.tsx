import type { Metadata } from 'next';
import { Inter, Noto_Sans_JP } from 'next/font/google';
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

export const metadata: Metadata = {
  title: 'SUNBOO経営ナビ | 法人設立・行政手続きガイド',
  description:
    '会社情報を入力するだけで、あなたの会社が提出すべき書類・申告・届出を一覧表示。期限・提出先・公式リンク付き。',
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
