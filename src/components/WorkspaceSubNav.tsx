'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Building2, Receipt, CalendarRange, FileStack, Share2 } from 'lucide-react';

// ── Company Workspace — サブナビゲーション（Sprint 30 Workspace Navigation & Migration・Sprint 35）─
// Workspace内の各ページ（Dashboard/Profile/TaxReturns/Roadmap/Documents/Share）を、都度Dashboardへ
// 戻らなくても直接行き来できるようにする共通タブ。実装済みのタブのみを対象にする
// （会計分析はComing Soonのため含めない）。

const TABS = [
  { label: 'ホーム', hrefSuffix: '', icon: LayoutDashboard },
  { label: '会社プロフィール', hrefSuffix: '/profile', icon: Building2 },
  { label: '決算実績', hrefSuffix: '/tax-returns', icon: Receipt },
  { label: '年間ロードマップ', hrefSuffix: '/roadmap', icon: CalendarRange },
  { label: '書類', hrefSuffix: '/documents', icon: FileStack },
  { label: '共有', hrefSuffix: '/share', icon: Share2 },
] as const;

export default function WorkspaceSubNav({ companyId }: { companyId: number }) {
  const pathname = usePathname();
  const base = `/admin/workspaces/${companyId}`;

  return (
    <nav className="flex flex-wrap gap-1 border-b border-gray-100 pb-3">
      {TABS.map(({ label, hrefSuffix, icon: Icon }) => {
        const href = `${base}${hrefSuffix}`;
        const active = pathname === href;
        return (
          <Link
            key={label}
            href={href}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              active ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
