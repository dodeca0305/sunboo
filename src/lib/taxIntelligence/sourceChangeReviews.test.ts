import test from 'node:test';
import assert from 'node:assert/strict';

import type {
  TaxSourceVersionImpact,
} from './impactDiscovery.ts';
import {
  closeTaxSourceChangeReview,
  ensureTaxSourceChangeReview,
  loadTaxSourceChangeReviewItems,
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

type ReviewListTables = {
  tax_source_change_reviews: Record<string, unknown>[];
  tax_source_versions: Record<string, unknown>[];
  tax_sources: Record<string, unknown>[];
};

function createReviewListFixture(
  tables: ReviewListTables,
): Parameters<
  typeof loadTaxSourceChangeReviewItems
>[0] {
  return {
    from(tableName: keyof ReviewListTables) {
      return {
        select() {
          if (
            tableName
            === 'tax_source_change_reviews'
          ) {
            return {
              async order() {
                return {
                  data:
                    tables.tax_source_change_reviews,
                  error: null,
                };
              },
            };
          }

          return {
            async in(
              column: string,
              values: unknown[],
            ) {
              return {
                data: tables[tableName].filter(
                  (row) =>
                    values.includes(row[column]),
                ),
                error: null,
              };
            },
          };
        },
      };
    },
  } as unknown as Parameters<
    typeof loadTaxSourceChangeReviewItems
  >[0];
}

function reviewListTables():
  ReviewListTables {
  const openImpact = impactFixture();
  const resolvedImpact = {
    ...impactFixture(),
    sourceVersionId: 3,
    supersedesSourceVersionId: 2,
  };

  return {
    tax_source_change_reviews: [
      {
        id: 31,
        tax_source_version_id: 3,
        tax_source_id: 40,
        supersedes_source_version_id: 2,
        status: 'resolved',
        impact_snapshot: resolvedImpact,
        detected_at:
          '2026-08-16T03:00:00.000Z',
        resolution_summary: '影響なしを確認',
        resolved_by: 'admin@example.test',
        resolved_at:
          '2026-08-16T04:00:00.000Z',
        created_at:
          '2026-08-16T03:00:00.000Z',
        updated_at:
          '2026-08-16T04:00:00.000Z',
      },
      {
        id: 30,
        tax_source_version_id: 2,
        tax_source_id: 40,
        supersedes_source_version_id: 1,
        status: 'open',
        impact_snapshot: openImpact,
        detected_at:
          '2026-08-15T03:00:00.000Z',
        resolution_summary: null,
        resolved_by: null,
        resolved_at: null,
        created_at:
          '2026-08-15T03:00:00.000Z',
        updated_at:
          '2026-08-15T03:00:00.000Z',
      },
    ],
    tax_source_versions: [
      {
        id: 1,
        tax_source_id: 40,
        version_label: 'revision-1',
        content_hash: 'hash-1',
        normalized_text: '[Article Num="74"]\n第七十四条 旧本文',
        published_at: '2026-07-01',
        effective_from: '2026-07-01',
        observed_at:
          '2026-07-01T00:00:00.000Z',
        retrieved_at:
          '2026-07-01T00:01:00.000Z',
      },
      {
        id: 2,
        tax_source_id: 40,
        version_label: 'revision-2',
        content_hash: 'hash-2',
        normalized_text: '[Article Num="74"]\n第七十四条 新本文',
        published_at: '2026-08-01',
        effective_from: '2026-08-01',
        observed_at:
          '2026-08-01T00:00:00.000Z',
        retrieved_at:
          '2026-08-01T00:01:00.000Z',
      },
      {
        id: 3,
        tax_source_id: 40,
        version_label: 'revision-3',
        content_hash: 'hash-3',
        normalized_text: '[Article Num="74"]\n第七十四条 最新本文',
        published_at: '2026-08-16',
        effective_from: '2026-08-16',
        observed_at:
          '2026-08-16T00:00:00.000Z',
        retrieved_at:
          '2026-08-16T00:01:00.000Z',
      },
    ],
    tax_sources: [
      {
        id: 40,
        provider: 'e_gov',
        source_type: 'law',
        tax_type: 'corporate_tax',
        title: '法人税法 第74条〜第75条の3',
        canonical_locator:
          'egov:law:340AC0000000034:articles-74-75-3',
      },
    ],
  };
}

test('保存済み変更レビューへSource情報を結合する', async () => {
  const items =
    await loadTaxSourceChangeReviewItems(
      createReviewListFixture(
        reviewListTables(),
      ),
    );

  assert.equal(items.length, 2);

  const openItem = items[0];

  assert.equal(openItem.reviewId, 30);
  assert.equal(openItem.status, 'open');
  assert.equal(openItem.provider, 'e_gov');
  assert.equal(
    openItem.sourceTitle,
    '法人税法 第74条〜第75条の3',
  );
  assert.equal(openItem.versionLabel, 'revision-2');
  assert.equal(
    openItem.supersedesVersionLabel,
    'revision-1',
  );
  assert.equal(openItem.contentHash, 'hash-2');
  assert.deepEqual(
    openItem.impact,
    impactFixture(),
  );
  assert.equal(
    openItem.sourceDiff.hasChanges,
    true,
  );
  assert.equal(
    openItem.sourceDiff.changedCount,
    1,
  );
  assert.deepEqual(
    openItem.sourceDiff.articles[0],
    {
      articleNumber: '74',
      status: 'changed',
      beforeText: '第七十四条 旧本文',
      afterText: '第七十四条 新本文',
    },
  );
});

test('openを終了済みレビューより先に並べる', async () => {
  const items =
    await loadTaxSourceChangeReviewItems(
      createReviewListFixture(
        reviewListTables(),
      ),
    );

  assert.deepEqual(
    items.map((item) => item.status),
    ['open', 'resolved'],
  );
});

test('provenanceと一致しない影響snapshotを拒否する', async () => {
  const tables = reviewListTables();

  tables.tax_source_change_reviews[1] = {
    ...tables.tax_source_change_reviews[1],
    impact_snapshot: {
      ...impactFixture(),
      sourceVersionId: 999,
    },
  };

  await assert.rejects(
    () =>
      loadTaxSourceChangeReviewItems(
        createReviewListFixture(tables),
      ),
    /影響snapshotがprovenanceと一致しません/,
  );
});

test('判断内容を正規化してopenレビューを終了する', async () => {
  const calls: Array<{
    kind: string;
    value: unknown;
  }> = [];

  const singleResult = {
    data: {
      id: 30,
      status: 'resolved',
      resolution_summary: '影響なしを確認',
      resolved_by: 'admin@example.test',
      resolved_at:
        '2026-08-16T05:00:00.000Z',
      updated_at:
        '2026-08-16T05:00:00.000Z',
    },
    error: null,
  };

  const query = {
    eq(column: string, value: unknown) {
      calls.push({
        kind: `eq:${column}`,
        value,
      });
      return query;
    },
    select(value: string) {
      calls.push({
        kind: 'select',
        value,
      });

      return {
        async single() {
          return singleResult;
        },
      };
    },
  };

  const supabase = {
    from(tableName: string) {
      calls.push({
        kind: 'from',
        value: tableName,
      });

      return {
        update(payload: unknown) {
          calls.push({
            kind: 'update',
            value: payload,
          });
          return query;
        },
      };
    },
  } as unknown as Parameters<
    typeof closeTaxSourceChangeReview
  >[0];

  const result =
    await closeTaxSourceChangeReview(
      supabase,
      {
        reviewId: 30,
        status: 'resolved',
        resolutionSummary:
          '  影響なしを確認  ',
      },
    );

  assert.deepEqual(calls[1], {
    kind: 'update',
    value: {
      status: 'resolved',
      resolution_summary: '影響なしを確認',
    },
  });
  assert.deepEqual(calls.slice(2, 4), [
    {
      kind: 'eq:id',
      value: 30,
    },
    {
      kind: 'eq:status',
      value: 'open',
    },
  ]);

  assert.deepEqual(result, {
    reviewId: 30,
    status: 'resolved',
    resolutionSummary: '影響なしを確認',
    resolvedBy: 'admin@example.test',
    resolvedAt:
      '2026-08-16T05:00:00.000Z',
    updatedAt:
      '2026-08-16T05:00:00.000Z',
  });
});

test('判断内容が空ならDB更新前に拒否する', async () => {
  let fromWasCalled = false;

  const supabase = {
    from() {
      fromWasCalled = true;
      throw new Error('呼ばれない');
    },
  } as unknown as Parameters<
    typeof closeTaxSourceChangeReview
  >[0];

  await assert.rejects(
    () =>
      closeTaxSourceChangeReview(
        supabase,
        {
          reviewId: 30,
          status: 'dismissed',
          resolutionSummary: '   ',
        },
      ),
    /判断内容を入力してください/,
  );

  assert.equal(fromWasCalled, false);
});
