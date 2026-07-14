import Link from 'next/link';
import { ChevronLeft, Sun, type LucideIcon } from 'lucide-react';

// ── Page Header（Sprint85「SUNBOO Brand Experience」）───────────────────
// Workspace配下の各画面（Dashboard/Roadmap/Documents/Profile/Share）で個別に組まれていた
// 見出し（アイコン+h1、会社名をem-dashでh1に連結する等）を、Page Title / Subtitle / Action の
// 3段構成に統一する。brandを立てた画面（Dashboard/Roadmap）だけ、☀の小さなブランドタッチを表示する
// （派手なイラストにはしない。SUNBOO_DESIGN_GUIDELINES.md §4「太陽はマスコットではなく
// ブランドシンボルとして控えめに使用する」）。

export default function PageHeader({
  backHref,
  backLabel,
  icon: Icon,
  title,
  subtitle,
  action,
  brand = false,
}: {
  backHref?: string;
  backLabel?: string;
  icon?: LucideIcon;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  brand?: boolean;
}) {
  return (
    <div className="space-y-3">
      {backHref && (
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-sunboo-ink-muted transition-colors hover:text-sunboo-ink"
        >
          <ChevronLeft className="h-4 w-4" />
          {backLabel}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {brand && (
            <p className="page-header-brand mb-1 text-sunboo-tiny uppercase">
              <Sun className="h-3.5 w-3.5" aria-hidden="true" />
              Morning Brief
            </p>
          )}
          <h1 className="flex items-center gap-2 text-sunboo-section-title text-sunboo-ink">
            {Icon && <Icon className="h-5 w-5 shrink-0 text-sunboo-ink-muted" aria-hidden="true" />}
            {title}
          </h1>
          {subtitle && <p className="mt-1.5 text-sm text-sunboo-ink-muted">{subtitle}</p>}
        </div>
        {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
      </div>
    </div>
  );
}
