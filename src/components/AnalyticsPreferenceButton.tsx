'use client';

import { CONSENT_EVENT, CONSENT_KEY } from '@/components/GoogleAnalytics';

export default function AnalyticsPreferenceButton() {
  function reset() {
    window.localStorage.removeItem(CONSENT_KEY);
    window.dispatchEvent(new Event(CONSENT_EVENT));
    window.location.reload();
  }

  return (
    <button type="button" onClick={reset} className="btn-secondary mt-3 text-sm">
      アクセス解析の選択を変更する
    </button>
  );
}
