import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ensureTaxSourceChangeNotificationEvent,
} from './sourceChangeNotifications.ts';

type NotificationSupabase = Parameters<
  typeof ensureTaxSourceChangeNotificationEvent
>[0];

function createRpcFixture(
  response: {
    data: unknown;
    error: { message: string } | null;
  },
  calls: Array<{
    functionName: string;
    parameters: Record<string, unknown>;
  }>,
): NotificationSupabase {
  return {
    async rpc(
      functionName: string,
      parameters: Record<string, unknown>,
    ) {
      calls.push({
        functionName,
        parameters,
      });

      return response;
    },
  } as unknown as NotificationSupabase;
}

test('変更レビュー通知イベントを冪等作成RPCへ渡す', async () => {
  const calls: Array<{
    functionName: string;
    parameters: Record<string, unknown>;
  }> = [];

  const result =
    await ensureTaxSourceChangeNotificationEvent(
      createRpcFixture(
        {
          data: [
            {
              notification_event_id: 50,
              review_id: 30,
              event_type:
                'tax_source_change_review_opened',
              delivery_status: 'pending',
              was_created: true,
            },
          ],
          error: null,
        },
        calls,
      ),
      30,
    );

  assert.deepEqual(calls, [
    {
      functionName:
        'ensure_tax_source_change_notification_event',
      parameters: {
        p_review_id: 30,
      },
    },
  ]);

  assert.deepEqual(result, {
    notificationEventId: 50,
    reviewId: 30,
    eventType:
      'tax_source_change_review_opened',
    deliveryStatus: 'pending',
    wasCreated: true,
  });
});

test('既存通知イベントの参照を保持する', async () => {
  const result =
    await ensureTaxSourceChangeNotificationEvent(
      createRpcFixture(
        {
          data: [
            {
              notification_event_id: 50,
              review_id: 30,
              event_type:
                'tax_source_change_review_opened',
              delivery_status: 'failed',
              was_created: false,
            },
          ],
          error: null,
        },
        [],
      ),
      30,
    );

  assert.equal(result.wasCreated, false);
  assert.equal(
    result.deliveryStatus,
    'failed',
  );
});

test('不正なレビューIDはRPC前に拒否する', async () => {
  let rpcWasCalled = false;

  const supabase = {
    async rpc() {
      rpcWasCalled = true;
      throw new Error('呼ばれない');
    },
  } as unknown as NotificationSupabase;

  await assert.rejects(
    () =>
      ensureTaxSourceChangeNotificationEvent(
        supabase,
        0,
      ),
    /レビューIDが不正です/,
  );

  assert.equal(rpcWasCalled, false);
});

test('RPCエラーを通知する', async () => {
  await assert.rejects(
    () =>
      ensureTaxSourceChangeNotificationEvent(
        createRpcFixture(
          {
            data: null,
            error: {
              message: 'permission denied',
            },
          },
          [],
        ),
        30,
      ),
    /保存に失敗しました: permission denied/,
  );
});

test('レビューIDが一致しない応答を拒否する', async () => {
  await assert.rejects(
    () =>
      ensureTaxSourceChangeNotificationEvent(
        createRpcFixture(
          {
            data: [
              {
                notification_event_id: 50,
                review_id: 31,
                event_type:
                  'tax_source_change_review_opened',
                delivery_status:
                  'pending',
                was_created: true,
              },
            ],
            error: null,
          },
          [],
        ),
        30,
      ),
    /レビューIDが一致しません/,
  );
});
