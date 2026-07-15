import { ImageResponse } from 'next/og';

// SNS共有時に表示されるOGP画像。twitter-image用のファイルを別途用意しなくても、
// Next.jsはopengraph-imageをtwitter:imageとしても自動的に使用する。
// デザインは既存ヘッダー（src/app/(site)/layout.tsx）の「S」ロゴバッジ＋ワードマークをそのまま拡大しただけで、
// 新しいブランド要素は追加していない。
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
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 96,
              height: 96,
              borderRadius: 20,
              background: '#2563EB',
              color: '#FFFFFF',
              fontSize: 56,
              fontWeight: 700,
            }}
          >
            S
          </div>
          <div style={{ display: 'flex', fontSize: 64, fontWeight: 700, color: '#111827' }}>
            SUNBOO<span style={{ color: '#2563EB' }}>経営ナビ</span>
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
