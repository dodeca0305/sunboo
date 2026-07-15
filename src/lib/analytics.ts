// ── 利用状況計測の土台（Sprint 11 Phase9.1 MVP）─────────────
// 外部の計測サービス（Google Analytics / Plausible / PostHog 等）にはまだ接続していない。
// どのサービスを使うか・Cookie同意をどう扱うかはプライバシーに関わる別途の意思決定が必要なため、
// 今回は「呼び出し側は具体的な送信先を意識しない」というインターフェースだけを用意する。
// 実際の送信先を決めたら、この関数の内部実装だけを差し替えればよい。

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

  // 現時点では外部送信を行わず、開発確認用にconsoleへ出力するのみ。
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.debug('[analytics]', payload);
  }

  // TODO: 実際の計測サービス（PostHog / GA4 / Mixpanel等）と接続する際はここで送信する
  // （本番でも無害に動くよう try/catch で囲むこと）。payloadは既にevent_name/timestampを
  // 含むフラットなオブジェクトのため、送信先SDKの共通イベント形式にそのまま渡せる想定。
}
