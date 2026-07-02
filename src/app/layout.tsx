import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SUNBOO経営ナビ | 中小企業の提出書類を一覧で確認',
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
      <body>
        <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <a href="/" className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-brand-navy">
                SUNBOO<span className="text-brand-gold">経営ナビ</span>
              </span>
            </a>
            <nav className="flex items-center gap-1 sm:gap-3">
              <a
                href="/procedures"
                className="hidden sm:inline-block px-2 py-1 text-xs text-gray-600 hover:text-brand-navy"
              >
                手続き一覧
              </a>
              <a
                href="/offices"
                className="hidden sm:inline-block px-2 py-1 text-xs text-gray-600 hover:text-brand-navy"
              >
                機関一覧
              </a>
              <a href="/start" className="btn-primary py-2 px-4 text-xs">
                診断する →
              </a>
            </nav>
          </div>
        </header>

        <main>{children}</main>

        <footer className="mt-16 border-t border-gray-200 bg-white">
          <div className="mx-auto max-w-5xl px-4 py-8 text-center text-xs text-gray-400">
            <p>
              本サイトの情報は一般的な参考情報です。実際の手続き・期限・提出先は必ず各公式機関の最新情報をご確認ください。
            </p>
            <p className="mt-2">© 2026 SUNBOO経営ナビ</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
