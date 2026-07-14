import { AlertTriangle, Info, type LucideIcon } from 'lucide-react';

// ── Information Card（Sprint85「SUNBOO Brand Experience」）─────────────────
// アプリ全体に散在していた注意書き・補足カード（bg-gray-50/60、bg-red-50、bg-amber-50 等の
// 個別実装）を、Info / Caution / Disclaimer / Error の4種類だけに統一する。
// カード全体を強い色で塗らず、境界線・アイコン・見出し・本文の組み合わせでトーンを伝える
// （SUNBOO_DESIGN_GUIDELINES.md §8「Information不足表示」「Error Message」方針を踏襲）。

export type InformationCardKind = 'info' | 'caution' | 'disclaimer' | 'error';

const ICON: Record<InformationCardKind, LucideIcon> = {
  info: Info,
  caution: AlertTriangle,
  disclaimer: AlertTriangle,
  error: AlertTriangle,
};

const BOX_CLASS: Record<InformationCardKind, string> = {
  info: 'information-card information-card--info',
  caution: 'information-card information-card--caution',
  disclaimer: 'information-card information-card--disclaimer',
  error: 'information-card information-card--error',
};

const ICON_CLASS: Record<InformationCardKind, string> = {
  info: 'text-sunboo-ink-muted',
  caution: 'text-sunboo-morning-sun-dark',
  disclaimer: 'text-sunboo-ink-muted',
  error: 'text-sunboo-danger',
};

const TITLE_CLASS: Record<InformationCardKind, string> = {
  info: 'text-sunboo-ink',
  caution: 'text-sunboo-ink',
  disclaimer: 'text-sunboo-ink-muted',
  error: 'text-sunboo-danger',
};

const BODY_CLASS: Record<InformationCardKind, string> = {
  info: 'text-sunboo-ink-muted',
  caution: 'text-sunboo-ink',
  disclaimer: 'text-sunboo-ink-muted',
  error: 'text-sunboo-ink',
};

export default function InformationCard({
  kind,
  title,
  children,
  className = '',
}: {
  kind: InformationCardKind;
  /** 短い見出し（任意）。Caution/Errorで「何が起きたか」を一言で示す用途を想定 */
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const Icon = ICON[kind];
  const isDisclaimer = kind === 'disclaimer';
  return (
    <div className={`${BOX_CLASS[kind]}${className ? ` ${className}` : ''}`}>
      <Icon
        className={`mt-0.5 h-4 w-4 shrink-0 ${ICON_CLASS[kind]}`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        {title && (
          <p className={`font-semibold ${isDisclaimer ? 'text-sunboo-tiny' : 'text-sm'} ${TITLE_CLASS[kind]}`}>
            {title}
          </p>
        )}
        <div className={`${isDisclaimer ? 'text-sunboo-tiny' : 'text-xs'} leading-relaxed ${BODY_CLASS[kind]}`}>
          {children}
        </div>
      </div>
    </div>
  );
}
