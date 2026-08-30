'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CONSENT_EVENT, CONSENT_KEY } from '@/components/GoogleAnalytics';

type Consent = 'granted' | 'denied' | null;

export default function AnalyticsConsent() {
  const [consent, setConsent] = useState<Consent>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const saved = window.localStorage.getItem(CONSENT_KEY);
      setConsent(saved === 'granted' || saved === 'denied' ? saved : null);
      setReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function choose(value: Exclude<Consent, null>) {
    window.localStorage.setItem(CONSENT_KEY, value);
    setConsent(value);
    window.dispatchEvent(new Event(CONSENT_EVENT));
  }

  if (!ready || consent !== null) return null;

  return (
    <aside
      className="fixed inset-x-4 bottom-4 z-[100] mx-auto max-w-3xl rounded-xl border border-gray-200 bg-white p-4 shadow-xl sm:flex sm:items-center sm:gap-5"
      aria-label="アクセス解析の設定"
    >
      <div className="flex-1">
        <p className="text-sm font-semibold text-gray-900">アクセス解析について</p>
        <p className="mt-1 text-xs leading-relaxed text-gray-600">
          サービス改善のためGoogle Analyticsを利用します。許可するまで計測は開始しません。
          詳細は<Link href="/privacy" className="ml-1 underline">プライバシーポリシー</Link>をご確認ください。
        </p>
      </div>
      <div className="mt-3 flex shrink-0 gap-2 sm:mt-0">
        <button type="button" onClick={() => choose('denied')} className="btn-secondary flex-1 px-4 py-2 text-xs sm:flex-none">
          許可しない
        </button>
        <button type="button" onClick={() => choose('granted')} className="btn-primary flex-1 px-4 py-2 text-xs sm:flex-none">
          許可する
        </button>
      </div>
    </aside>
  );
}
