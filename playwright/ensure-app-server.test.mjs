import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { ensureAppServerAvailable } from './ensure-app-server.mjs';

function listen(server) {
  return new Promise((resolve, reject) => {
    const handleError = (error) => {
      reject(error);
    };

    server.once('error', handleError);

    server.listen(0, '127.0.0.1', () => {
      server.off('error', handleError);

      const address = server.address();

      if (!address || typeof address === 'string') {
        reject(
          new Error('テスト用サーバーのポートを取得できませんでした。'),
        );
        return;
      }

      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function withServer(statusCode, callback) {
  const server = createServer((_request, response) => {
    response.writeHead(statusCode);
    response.end();
  });

  const appUrl = await listen(server);

  try {
    return await callback(appUrl);
  } finally {
    await close(server);
  }
}

async function captureConsoleError(callback) {
  const messages = [];
  const originalConsoleError = console.error;

  console.error = (...args) => {
    messages.push(args.map(String).join(' '));
  };

  try {
    const result = await callback();

    return {
      result,
      messages,
    };
  } finally {
    console.error = originalConsoleError;
  }
}

test('正常なHTTP応答ならtrueを返す', async () => {
  await withServer(204, async (appUrl) => {
    const { result, messages } = await captureConsoleError(() =>
      ensureAppServerAvailable(appUrl),
    );

    assert.equal(result, true);
    assert.deepEqual(messages, []);
  });
});

test('HTTP 500ならfalseを返してサーバーログ確認を案内する', async () => {
  await withServer(500, async (appUrl) => {
    const { result, messages } = await captureConsoleError(() =>
      ensureAppServerAvailable(appUrl),
    );

    assert.equal(result, false);
    assert.ok(
      messages.some((message) => message.includes('HTTP 500')),
    );
    assert.ok(
      messages.some((message) =>
        message.includes(
          'サーバーのターミナルログを確認してから再試行してください。',
        ),
      ),
    );
  });
});

test('不正なURLならfalseを返して設定値を案内する', async () => {
  const appUrl = 'not a valid url';

  const { result, messages } = await captureConsoleError(() =>
    ensureAppServerAvailable(appUrl),
  );

  assert.equal(result, false);
  assert.ok(
    messages.includes(`PREVIEW_APP_URLが不正です: ${appUrl}`),
  );
});

test('接続できなければfalseを返して開発サーバー起動を案内する', async () => {
  const server = createServer((_request, response) => {
    response.end();
  });

  const appUrl = await listen(server);
  await close(server);

  const { result, messages } = await captureConsoleError(() =>
    ensureAppServerAvailable(appUrl),
  );

  assert.equal(result, false);
  assert.ok(
    messages.includes(`開発サーバーへ接続できません: ${appUrl}`),
  );
  assert.ok(
    messages.includes(
      '別ターミナルで npm run dev を実行してから再試行してください。',
    ),
  );
});
