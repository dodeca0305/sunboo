import test from 'node:test';
import assert from 'node:assert/strict';

import {
  runScheduledEgovMonitoring,
} from './scheduledMonitoring.ts';

type MonitoringSupabase = Parameters<
  typeof runScheduledEgovMonitoring
>[0];

const supabase =
  {} as MonitoringSupabase;

function ingestionFixture(
  wasInserted: boolean,
  supersedesVersionId: number | null,
) {
  return {
    source: {
      lawId: '340AC0000000034',
      lawTitle: '法人税法',
      rawReference: 'https://laws.e-gov.go.jp/api/2/law_data/340AC0000000034',
      revisionId:
        '340AC0000000034_revision-2',
      amendmentEnforcementDate:
        '2026-08-12',
      normalizedText: '法人税法',
      contentHash: 'hash-2',
    },
    ingestion: {
      taxSourceVersionId: 2,
      taxSourceId: 40,
      contentHash: 'hash-2',
      supersedesVersionId,
      wasInserted,
    },
  };
}

function impactFixture(
  supersedesSourceVersionId:
    number | null,
) {
  return {
    sourceVersionId: 2,
    supersedesSourceVersionId,
    ruleCandidates: [
      {
        id: 10,
        ruleCode: 'RULE_A',
        versionNo: 1,
        status: 'approved' as const,
      },
    ],
    controlCandidates: [
      {
        id: 20,
        controlCode: 'CONTROL_A',
        versionNo: 1,
        status: 'approved' as const,
        isEnabled: true,
        evaluatorKey: 'evaluator/a',
        impactedRuleIds: [10],
      },
    ],
  };
}

test('新版を取り込み影響レビューを冪等作成する', async () => {
  const calls: string[] = [];
  const impact = impactFixture(1);

  const result =
    await runScheduledEgovMonitoring(
      supabase,
      {
        async ingestCurrent() {
          calls.push('ingest');
          return ingestionFixture(true, 1);
        },
        async discoverImpact(
          _supabase,
          sourceVersionId,
        ) {
          calls.push(
            `discover:${sourceVersionId}`,
          );
          return impact;
        },
        async ensureReview(
          _supabase,
          receivedImpact,
        ) {
          calls.push(
            `review:${receivedImpact.sourceVersionId}`,
          );
          return {
            reviewId: 30,
            taxSourceVersionId: 2,
            status: 'open',
            wasCreated: true,
          };
        },
        async ensureNotification() {
          return {
            notificationEventId: 50,
            reviewId: 30,
            eventType:
              'tax_source_change_review_opened' as const,
            deliveryStatus: 'pending' as const,
            wasCreated: true,
          };
        },
      },
    );

  assert.deepEqual(calls, [
    'ingest',
    'discover:2',
    'review:2',
  ]);
  assert.equal(result.wasInserted, true);
  assert.equal(result.review?.reviewId, 30);
  assert.equal(
    result.impact,
    impact,
  );
  assert.equal(
    result.notification?.notificationEventId,
    50,
  );
  assert.equal(
    result.notificationError,
    null,
  );
});

test('既存版でも未作成レビューを回復できる', async () => {
  const result =
    await runScheduledEgovMonitoring(
      supabase,
      {
        async ingestCurrent() {
          return ingestionFixture(false, 1);
        },
        async discoverImpact() {
          return impactFixture(1);
        },
        async ensureReview() {
          return {
            reviewId: 30,
            taxSourceVersionId: 2,
            status: 'open',
            wasCreated: false,
          };
        },
        async ensureNotification() {
          return {
            notificationEventId: 50,
            reviewId: 30,
            eventType:
              'tax_source_change_review_opened' as const,
            deliveryStatus: 'pending' as const,
            wasCreated: true,
          };
        },
      },
    );

  assert.equal(result.wasInserted, false);
  assert.equal(
    result.review?.wasCreated,
    false,
  );
  assert.equal(
    result.notification?.wasCreated,
    true,
  );
});

test('初回SourceVersionではレビューを作成しない', async () => {
  let ensureWasCalled = false;

  const result =
    await runScheduledEgovMonitoring(
      supabase,
      {
        async ingestCurrent() {
          return ingestionFixture(true, null);
        },
        async discoverImpact() {
          return impactFixture(null);
        },
        async ensureReview() {
          ensureWasCalled = true;
          throw new Error('呼ばれない');
        },
        async ensureNotification() {
          return {
            notificationEventId: 50,
            reviewId: 30,
            eventType:
              'tax_source_change_review_opened' as const,
            deliveryStatus: 'pending' as const,
            wasCreated: true,
          };
        },
      },
    );

  assert.equal(result.review, null);
  assert.equal(ensureWasCalled, false);
  assert.equal(result.notification, null);
  assert.equal(result.notificationError, null);
});

test('取り込み失敗を呼び出し元へ伝播する', async () => {
  await assert.rejects(
    () =>
      runScheduledEgovMonitoring(
        supabase,
        {
          async ingestCurrent() {
            throw new Error(
              'e-Gov unavailable',
            );
          },
          async discoverImpact() {
            throw new Error('呼ばれない');
          },
          async ensureReview() {
            throw new Error('呼ばれない');
          },
        },
      ),
    /e-Gov unavailable/,
  );
});

test('通知イベント保存失敗でも監視結果を返して次回回復可能にする', async () => {
  const result =
    await runScheduledEgovMonitoring(
      supabase,
      {
        async ingestCurrent() {
          return ingestionFixture(true, 1);
        },
        async discoverImpact() {
          return impactFixture(1);
        },
        async ensureReview() {
          return {
            reviewId: 30,
            taxSourceVersionId: 2,
            status: 'open',
            wasCreated: true,
          };
        },
        async ensureNotification() {
          throw new Error(
            'notification unavailable',
          );
        },
      },
    );

  assert.equal(result.review?.reviewId, 30);
  assert.equal(result.notification, null);
  assert.match(
    result.notificationError ?? '',
    /notification unavailable/,
  );
});

test('既存レビューでも通知イベント作成を再試行する', async () => {
  let receivedReviewId: number | null = null;

  const result =
    await runScheduledEgovMonitoring(
      supabase,
      {
        async ingestCurrent() {
          return ingestionFixture(false, 1);
        },
        async discoverImpact() {
          return impactFixture(1);
        },
        async ensureReview() {
          return {
            reviewId: 30,
            taxSourceVersionId: 2,
            status: 'open',
            wasCreated: false,
          };
        },
        async ensureNotification(
          _supabase,
          reviewId,
        ) {
          receivedReviewId = reviewId;

          return {
            notificationEventId: 50,
            reviewId,
            eventType:
              'tax_source_change_review_opened',
            deliveryStatus: 'pending',
            wasCreated: false,
          };
        },
      },
    );

  assert.equal(receivedReviewId, 30);
  assert.equal(
    result.notification?.notificationEventId,
    50,
  );
  assert.equal(
    result.notification?.wasCreated,
    false,
  );
});
