import { ImageResponse } from 'next/og';
import { brandMarkSatoriLayers } from '@/components/BrandMark';

// ブラウザタブ・ブックマークのファビコン。Brand System v1.0（凍結）のSymbol仕様に従う。
export const size = { width: 64, height: 64 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', position: 'relative', display: 'flex' }}>
        {brandMarkSatoriLayers()}
      </div>
    ),
    { ...size },
  );
}
