import test from 'node:test';
import assert from 'node:assert/strict';

import type { SupabaseClient } from '../supabase';
import {
  deliverNextTaxSourceChangeEmail,
} from './taxSourceEmailDelivery.ts';

const supabase =
  {} as SupabaseClient;

const config = {
  apiKey: 're_test_key',
  from: 'SUNBOO <notice@example.com>',
  to: 'admin@example.com',
  appBaseUrl: 'https://sunboo.example.com',
};

function notificationFixture() {
  return {
    notificationEventId: 50,
    reviewId: 30,
    eventType:
      'tax_source_change_review_opened' as const,
    payload: {
      reviewId: 30,
      taxSourceId: 40,
      taxSourceVersionId: 2,
      supersedesSourceVersionId: 1,
      sourceTitle: '法人税法',
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
    deliveryAttempts: 1,
    claimToken:
      '11111111-1111-4111-8111-111111111111',
  };
}

test('配送対象がなければidleを返す', async () => {
  let sendWasCalled = false;

  const result =
    await deliverNextTaxSourceChangeEmail(
      supabase,
      config,
      {
        async claim() {
          return null;
        },
        async send() {
          sendWasCalled = true;
          throw new Error('呼ばれない');
        },
        async complete() {
          throw new Error('呼ばれない');
        },
        async fail() {
          throw new Error('呼ばれない');
        },
      },
    );

  assert.deepEqual(result, {
    outcome: 'idle',
  });
  assert.equal(sendWasCalled, false);
});

test('メール送信後に配送完了を保存する', async () => {
  const calls: string[] = [];

  const result =
    await deliverNextTaxSourceChangeEmail(
      supabase,
      config,
      {
        async claim() {
          calls.push('claim');
          return notificationFixture();
        },
        async send(notification) {
          calls.push(
            `send:${notification.notificationEventId}`,
          );
          return {
            providerMessageId:
              'resend-message-1',
            recipient:
              'admin@example.com',
          };
        },
        async complete(
          _supabase,
          input,
        ) {
          calls.push(
            `complete:${input.notificationEventId}`,
          );
          assert.equal(
            input.claimToken,
            notificationFixture().claimToken,
          );
          assert.equal(
            input.deliveryRecipient,
            'admin@example.com',
          );
          assert.equal(
            input.providerMessageId,
            'resend-message-1',
          );
        },
        async fail() {
          throw new Error('呼ばれない');
        },
      },
    );

  assert.deepEqual(calls, [
    'claim',
    'send:50',
    'complete:50',
  ]);
  assert.deepEqual(result, {
    outcome: 'delivered',
    notificationEventId: 50,
    reviewId: 30,
    deliveryAttempts: 1,
    recipient: 'admin@example.com',
    providerMessageId:
      'resend-message-1',
  });
});

test('送信失敗を保存してfailedを返す', async () => {
  let recordedError = '';

  const result =
    await deliverNextTaxSourceChangeEmail(
      supabase,
      config,
      {
        async claim() {
          return notificationFixture();
        },
        async send() {
          throw new Error(
            'Resend unavailable',
          );
        },
        async complete() {
          throw new Error('呼ばれない');
        },
        async fail(
          _supabase,
          input,
        ) {
          recordedError =
            input.errorMessage;
        },
      },
    );

  assert.equal(
    recordedError,
    'Resend unavailable',
  );
  assert.deepEqual(result, {
    outcome: 'failed',
    notificationEventId: 50,
    reviewId: 30,
    deliveryAttempts: 1,
    failureRecorded: true,
    errorMessage:
      'Resend unavailable',
  });
});

test('失敗保存にも失敗しても例外を投げない', async () => {
  const result =
    await deliverNextTaxSourceChangeEmail(
      supabase,
      config,
      {
        async claim() {
          return notificationFixture();
        },
        async send() {
          throw new Error(
            'Resend unavailable',
          );
        },
        async complete() {
          throw new Error('呼ばれない');
        },
        async fail() {
          throw new Error(
            'database unavailable',
          );
        },
      },
    );

  assert.deepEqual(result, {
    outcome: 'failed',
    notificationEventId: 50,
    reviewId: 30,
    deliveryAttempts: 1,
    failureRecorded: false,
    errorMessage:
      'database unavailable',
  });
});
