export async function ensureAppServerAvailable(appUrl) {
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
      signal: AbortSignal.timeout(5000),
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
