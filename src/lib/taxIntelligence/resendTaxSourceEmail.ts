import type {
  ClaimedTaxSourceChangeNotification,
} from './notificationDeliveryQueue.ts';

export type ResendTaxSourceEmailConfig = {
  apiKey: string;
  from: string;
  to: string;
  appBaseUrl: string;
};

export type ResendFetch = typeof fetch;

function requireHeaderValue(
  name: string,
  value: string,
): string {
  const normalized = value.trim();

  if (
    normalized.length === 0 ||
    /[\r\n]/.test(normalized)
  ) {
    throw new Error(
      `${name}の設定値が不正です。`,
    );
  }

  return normalized;
}

function requireEmail(
  name: string,
  value: string,
): string {
  const normalized =
    requireHeaderValue(name, value);

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      normalized.replace(
        /^.*<([^>]+)>$/,
        '$1',
      ),
    )
  ) {
    throw new Error(
      `${name}のメールアドレスが不正です。`,
    );
  }

  return normalized;
}

function requireAppBaseUrl(
  value: string,
): string {
  const normalized = value.trim();
  let url: URL;

  try {
    url = new URL(normalized);
  } catch {
    throw new Error(
      '通知画面URLの設定値が不正です。',
    );
  }

  if (
    url.protocol !== 'https:' &&
    !(
      url.protocol === 'http:' &&
      url.hostname === 'localhost'
    )
  ) {
    throw new Error(
      '通知画面URLはHTTPSで設定してください。',
    );
  }

  return url.toString().replace(/\/$/, '');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildReviewUrl(
  appBaseUrl: string,
): string {
  return `${appBaseUrl}/admin/tax-intelligence`;
}

function buildEmailContent(
  notification:
    ClaimedTaxSourceChangeNotification,
  appBaseUrl: string,
) {
  const payload = notification.payload;
  const reviewUrl =
    buildReviewUrl(appBaseUrl);
  const subject =
    `[SUNBOO] 税務ソース変更レビュー #${payload.reviewId}`;
  const versionLabel =
    payload.versionLabel ?? '版情報なし';
  const previousVersionLabel =
    payload.supersedesVersionLabel ??
    '版情報なし';

  const text = [
    '公式税務ソースの変更を検出しました。',
    '',
    `ソース: ${payload.sourceTitle}`,
    `現在版: ${versionLabel}`,
    `前版: ${previousVersionLabel}`,
    `影響Rule候補: ${payload.ruleCandidateCount}件`,
    `影響Control候補: ${payload.controlCandidateCount}件`,
    `ReviewCase: ${payload.reviewId}`,
    '',
    `確認画面: ${reviewUrl}`,
    '',
    'このメールはSUNBOO Tax Intelligenceから自動送信されています。',
  ].join('\n');

  const html = `
<!doctype html>
<html lang="ja">
  <body style="margin:0;background:#f5f7fa;color:#1f2937;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <div style="max-width:640px;margin:0 auto;padding:32px 16px;">
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:28px;">
        <h1 style="margin:0 0 16px;font-size:20px;">
          公式税務ソースの変更を検出しました
        </h1>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr>
            <th style="padding:8px;text-align:left;color:#6b7280;">ソース</th>
            <td style="padding:8px;">${escapeHtml(payload.sourceTitle)}</td>
          </tr>
          <tr>
            <th style="padding:8px;text-align:left;color:#6b7280;">現在版</th>
            <td style="padding:8px;">${escapeHtml(versionLabel)}</td>
          </tr>
          <tr>
            <th style="padding:8px;text-align:left;color:#6b7280;">前版</th>
            <td style="padding:8px;">${escapeHtml(previousVersionLabel)}</td>
          </tr>
          <tr>
            <th style="padding:8px;text-align:left;color:#6b7280;">影響候補</th>
            <td style="padding:8px;">
              Rule ${payload.ruleCandidateCount}件 /
              Control ${payload.controlCandidateCount}件
            </td>
          </tr>
        </table>
        <p style="margin:24px 0 0;">
          <a href="${escapeHtml(reviewUrl)}"
             style="display:inline-block;padding:11px 18px;border-radius:8px;background:#2563eb;color:#ffffff;text-decoration:none;">
            レビューを確認
          </a>
        </p>
      </div>
    </div>
  </body>
</html>`.trim();

  return {
    subject,
    text,
    html,
  };
}

export async function sendTaxSourceChangeReviewEmail(
  notification:
    ClaimedTaxSourceChangeNotification,
  config: ResendTaxSourceEmailConfig,
  fetchImpl: ResendFetch = fetch,
): Promise<{
  providerMessageId: string;
  recipient: string;
}> {
  const apiKey =
    requireHeaderValue(
      'RESEND_API_KEY',
      config.apiKey,
    );
  const from =
    requireEmail(
      'TAX_NOTIFICATION_EMAIL_FROM',
      config.from,
    );
  const to =
    requireEmail(
      'TAX_NOTIFICATION_EMAIL_TO',
      config.to,
    );
  const appBaseUrl =
    requireAppBaseUrl(config.appBaseUrl);
  const content =
    buildEmailContent(
      notification,
      appBaseUrl,
    );

  const response = await fetchImpl(
    'https://api.resend.com/emails',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type':
          'application/json',
        'Idempotency-Key':
          `tax-source-change-review-opened/${notification.notificationEventId}`,
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: content.subject,
        text: content.text,
        html: content.html,
      }),
    },
  );

  const body =
    await response.json().catch(
      () => null,
    ) as
      | {
          id?: unknown;
          message?: unknown;
        }
      | null;

  if (!response.ok) {
    const providerMessage =
      typeof body?.message === 'string'
        ? body.message
        : `HTTP ${response.status}`;

    throw new Error(
      `Resendメール送信に失敗しました: ${providerMessage}`,
    );
  }

  if (
    typeof body?.id !== 'string' ||
    body.id.length === 0
  ) {
    throw new Error(
      'Resendメール送信結果にmessage IDがありません。',
    );
  }

  return {
    providerMessageId: body.id,
    recipient: to,
  };
}
