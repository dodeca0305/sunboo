import { getStatusBadgeConfig, type StatusBadgeKind } from '@/lib/statusBadge';

// Procedure Status / Roadmap Status / Dashboard Status共通のバッジ表示部品。
// 一般的な分類用の.tag（pill形状）とは責務を分け、状態表現専用として使う
// （詳細は docs/SUNBOO_INTERACTIVE_CONTROLS_REVIEW.md）。
export default function StatusBadge({
  kind,
  suffix,
  className = '',
}: {
  kind: StatusBadgeKind;
  /** ラベルの後に続ける補足（例：件数「3件」）。printLabel（title属性）には含めない */
  suffix?: React.ReactNode;
  className?: string;
}) {
  const config = getStatusBadgeConfig(kind);
  const Icon = config.icon;
  return (
    <span className={`${config.className}${className ? ` ${className}` : ''}`} title={config.printLabel}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {config.label}
      {suffix !== undefined && <span>{suffix}</span>}
    </span>
  );
}
