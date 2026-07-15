import { ImageResponse } from 'next/og';
import { brandMarkSatoriLayers } from '@/components/BrandMark';

// iOS「ホーム画面に追加」時のアイコン。iOSは透過PNGの余白を意図通りに描画しないため、
// 白背景を敷いた上にマークを乗せる（角丸はiOS側が自動で適用するため、素材側では付けない）。
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', background: '#FFFFFF' }}>
        {brandMarkSatoriLayers()}
      </div>
    ),
    { ...size },
  );
}
