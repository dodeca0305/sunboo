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
  | 'feedback_link_clicked';

export type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

export function trackEvent(name: AnalyticsEventName, properties?: AnalyticsProperties): void {
  if (typeof window === 'undefined') return;

  // 現時点では外部送信を行わず、開発確認用にconsoleへ出力するのみ。
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.debug('[analytics]', name, properties ?? {});
  }

  // TODO: 実際の計測サービスと接続する際はここで送信する（本番でも無害に動くよう try/catch で囲むこと）。
}
