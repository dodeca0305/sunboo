'use client';

import { useEffect, useRef } from 'react';
import { trackEvent, type AnalyticsEventName, type AnalyticsProperties } from '@/lib/analytics';

// ── Product Analytics Foundation（RC2）── サーバーコンポーネントのページから
// ページ表示イベントを計測するための小さなクライアント部品。TrackedLink.tsx（クリック計測）と
// 同じ考え方で、ページ全体を'use client'にせず、計測が必要な箇所だけをこれで置き換える。
// 何も描画しない（DOM出力なし）ため、見た目には一切影響しない。
export default function AnalyticsPageEvent({
  event,
  properties,
}: {
  event: AnalyticsEventName;
  properties?: AnalyticsProperties;
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    trackEvent(event, properties);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
