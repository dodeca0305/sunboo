import test from 'node:test';
import assert from 'node:assert/strict';

import {
  claimTaxSourceChangeNotification,
  completeTaxSourceChangeNotification,
  failTaxSourceChangeNotification,
} from './notificationDeliveryQueue.ts';

type QueueSupabase = Parameters<
  typeof claimTaxSourceChangeNotification
>[0];

function payloadFixture() {
  return {
    reviewId: 30,
    taxSourceId: 40,
    taxSourceVersionId: 2,
    supersedesSourceVersionId: 1,
    sourceTitle: '法人税法',
    versionLabel: 'revision-2',
    contentHash: 'hash-2',
    supersedesVersionLabel: 'revision-1',
    supersedesContentHash: 'hash-1',
    detectedAt:
      '2026-08-21T00:00:00.000Z',
    ruleCandidateCount: 1,
    controlCandidateCount: 2,
  };
}

function createRpcFixture(
  responses: Array<{
    data: unknown;
    error: { message: string } | null;
  }>,
  calls: Array<{
    functionName: string;
    parameters: Record<string, unknown>;
  }>,
): QueueSupabase {
  return {
    async rpc(
      functionName: string,
      parameters: Record<string, unknown>,
    ) {
      calls.push({
        functionName,
        parameters,
      });

      const response = responses.shift();

      if (!response) {
        throw new Error('unexpected RPC');
      }

      return response;
    },
  } as unknown as QueueSupabase;
}

test('pending通知イベントを原子的にClaimする', async () => {
  const calls: Array<{
    functionName: string;
    parameters: Record<string, unknown>;
  }> = [];

  const result =
    await claimTaxSourceChangeNotification(
      createRpcFixture(
        [
          {
            data: [
              {
                notification_event_id: 50,
                review_id: 30,
                event_type:
                  'tax_source_change_review_opened',
                payload: payloadFixture(),
                delivery_attempts: 1,
                claim_token:
                  '11111111-1111-4111-8111-111111111111',
              },
            ],
            error: null,
          },
        ],
        calls,
      ),
    );

  assert.equal(
    result?.notificationEventId,
    50,
  );
  assert.equal(result?.payload.sourceTitle, '法人税法');
  assert.deepEqual(calls, [
    {
      functionName:
        'claim_tax_source_change_notification_event',
      parameters: {
        p_lease_seconds: 300,
      },
    },
  ]);
});

test('配送対象がなければnullを返す', async () => {
  const result =
    await claimTaxSourceChangeNotification(
      createRpcFixture(
        [
          {
            data: [],
            error: null,
          },
        ],
        [],
      ),
    );

  assert.equal(result, null);
});

test('payloadとレビューIDが違えば拒否する', async () => {
  await assert.rejects(
    () =>
      claimTaxSourceChangeNotification(
        createRpcFixture(
          [
            {
              data: [
                {
                  notification_event_id: 50,
                  review_id: 31,
                  event_type:
                    'tax_source_change_review_opened',
                  payload: payloadFixture(),
                  delivery_attempts: 1,
                  claim_token:
                    '11111111-1111-4111-8111-111111111111',
                },
              ],
              error: null,
            },
          ],
          [],
        ),
      ),
    /レビューIDが一致しません/,
  );
});

test('配送成功をClaim token付きで保存する', async () => {
  const calls: Array<{
    functionName: string;
    parameters: Record<string, unknown>;
  }> = [];

  await completeTaxSourceChangeNotification(
    createRpcFixture(
      [
        {
          data: true,
          error: null,
        },
      ],
      calls,
    ),
    {
      notificationEventId: 50,
      claimToken:
        '11111111-1111-4111-8111-111111111111',
      deliveryRecipient:
        'admin@example.com',
      providerMessageId: 'resend-1',
    },
  );

  assert.equal(
    calls[0].functionName,
    'complete_tax_source_change_notification_event',
  );
  assert.equal(
    calls[0].parameters.p_provider_message_id,
    'resend-1',
  );
});

test('配送失敗を正規化して保存する', async () => {
  const calls: Array<{
    functionName: string;
    parameters: Record<string, unknown>;
  }> = [];

  await failTaxSourceChangeNotification(
    createRpcFixture(
      [
        {
          data: true,
          error: null,
        },
      ],
      calls,
    ),
    {
      notificationEventId: 50,
      claimToken:
        '11111111-1111-4111-8111-111111111111',
      errorMessage: '  API unavailable  ',
    },
  );

  assert.equal(
    calls[0].parameters.p_error,
    'API unavailable',
  );
});

test('失効したClaimの完了を拒否する', async () => {
  await assert.rejects(
    () =>
      completeTaxSourceChangeNotification(
        createRpcFixture(
          [
            {
              data: false,
              error: null,
            },
          ],
          [],
        ),
        {
          notificationEventId: 50,
          claimToken:
            '11111111-1111-4111-8111-111111111111',
          deliveryRecipient:
            'admin@example.com',
          providerMessageId: 'resend-1',
        },
      ),
    /Claimが失効しています/,
  );
});
