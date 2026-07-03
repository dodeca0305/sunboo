import type { Metadata } from 'next';
import './globals.css';

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
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="flex min-h-screen flex-col bg-gray-50">{children}</body>
    </html>
  );
}
