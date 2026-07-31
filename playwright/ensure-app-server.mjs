export const DEFAULT_APP_SERVER_TIMEOUT_MS = 5000;

export function resolveAppServerTimeoutMs(rawValue) {
  if (rawValue === undefined) {
    return DEFAULT_APP_SERVER_TIMEOUT_MS;
  }

  const timeoutMs = Number(rawValue);

  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    return null;
  }

  return timeoutMs;
}

export async function ensureAppServerAvailable(appUrl) {
  const rawTimeoutMs =
    process.env.PREVIEW_APP_TIMEOUT_MS;

  const timeoutMs =
    resolveAppServerTimeoutMs(rawTimeoutMs);

  if (timeoutMs === null) {
    console.error(
      `PREVIEW_APP_TIMEOUT_MSが不正です: ${rawTimeoutMs}`,
    );
    console.error(
      '1以上の整数（ミリ秒）を指定してください。',
    );
    return false;
  }

  let healthCheckUrl;

  try {
    healthCheckUrl = new URL(
      '/admin/login',
      `${appUrl.replace(/\/+$/, '')}/`,
    ).toString();
  } catch {
    console.error(`PREVIEW_APP_URLが不正です: ${appUrl}`);
    return false;
  }

  try {
    const response = await fetch(healthCheckUrl, {
      method: 'HEAD',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (response.status >= 500) {
      console.error(
        `開発サーバーがエラーを返しました: ${healthCheckUrl} ` +
          `(HTTP ${response.status})`,
      );
      console.error(
        'サーバーのターミナルログを確認してから再試行してください。',
      );
      return false;
    }

    return true;
  } catch {
    console.error(`開発サーバーへ接続できません: ${appUrl}`);
    console.error(
      '別ターミナルで npm run dev を実行してから再試行してください。',
    );
    return false;
  }
}
