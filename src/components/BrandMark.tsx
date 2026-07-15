import type { CSSProperties } from 'react';

// SUNBOO Brand Mark — Brand System v1.0（凍結）準拠。
// 24x24グリッド・4単位モジュール・矩形6枚のみ。曲線・角丸・グラデーションは使用しない。
// このコンポーネントが全ロゴ表示箇所（Header/Sidebar/favicon等）の唯一の描画元となる。
//
// 色はUIのDesign Token（--color-sunboo-*）に依存させず、ロゴ専用の固定値として独立させる。
// 将来UI側の配色チューニングが行われても、凍結済みのロゴの色だけは変化しない。
export const BRAND_MARK_NAVY = '#0F172A';
export const BRAND_MARK_ORANGE = '#FF9900';

export type BrandMarkVariant = 'color' | 'mono' | 'reverse';

// 24単位グリッド上の矩形6枚の座標（x, y, width, height）。DOM描画（<svg><rect>）と
// Satori描画（next/ogのicon.tsx/apple-icon.tsx、flexbox divのみサポート）の両方から
// 同じ座標定義を参照し、2箇所で数値がズレることを防ぐ。
export const BRAND_MARK_RECTS: { x: number; y: number; w: number; h: number; accent?: boolean }[] = [
  { x: 4, y: 2, w: 16, h: 4 },
  { x: 4, y: 6, w: 4, h: 4 },
  { x: 4, y: 10, w: 16, h: 4 },
  { x: 16, y: 14, w: 4, h: 4 },
  { x: 4, y: 18, w: 16, h: 4 },
  { x: 16, y: 6, w: 4, h: 4, accent: true },
];

const gridPct = (unit: number) => `${(unit / 24) * 100}%`;

// Satori（next/ogのレンダラー）は生の<svg>/<rect>要素を描画できず、flexbox＋絶対配置の
// <div>のみをサポートするため、icon.tsx・apple-icon.tsx用に別形式で同じ形状を返す。
export function brandMarkSatoriLayers(variant: BrandMarkVariant = 'color') {
  const bodyFill = variant === 'reverse' ? '#FFFFFF' : BRAND_MARK_NAVY;
  const accentFill = variant === 'mono' ? bodyFill : BRAND_MARK_ORANGE;
  return BRAND_MARK_RECTS.map(({ x, y, w, h, accent }, i) => (
    <div
      key={i}
      style={{
        display: 'flex',
        position: 'absolute',
        left: gridPct(x),
        top: gridPct(y),
        width: gridPct(w),
        height: gridPct(h),
        background: accent ? accentFill : bodyFill,
      }}
    />
  ));
}

export default function BrandMark({
  variant = 'color',
  size = 24,
  className,
}: {
  variant?: BrandMarkVariant;
  size?: number;
  className?: string;
}) {
  const bodyFill = variant === 'reverse' ? '#FFFFFF' : 'var(--brand-mark-navy)';
  const accentFill = variant === 'mono' ? bodyFill : 'var(--brand-mark-orange)';
  const style = {
    '--brand-mark-navy': BRAND_MARK_NAVY,
    '--brand-mark-orange': BRAND_MARK_ORANGE,
  } as CSSProperties;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      <rect x="4" y="2" width="16" height="4" fill={bodyFill} />
      <rect x="4" y="6" width="4" height="4" fill={bodyFill} />
      <rect x="4" y="10" width="16" height="4" fill={bodyFill} />
      <rect x="16" y="14" width="4" height="4" fill={bodyFill} />
      <rect x="4" y="18" width="16" height="4" fill={bodyFill} />
      <rect x="16" y="6" width="4" height="4" fill={accentFill} />
    </svg>
  );
}
