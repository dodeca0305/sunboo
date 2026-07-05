'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { trackEvent, type AnalyticsEventName } from '@/lib/analytics';

// サーバーコンポーネントのページからクリック計測付きのLinkを使うための小さなクライアント部品。
// ページ全体を 'use client' にせず、計測が必要な箇所だけをこれで置き換える。
export default function TrackedLink({
  href,
  eventName,
  className,
  children,
}: {
  href: string;
  eventName: AnalyticsEventName;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} onClick={() => trackEvent(eventName)} className={className}>
      {children}
    </Link>
  );
}
