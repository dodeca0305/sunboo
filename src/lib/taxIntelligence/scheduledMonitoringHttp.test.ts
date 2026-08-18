import test from 'node:test';
import assert from 'node:assert/strict';

import {
  handleScheduledMonitoringRequest,
} from './scheduledMonitoringHttp.ts';

type HandlerDependencies =
  Parameters<
    typeof handleScheduledMonitoringRequest
  >[1];

const fakeSupabase =
  {} as ReturnType<
    HandlerDependencies['createSupabase']
  >;

function successResult() {
  return {
    revisionId:
      '340AC0000000034_revision-2',
    contentHash: 'hash-2',
    taxSourceVersionId: 2,
    supersedesVersionId: 1,
    wasInserted: true,
    impact: {
      sourceVersionId: 2,
      supersedesSourceVersionId: 1,
      ruleCandidates: [
        {
          id: 10,
          ruleCode: 'RULE_A',
          versionNo: 1,
          status: 'approved' as const,
        },
      ],
      controlCandidates: [],
    },
    review: {
      reviewId: 30,
      taxSourceVersionId: 2,
      status: 'open' as const,
      wasCreated: true,
    },
  };
}

function request(
  authorization?: string,
): Request {
  return new Request(
    'https://example.test/api/cron/tax-intelligence',
    {
      headers: authorization
        ? { authorization }
        : undefined,
    },
  );
}

test('CRON_SECRET未設定なら503を返す', async () => {
  const response =
    await handleScheduledMonitoringRequest(
      request(),
      {
        cronSecret: undefined,
        createSupabase() {
          throw new Error('呼ばれない');
        },
        async runMonitoring() {
          throw new Error('呼ばれない');
        },
      },
    );

  assert.equal(response.status, 503);
  assert.equal(
    response.headers.get('cache-control'),
    'no-store',
  );
});

test('Authorization不一致なら401で拒否する', async () => {
  let createWasCalled = false;

  const response =
    await handleScheduledMonitoringRequest(
      request('Bearer wrong-secret'),
      {
        cronSecret: 'correct-secret',
        createSupabase() {
          createWasCalled = true;
          return fakeSupabase;
        },
        async runMonitoring() {
          throw new Error('呼ばれない');
        },
      },
    );

  assert.equal(response.status, 401);
  assert.equal(createWasCalled, false);
});

test('正しいBearer認証で監視結果を返す', async () => {
  const response =
    await handleScheduledMonitoringRequest(
      request('Bearer correct-secret'),
      {
        cronSecret: 'correct-secret',
        createSupabase() {
          return fakeSupabase;
        },
        async runMonitoring() {
          return successResult();
        },
      },
    );

  assert.equal(response.status, 200);

  const body =
    await response.json();

  assert.deepEqual(body, {
    ok: true,
    outcome: 'inserted',
    revisionId:
      '340AC0000000034_revision-2',
    contentHash: 'hash-2',
    taxSourceVersionId: 2,
    supersedesVersionId: 1,
    impact: {
      ruleCandidateCount: 1,
      controlCandidateCount: 0,
    },
    review: {
      reviewId: 30,
      status: 'open',
      wasCreated: true,
    },
  });
});

test('監視処理失敗時は詳細を公開せず500を返す', async () => {
  const originalConsoleError =
    console.error;
  const errors: unknown[][] = [];
  console.error = (...values: unknown[]) => {
    errors.push(values);
  };

  try {
    const response =
      await handleScheduledMonitoringRequest(
        request('Bearer correct-secret'),
        {
          cronSecret: 'correct-secret',
          createSupabase() {
            return fakeSupabase;
          },
          async runMonitoring() {
            throw new Error(
              'database secret detail',
            );
          },
        },
      );

    assert.equal(response.status, 500);
    assert.deepEqual(
      await response.json(),
      {
        ok: false,
        error:
          'Scheduled e-Gov monitoring failed.',
      },
    );
    assert.equal(errors.length, 1);
  } finally {
    console.error =
      originalConsoleError;
  }
});
