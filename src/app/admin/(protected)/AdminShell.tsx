'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Building2,
  Briefcase,
  ClipboardList,
  Link2,
  Upload,
  Download,
  Menu,
  X,
  LogOut,
  ExternalLink,
  Tags,
  Workflow,
  Database,
} from 'lucide-react';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import BrandMark from '@/components/BrandMark';
import WorkspaceSubNav from '@/components/WorkspaceSubNav';
import taxReviewStyles from '@/styles/taxReview.module.css';

const NAV_ITEMS = [
  { href: '/admin', label: 'ダッシュボード', icon: LayoutDashboard, exact: true },
  { href: '/admin/workspaces', label: '顧問先', icon: Briefcase },
  { href: '/admin/offices', label: '管轄機関', icon: Building2 },
  { href: '/admin/organization-types', label: '機関種別', icon: Tags },
  { href: '/admin/procedures', label: '手続き', icon: ClipboardList },
  { href: '/admin/rules', label: 'ルール', icon: Workflow },
  { href: '/admin/tax-intelligence', label: '税務ソース', icon: Database },
  { href: '/admin/links', label: 'リンクチェック', icon: Link2 },
  { href: '/admin/import', label: 'CSVインポート', icon: Upload },
  { href: '/admin/export', label: 'CSVエクスポート', icon: Download },
];

export default function AdminShell({
  adminEmail,
  children,
}: {
  adminEmail: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const monochrome = /^\/admin\/workspaces\/[1-9]\d*\/tax-review\/?$/.test(pathname);
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const workspaceMatch = /^\/admin\/workspaces\/([1-9]\d*)(?:\/|$)/.exec(pathname);
  const workspaceId = workspaceMatch ? Number(workspaceMatch[1]) : null;
  const companyId = workspaceId !== null && Number.isSafeInteger(workspaceId) ? workspaceId : null;

  useEffect(() => {
    if (!menuOpen) return;
    const trigger = menuButton.current;
    closeButton.current?.focus();
    return () => trigger?.focus();
  }, [menuOpen]);

  function handleDrawerKey(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      setMenuOpen(false);
    }
    if (event.key !== 'Tab') return;
    const items = event.currentTarget.querySelectorAll<HTMLElement>('button, a[href], summary');
    const first = items[0], last = items[items.length - 1];
    // Closed details contain non-tabbable links; filter by rendered geometry.
    const visible = [...items].filter((item) => item.getClientRects().length > 0);
    const start = visible[0] ?? first, end = visible[visible.length - 1] ?? last;
    if (event.shiftKey && document.activeElement === start) { event.preventDefault(); end?.focus(); }
    else if (!event.shiftKey && document.activeElement === end) { event.preventDefault(); start?.focus(); }
  }

  async function handleLogout() {
    const supabase = createBrowserSupabase();
    if (supabase) await supabase.auth.signOut();
    router.push('/admin/login');
    router.refresh();
  }

  function isActive(href: string, exact?: boolean) {
    return exact ? pathname === href : pathname === href || pathname.startsWith(href + '/');
  }

  const navLinks = (
    <nav aria-label="管理メニュー" className="flex flex-col gap-1">
      {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(href, exact) ? 'page' : undefined}
          onClick={() => setMenuOpen(false)}
          className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
            isActive(href, exact)
              ? 'bg-blue-50 text-blue-700'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          }`}
        >
          <Icon className="h-4 w-4 shrink-0" />
          {label}
        </Link>
      ))}
    </nav>
  );

  const navigation = (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
      {companyId !== null ? (
        <>
          <p className="mb-2 px-3 text-xs font-semibold text-gray-500">この会社</p>
          <WorkspaceSubNav companyId={companyId} onNavigate={() => setMenuOpen(false)} />
          <Link href="/admin/workspaces" onClick={() => setMenuOpen(false)} className="mt-3 block rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">顧問先一覧へ</Link>
          <details className="mt-3 border-t border-gray-100 pt-3">
            <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-gray-500">管理メニュー</summary>
            <div className="mt-1">{navLinks}</div>
          </details>
        </>
      ) : navLinks}
    </div>
  );

  return (
    <div className={`flex min-h-screen ${monochrome ? taxReviewStyles.shell : 'bg-gray-50'}`} data-workspace-style={monochrome ? 'monochrome' : undefined}>
      {/* ── デスクトップ用サイドバー ── */}
      <aside className={`sticky top-0 hidden h-dvh shrink-0 border-r border-gray-100 bg-white ${monochrome ? 'w-52 md:flex md:flex-col' : 'w-60 lg:flex lg:flex-col'}`}>
        <div className="flex h-16 items-center gap-2.5 border-b border-gray-100 px-5">
          <BrandMark size={32} variant={monochrome ? 'mono' : 'color'} />
          <span className="text-sm font-bold text-gray-900">SUNBOO 管理画面</span>
        </div>
        {navigation}
        <div className="border-t border-gray-100 p-3">
          <p className="truncate px-3 text-xs text-gray-400">{adminEmail}</p>
          <button
            onClick={handleLogout}
            className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-red-600"
          >
            <LogOut className="h-4 w-4" />
            ログアウト
          </button>
        </div>
      </aside>

      {/* ── モバイル用ドロワー ── */}
      {menuOpen && (
        <div role="dialog" aria-modal="true" aria-label="ナビゲーションメニュー" onKeyDown={handleDrawerKey} className={`fixed inset-0 z-40 ${monochrome ? 'md:hidden' : 'lg:hidden'}`}>
          <div className="absolute inset-0 bg-gray-900/40" onClick={() => setMenuOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-gray-100 bg-white">
            <div className="flex h-16 items-center justify-between border-b border-gray-100 px-4">
              <span className="text-sm font-bold text-gray-900">SUNBOO 管理画面</span>
              <button ref={closeButton} aria-label="メニューを閉じる" onClick={() => setMenuOpen(false)} className="rounded-lg p-1.5 hover:bg-gray-50">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            {navigation}
            <div className="border-t border-gray-100 p-3">
              <p className="truncate px-3 text-xs text-gray-400">{adminEmail}</p>
              <button
                onClick={handleLogout}
                className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-red-600"
              >
                <LogOut className="h-4 w-4" />
                ログアウト
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ── メイン ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-gray-100 bg-white px-4 sm:px-6">
          <button
            ref={menuButton}
            aria-expanded={menuOpen}
            aria-haspopup="dialog"
            onClick={() => setMenuOpen(true)}
            className={`rounded-lg p-2 text-gray-500 hover:bg-gray-50 ${monochrome ? 'md:hidden' : 'lg:hidden'}`}
            aria-label="メニューを開く"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className={`text-sm font-bold text-gray-900 ${monochrome ? 'md:hidden' : 'lg:hidden'}`}>SUNBOO 管理画面</span>
          <Link
            href="/"
            target="_blank"
            className="ml-auto flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-900"
          >
            公開サイトを見る
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
