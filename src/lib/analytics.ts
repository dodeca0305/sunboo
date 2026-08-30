// ── 利用状況計測の土台（Sprint 11 Phase9.1 MVP）─────────────
// 送信先はGA4。利用者がアクセス解析を許可した場合だけイベントを送信する。
// 顧問先を識別し得るworkspace_id/company_id等はGA4へ渡さず、イベント名だけを集計する。

export type AnalyticsEventName =
  | 'demo_view_clicked'
  | 'start_clicked'
  | 'event_registered'
  | 'procedure_status_changed'
  | 'feedback_link_clicked'
  // ── RC2 Product Analytics Foundation（Sprint89想定）で追加。Company Workspace側の
  // 利用状況計測用。詳細な発火タイミング・保存項目はdocs/ANALYTICS_STRATEGY.md参照。
  | 'company_created'
  | 'profile_completed'
  | 'roadmap_generated'
  | 'pdf_exported'
  | 'excel_exported'
  | 'share_created'
  | 'share_opened';

export type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

export function trackEvent(name: AnalyticsEventName, properties?: AnalyticsProperties): void {
  if (typeof window === 'undefined') return;

  // event_name・timestampは呼び出し側に持たせず、ここで一律に付与する
  // （docs/ANALYTICS_STRATEGY.md「保存項目」参照。呼び出し側はworkspace_id/company_id等の
  // 文脈情報のみを渡す）。
  const payload: AnalyticsProperties & { event_name: AnalyticsEventName; timestamp: string } = {
    ...properties,
    event_name: name,
    timestamp: new Date().toISOString(),
  };

  if (process.env.NODE_ENV !== 'production') {
    console.debug('[analytics]', payload);
  }

  try {
    if (
      window.localStorage.getItem('sunboo:analytics-consent') === 'granted' &&
      typeof window.gtag === 'function'
    ) {
      window.gtag('event', name);
    }
  } catch {
    // 計測の失敗で本体機能を止めない。
  }
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}
