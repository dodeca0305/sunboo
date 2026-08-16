import test from 'node:test';
import assert from 'node:assert/strict';

import type {
  TaxSourceVersionImpact,
} from './impactDiscovery.ts';
import {
  ensureTaxSourceChangeReview,
} from './sourceChangeReviews.ts';

type RpcCall = {
  name: string;
  args: Record<string, unknown>;
};

function impactFixture():
  TaxSourceVersionImpact {
  return {
    sourceVersionId: 2,
    supersedesSourceVersionId: 1,
    ruleCandidates: [
      {
        id: 10,
        ruleCode: 'RULE_A',
        versionNo: 1,
        status: 'approved',
      },
    ],
    controlCandidates: [
      {
        id: 20,
        controlCode: 'CONTROL_A',
        versionNo: 1,
        status: 'approved',
        isEnabled: true,
        evaluatorKey: 'evaluator/a',
        impactedRuleIds: [10],
      },
    ],
  };
}

function createRpcFixture(
  result: {
    data: unknown;
    error: { message: string } | null;
  },
  calls: RpcCall[],
): Parameters<
  typeof ensureTaxSourceChangeReview
>[0] {
  return {
    async rpc(
      name: string,
      args: Record<string, unknown>,
    ) {
      calls.push({ name, args });
      return result;
    },
  } as unknown as Parameters<
    typeof ensureTaxSourceChangeReview
  >[0];
}

test('影響snapshotを冪等作成RPCへ渡す', async () => {
  const calls: RpcCall[] = [];
  const impact = impactFixture();

  const result = await ensureTaxSourceChangeReview(
    createRpcFixture(
      {
        data: [
          {
            review_id: 30,
            tax_source_version_id: 2,
            status: 'open',
            was_created: true,
          },
        ],
        error: null,
      },
      calls,
    ),
    impact,
  );

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].name,
    'ensure_tax_source_change_review',
  );
  assert.deepEqual(calls[0].args, {
    p_tax_source_version_id: 2,
    p_impact_snapshot: {
      sourceVersionId: 2,
      supersedesSourceVersionId: 1,
      ruleCandidates: impact.ruleCandidates,
      controlCandidates:
        impact.controlCandidates,
    },
  });

  assert.deepEqual(result, {
    reviewId: 30,
    taxSourceVersionId: 2,
    status: 'open',
    wasCreated: true,
  });
});

test('既存レビューの参照を保持する', async () => {
  const result = await ensureTaxSourceChangeReview(
    createRpcFixture(
      {
        data: [
          {
            review_id: 30,
            tax_source_version_id: 2,
            status: 'resolved',
            was_created: false,
          },
        ],
        error: null,
      },
      [],
    ),
    impactFixture(),
  );

  assert.equal(result.wasCreated, false);
  assert.equal(result.status, 'resolved');
});

test('初回SourceVersionにはレビューを作成しない', async () => {
  const calls: RpcCall[] = [];

  await assert.rejects(
    () =>
      ensureTaxSourceChangeReview(
        createRpcFixture(
          {
            data: [],
            error: null,
          },
          calls,
        ),
        {
          ...impactFixture(),
          sourceVersionId: 1,
          supersedesSourceVersionId: null,
        },
      ),
    /初回TaxSourceVersion 1/,
  );

  assert.equal(calls.length, 0);
});

test('RPCエラーを通知する', async () => {
  await assert.rejects(
    () =>
      ensureTaxSourceChangeReview(
        createRpcFixture(
          {
            data: null,
            error: {
              message: 'permission denied',
            },
          },
          [],
        ),
        impactFixture(),
      ),
    /保存に失敗しました: permission denied/,
  );
});
