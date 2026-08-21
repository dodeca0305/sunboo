import test from 'node:test';
import assert from 'node:assert/strict';

import {
  sendTaxSourceChangeReviewEmail,
} from './resendTaxSourceEmail.ts';

type Notification = Parameters<
  typeof sendTaxSourceChangeReviewEmail
>[0];

function notificationFixture(): Notification {
  return {
    notificationEventId: 50,
    reviewId: 30,
    eventType:
      'tax_source_change_review_opened',
    deliveryAttempts: 1,
    claimToken:
      '11111111-1111-4111-8111-111111111111',
    payload: {
      reviewId: 30,
      taxSourceId: 40,
      taxSourceVersionId: 2,
      supersedesSourceVersionId: 1,
      sourceTitle:
        '法人税法 <改正>',
      versionLabel: 'revision-2',
      contentHash: 'hash-2',
      supersedesVersionLabel:
        'revision-1',
      supersedesContentHash: 'hash-1',
      detectedAt:
        '2026-08-21T00:00:00.000Z',
      ruleCandidateCount: 1,
      controlCandidateCount: 2,
    },
  };
}

const config = {
  apiKey: 'test-api-key',
  from:
    'SUNBOO <notifications@example.com>',
  to: 'admin@example.com',
  appBaseUrl: 'https://sunboo.example.com',
};

test('Resend APIへ冪等キー付きメールを送る', async () => {
  const calls: Array<{
    input: string;
    init?: RequestInit;
  }> = [];

  const result =
    await sendTaxSourceChangeReviewEmail(
      notificationFixture(),
      config,
      (async (
        input: string | URL | Request,
        init?: RequestInit,
      ) => {
        calls.push({
          input: String(input),
          init,
        });

        return Response.json({
          id: 'resend-message-1',
        });
      }) as typeof fetch,
    );

  assert.equal(
    result.providerMessageId,
    'resend-message-1',
  );
  assert.equal(
    result.recipient,
    'admin@example.com',
  );
  assert.equal(
    calls[0].input,
    'https://api.resend.com/emails',
  );

  const headers =
    calls[0].init?.headers as
      Record<string, string>;

  assert.equal(
    headers['Idempotency-Key'],
    'tax-source-change-review-opened/50',
  );

  const body = JSON.parse(
    String(calls[0].init?.body),
  ) as {
    to: string[];
    html: string;
  };

  assert.deepEqual(body.to, [
    'admin@example.com',
  ]);
  assert.match(
    body.html,
    /法人税法 &lt;改正&gt;/,
  );
});

test('Resend APIエラーを通知する', async () => {
  await assert.rejects(
    () =>
      sendTaxSourceChangeReviewEmail(
        notificationFixture(),
        config,
        (async () =>
          Response.json(
            {
              message:
                'domain is not verified',
            },
            {
              status: 403,
            },
          )) as typeof fetch,
      ),
    /domain is not verified/,
  );
});

test('不正な送信元メールをAPI前に拒否する', async () => {
  let fetchWasCalled = false;

  await assert.rejects(
    () =>
      sendTaxSourceChangeReviewEmail(
        notificationFixture(),
        {
          ...config,
          from: 'invalid',
        },
        (async () => {
          fetchWasCalled = true;
          throw new Error('呼ばれない');
        }) as typeof fetch,
      ),
    /メールアドレスが不正です/,
  );

  assert.equal(fetchWasCalled, false);
});

test('HTTPS以外の本番URLを拒否する', async () => {
  await assert.rejects(
    () =>
      sendTaxSourceChangeReviewEmail(
        notificationFixture(),
        {
          ...config,
          appBaseUrl:
            'http://sunboo.example.com',
        },
      ),
    /HTTPSで設定してください/,
  );
});
