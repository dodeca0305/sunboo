import { ImageResponse } from 'next/og';

// ブラウザタブ・ブックマークのファビコン。既存ヘッダーの「S」ロゴバッジ
// （src/app/(site)/layout.tsx、bg-blue-600・白文字・角丸）と同じデザインを踏襲する。
export const size = { width: 64, height: 64 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#2563EB',
          borderRadius: 14,
          color: '#FFFFFF',
          fontSize: 40,
          fontWeight: 700,
        }}
      >
        S
      </div>
    ),
    { ...size },
  );
}
