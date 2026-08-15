import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeTaxSourceText,
  prepareTaxSourceContent,
} from './sourceVersionIngestion.ts';

test('改行・行末空白・末尾改行を決定的に正規化する', () => {
  assert.equal(
    normalizeTaxSourceText(
      'first  \r\nsecond\t\rthird\n\n\n',
    ),
    'first\nsecond\nthird',
  );
});

test('行頭空白・文章内の連続空白・空行は保持する', () => {
  assert.equal(
    normalizeTaxSourceText(
      '  first  value\n\nsecond value',
    ),
    '  first  value\n\nsecond value',
  );
});

test('UnicodeをNFCへ統一する', () => {
  const decomposed = 'ポイント';
  const composed = 'ポイント';

  assert.equal(
    prepareTaxSourceContent(decomposed).contentHash,
    prepareTaxSourceContent(composed).contentHash,
  );
});

test('正規化後に空となる入力は拒否する', () => {
  assert.throws(
    () => normalizeTaxSourceText(' \t\r\n\t'),
    /空にはできません/,
  );
});

test('同じ正規化結果から同じSHA-256を生成する', () => {
  const first = prepareTaxSourceContent(
    'source=C1-1\r\ntopic=corporate-tax-filing  ',
  );
  const second = prepareTaxSourceContent(
    'source=C1-1\ntopic=corporate-tax-filing\n\n',
  );

  assert.equal(first.normalizedText, second.normalizedText);
  assert.equal(first.contentHash, second.contentHash);
  assert.match(first.contentHash, /^[a-f0-9]{64}$/);
});

test('既存NTA seedと同じcontent_hashを生成する', () => {
  const content = prepareTaxSourceContent(
    [
      'source=C1-1',
      'topic=corporate-tax-filing',
      'general_due_rule=business-year-end-next-day+2-months',
      'extension_rule=use-extended-deadline-if-approved',
      'holiday_rule=next-day-when-deadline-falls-on-weekend-or-national-holiday',
    ].join('\n'),
  );

  assert.equal(
    content.contentHash,
    'bb1824ef6cb588a16f2cf2047c021f79ea5dce8136d94f52397a18d744053cc5',
  );
});

import {
  ingestTaxSourceVersion,
  type TaxSourceVersionIngestionInput,
} from './sourceVersionIngestion.ts';

type RpcFixtureResult = {
  data: unknown;
  error: { message: string } | null;
};

function createRpcFixture(
  result: RpcFixtureResult,
  calls: Array<{
    functionName: string;
    parameters: Record<string, unknown>;
  }>,
): Parameters<typeof ingestTaxSourceVersion>[0] {
  return {
    async rpc(
      functionName: string,
      parameters: Record<string, unknown>,
    ) {
      calls.push({ functionName, parameters });
      return result;
    },
  } as unknown as Parameters<
    typeof ingestTaxSourceVersion
  >[0];
}

function validIngestionInput():
  TaxSourceVersionIngestionInput {
  return {
    provider: 'nta',
    canonicalLocator: 'https://example.test/source',
    versionLabel: 'v2',
    rawText: 'first  \r\nsecond\n\n',
    publishedAt: '2026-08-15',
    effectiveFrom: '2026-04-01',
    effectiveTo: null,
    observedAt: '2026-08-15T01:00:00.000Z',
    retrievedAt: '2026-08-15T02:00:00.000Z',
    rawReference: 'https://example.test/raw',
  };
}

test('正規化済み本文とhashをRPCへ渡す', async () => {
  const calls: Array<{
    functionName: string;
    parameters: Record<string, unknown>;
  }> = [];

  const expected =
    prepareTaxSourceContent('first  \r\nsecond\n\n');

  const result = await ingestTaxSourceVersion(
    createRpcFixture(
      {
        data: [
          {
            tax_source_version_id: 12,
            tax_source_id: 3,
            content_hash: expected.contentHash,
            supersedes_version_id: 11,
            was_inserted: true,
          },
        ],
        error: null,
      },
      calls,
    ),
    validIngestionInput(),
  );

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].functionName,
    'ingest_tax_source_version',
  );
  assert.equal(
    calls[0].parameters.p_normalized_text,
    'first\nsecond',
  );
  assert.equal(
    calls[0].parameters.p_content_hash,
    expected.contentHash,
  );
  assert.equal(
    calls[0].parameters.p_observed_at,
    '2026-08-15T01:00:00.000Z',
  );

  assert.deepEqual(result, {
    taxSourceVersionId: 12,
    taxSourceId: 3,
    contentHash: expected.contentHash,
    supersedesVersionId: 11,
    wasInserted: true,
  });
});

test('既存versionが返された場合はwasInserted=falseを保持する', async () => {
  const expected =
    prepareTaxSourceContent('first  \r\nsecond\n\n');

  const result = await ingestTaxSourceVersion(
    createRpcFixture(
      {
        data: [
          {
            tax_source_version_id: 11,
            tax_source_id: 3,
            content_hash: expected.contentHash,
            supersedes_version_id: 10,
            was_inserted: false,
          },
        ],
        error: null,
      },
      [],
    ),
    validIngestionInput(),
  );

  assert.equal(result.wasInserted, false);
  assert.equal(result.taxSourceVersionId, 11);
});

test('RPCエラーを取り込みエラーとして通知する', async () => {
  await assert.rejects(
    () =>
      ingestTaxSourceVersion(
        createRpcFixture(
          {
            data: null,
            error: {
              message: 'permission denied',
            },
          },
          [],
        ),
        validIngestionInput(),
      ),
    /取り込みに失敗しました: permission denied/,
  );
});

test('RPC結果が空なら拒否する', async () => {
  await assert.rejects(
    () =>
      ingestTaxSourceVersion(
        createRpcFixture(
          {
            data: [],
            error: null,
          },
          [],
        ),
        validIngestionInput(),
      ),
    /取り込み結果が不正です: 0件/,
  );
});

test('不正な日時はRPC呼び出し前に拒否する', async () => {
  const calls: Array<{
    functionName: string;
    parameters: Record<string, unknown>;
  }> = [];

  await assert.rejects(
    () =>
      ingestTaxSourceVersion(
        createRpcFixture(
          {
            data: [],
            error: null,
          },
          calls,
        ),
        {
          ...validIngestionInput(),
          observedAt: 'not-a-date',
        },
      ),
    /observedAtが有効な日時ではありません/,
  );

  assert.equal(calls.length, 0);
});
