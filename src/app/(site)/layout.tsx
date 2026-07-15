import Link from 'next/link';
import { Search, Zap, UserCircle, CalendarRange, Briefcase } from 'lucide-react';
import FeedbackLink from '@/components/FeedbackLink';

// ── (site)ヘッダー・フッター（Sprint 30 Workspace Navigation & Migration）─────────
// 税理士・会計事務所向けの管理画面（/admin/workspaces、Sprint29でWorkspace Migration
// Strategyにより正式系と位置づけ済み）への導線を追加した。(site)側から/adminへのリンクは
// これまで0件だった（WORKSPACE_MIGRATION_STRATEGY.md 3-1節で確認済み）。

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 border-b border-gray-100 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white select-none">
              S
            </span>
            <span className="whitespace-nowrap text-base font-bold tracking-tight text-gray-900">
              SUNBOO<span className="text-blue-600">経営ナビ</span>
            </span>
            <span className="tag hidden shrink-0 border-blue-200 text-blue-600 sm:inline-flex">β版</span>
          </Link>

          <nav className="flex items-center gap-1">
            <Link
              href="/procedures"
              className="hidden sm:inline-flex rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
            >
              手続き一覧
            </Link>
            <Link
              href="/offices"
              className="hidden sm:inline-flex rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
            >
              機関一覧
            </Link>
            <Link
              href="/help"
              className="hidden sm:inline-flex rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
            >
              ヘルプ
            </Link>
            <Link
              href="/events"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
            >
              <Zap className="h-4 w-4" />
              イベント
            </Link>
            <Link
              href="/profile"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
            >
              <UserCircle className="h-4 w-4" />
              プロフィール
            </Link>
            <Link
              href="/roadmap"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
            >
              <CalendarRange className="h-4 w-4" />
              ロードマップ
            </Link>
            <Link
              href="/search"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
              aria-label="検索"
            >
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">検索</span>
            </Link>
            <Link
              href="/admin/login"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
            >
              <Briefcase className="h-4 w-4" />
              税理士の方はこちら
            </Link>
            <Link href="/start" className="btn-primary ml-2 px-4 py-2 text-xs">
              診断する →
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      {/* ── Footer ── */}
      <footer className="mt-auto border-t border-gray-100 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-xs font-bold text-white">
                  S
                </span>
                <p className="font-bold text-gray-900">SUNBOO経営ナビ</p>
              </div>
              <p className="mt-1 text-xs text-sunboo-ink-muted">法人設立・行政手続きの情報サービス</p>
            </div>
            <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <Link href="/procedures" className="text-gray-500 transition-colors hover:text-gray-900">
                手続き一覧
              </Link>
              <Link href="/offices" className="text-gray-500 transition-colors hover:text-gray-900">
                機関一覧
              </Link>
              <Link href="/events" className="text-gray-500 transition-colors hover:text-gray-900">
                イベント
              </Link>
              <Link href="/profile" className="text-gray-500 transition-colors hover:text-gray-900">
                プロフィール
              </Link>
              <Link href="/roadmap" className="text-gray-500 transition-colors hover:text-gray-900">
                ロードマップ
              </Link>
              <Link href="/start" className="text-gray-500 transition-colors hover:text-gray-900">
                診断する
              </Link>
              <Link href="/help" className="text-gray-500 transition-colors hover:text-gray-900">
                ヘルプ
              </Link>
              <Link href="/admin/login" className="text-gray-500 transition-colors hover:text-gray-900">
                税理士・会計事務所の方
              </Link>
              <FeedbackLink className="inline-flex items-center gap-1 text-gray-500 transition-colors hover:text-gray-900" />
            </nav>
          </div>
          <div className="mt-8 border-t border-gray-100 pt-6 text-xs text-sunboo-ink-muted">
            <p>
              現在は福岡県・東京都渋谷区対応のβ版です。本サービスの情報は一般的な参考情報です。
              実際の手続き・期限・提出先は必ず各公式機関の最新情報をご確認ください。
            </p>
            <p className="mt-1">© 2026 SUNBOO経営ナビ</p>
          </div>
        </div>
      </footer>
    </>
  );
}
