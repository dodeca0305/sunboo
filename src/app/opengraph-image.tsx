import { ImageResponse } from 'next/og';
import { brandMarkSatoriLayers } from '@/components/BrandMark';

// SNS共有時に表示されるOGP画像。Brand System v1.0（凍結）のSymbol＋Wordmarkを使用する。
// twitter-image用のファイルを別途用意しなくても、Next.jsはopengraph-imageをtwitter:imageとしても
// 自動的に使用する。Orangeはbrand-mark内の1箇所のみ（ロゴ以外の要素には使わない）。
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#FFFFFF',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ display: 'flex', position: 'relative', width: 96, height: 96 }}>
            {brandMarkSatoriLayers()}
          </div>
          <div style={{ display: 'flex', fontSize: 64, fontWeight: 700, color: '#111827' }}>
            SUNBOO経営ナビ
          </div>
        </div>
        <div style={{ display: 'flex', marginTop: 28, fontSize: 30, color: '#6B7280' }}>
          法人設立・行政手続きの情報サービス
        </div>
      </div>
    ),
    { ...size },
  );
}
