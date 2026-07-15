import { ImageResponse } from 'next/og';

// iOS「ホーム画面に追加」時のアイコン。Appleの慣例に合わせ角丸なしの正方形で用意する
// （iOS側が自動で角丸マスクを適用するため）。デザインはicon.tsxと同一の「S」ロゴ。
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
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
          color: '#FFFFFF',
          fontSize: 108,
          fontWeight: 700,
        }}
      >
        S
      </div>
    ),
    { ...size },
  );
}
