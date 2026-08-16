import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseEgovCorporateTaxSource,
} from './egovConnector.ts';

const LAW_ID = '340AC0000000034';
const REVISION_ID =
  '340AC0000000034_20260812_508AC0000000064';

function article(
  number: string,
  title: string,
  body: string,
): string {
  return `
    <Article Num="${number}">
      <ArticleCaption>（見出し${number}）</ArticleCaption>
      <ArticleTitle>${title}</ArticleTitle>
      <Paragraph Num="1">
        <ParagraphNum/>
        <ParagraphSentence>
          <Sentence Num="1">${body}</Sentence>
        </ParagraphSentence>
      </Paragraph>
    </Article>
  `;
}

function fixtureXml(): string {
  return `
    <law_data_response>
      <law_info>
        <law_id>${LAW_ID}</law_id>
      </law_info>
      <revision_info>
        <law_revision_id>${REVISION_ID}</law_revision_id>
        <law_title>法人税法</law_title>
        <amendment_enforcement_date>2026-08-12</amendment_enforcement_date>
      </revision_info>
      <law_full_text>
        <Law>
          <LawBody>
            <MainProvision>
              <Part Num="2">
                ${article('74', '第七十四条', '本文74')}
                ${article('75', '第七十五条', '本文75')}
                ${article('75_2', '第七十五条の二', '本文75の2')}
                ${article('75_3', '第七十五条の三', '本文75の3')}
              </Part>
            </MainProvision>
            <SupplProvision>
              ${article('74', '附則第七十四条', '対象外')}
            </SupplProvision>
          </LawBody>
        </Law>
      </law_full_text>
    </law_data_response>
  `;
}

test('本則の対象4条だけを抽出する', () => {
  const result = parseEgovCorporateTaxSource(
    fixtureXml(),
    {
      expectedLawId: LAW_ID,
      expectedRevisionId: REVISION_ID,
    },
  );

  assert.equal(result.lawId, LAW_ID);
  assert.equal(result.revisionId, REVISION_ID);
  assert.equal(result.lawTitle, '法人税法');
  assert.equal(
    result.amendmentEnforcementDate,
    '2026-08-12',
  );
  assert.match(
    result.normalizedText,
    /\[Article Num="74"\]\n（見出し74） 第七十四条 本文74/,
  );
  assert.doesNotMatch(result.normalizedText, /対象外/);
  assert.match(result.contentHash, /^[a-f0-9]{64}$/);
});

test('law_idが期待値と違えば拒否する', () => {
  assert.throws(
    () =>
      parseEgovCorporateTaxSource(fixtureXml(), {
        expectedLawId: 'different',
        expectedRevisionId: REVISION_ID,
      }),
    /law_idが一致しません/,
  );
});

test('対象Articleが不足していれば拒否する', () => {
  const xml = fixtureXml().replace(
    article('75_3', '第七十五条の三', '本文75の3'),
    '',
  );

  assert.throws(
    () =>
      parseEgovCorporateTaxSource(xml, {
        expectedLawId: LAW_ID,
        expectedRevisionId: REVISION_ID,
      }),
    /Article 75_3は1件必要です: 0件/,
  );
});

import {
  fetchEgovCorporateTaxSource,
  ingestEgovCorporateTaxSource,
} from './egovConnector.ts';

test('指定した改正IDをe-Gov APIから取得する', async () => {
  const requestedUrls: string[] = [];

  const source = await fetchEgovCorporateTaxSource({
    revisionId: REVISION_ID,
    fetchImpl: (async (input) => {
      requestedUrls.push(String(input));

      return new Response(fixtureXml(), {
        status: 200,
        headers: {
          'content-type': 'application/xml',
        },
      });
    }) as typeof fetch,
  });

  assert.equal(requestedUrls.length, 1);
  assert.equal(
    requestedUrls[0],
    `https://laws.e-gov.go.jp/api/2/law_data/${REVISION_ID}?law_full_text_format=xml&response_format=xml`,
  );
  assert.equal(source.revisionId, REVISION_ID);
});

test('e-Gov APIのHTTPエラーを通知する', async () => {
  await assert.rejects(
    () =>
      fetchEgovCorporateTaxSource({
        revisionId: REVISION_ID,
        fetchImpl: (async () =>
          new Response('not found', {
            status: 404,
          })) as typeof fetch,
      }),
    /取得に失敗しました: HTTP 404/,
  );
});

test('取得したSourceを既存の原子的取り込みへ渡す', async () => {
  const rpcCalls: Array<{
    functionName: string;
    parameters: Record<string, unknown>;
  }> = [];

  const parsed = parseEgovCorporateTaxSource(
    fixtureXml(),
    {
      expectedLawId: LAW_ID,
      expectedRevisionId: REVISION_ID,
    },
  );

  const supabase = {
    async rpc(
      functionName: string,
      parameters: Record<string, unknown>,
    ) {
      rpcCalls.push({ functionName, parameters });

      return {
        data: [
          {
            tax_source_version_id: 2,
            tax_source_id: 1,
            content_hash: parsed.contentHash,
            supersedes_version_id: 1,
            was_inserted: true,
          },
        ],
        error: null,
      };
    },
  } as unknown as Parameters<
    typeof ingestEgovCorporateTaxSource
  >[0];

  const result =
    await ingestEgovCorporateTaxSource(
      supabase,
      {
        revisionId: REVISION_ID,
        observedAt:
          '2026-08-16T01:00:00.000Z',
        retrievedAt:
          '2026-08-16T01:01:00.000Z',
        fetchImpl: (async () =>
          new Response(fixtureXml(), {
            status: 200,
          })) as typeof fetch,
      },
    );

  assert.equal(rpcCalls.length, 1);
  assert.equal(
    rpcCalls[0].functionName,
    'ingest_tax_source_version',
  );
  assert.equal(
    rpcCalls[0].parameters.p_provider,
    'e_gov',
  );
  assert.equal(
    rpcCalls[0].parameters.p_canonical_locator,
    'egov:law:340AC0000000034:articles-74-75-3',
  );
  assert.equal(
    rpcCalls[0].parameters.p_version_label,
    REVISION_ID,
  );
  assert.equal(
    rpcCalls[0].parameters.p_effective_from,
    '2026-08-12',
  );
  assert.equal(
    rpcCalls[0].parameters.p_content_hash,
    parsed.contentHash,
  );
  assert.equal(result.ingestion.wasInserted, true);
});

import {
  fetchCurrentEgovCorporateTaxSource,
  ingestCurrentEgovCorporateTaxSource,
} from './egovConnector.ts';

test('法令IDだけで現在の改正Versionを発見する', async () => {
  const requestedUrls: string[] = [];

  const source =
    await fetchCurrentEgovCorporateTaxSource({
      fetchImpl: (async (input) => {
        requestedUrls.push(String(input));

        return new Response(fixtureXml(), {
          status: 200,
        });
      }) as typeof fetch,
    });

  assert.deepEqual(requestedUrls, [
    'https://laws.e-gov.go.jp/api/2/law_data/340AC0000000034?law_full_text_format=xml&response_format=xml',
  ]);
  assert.equal(source.revisionId, REVISION_ID);
});

test('現在Versionを発見して原子的取り込みへ渡す', async () => {
  const parsed = parseEgovCorporateTaxSource(
    fixtureXml(),
    {
      expectedLawId: LAW_ID,
      expectedRevisionId: REVISION_ID,
    },
  );
  const rpcCalls: Record<string, unknown>[] = [];

  const supabase = {
    async rpc(
      _functionName: string,
      parameters: Record<string, unknown>,
    ) {
      rpcCalls.push(parameters);

      return {
        data: [
          {
            tax_source_version_id: 1,
            tax_source_id: 1,
            content_hash: parsed.contentHash,
            supersedes_version_id: null,
            was_inserted: false,
          },
        ],
        error: null,
      };
    },
  } as unknown as Parameters<
    typeof ingestCurrentEgovCorporateTaxSource
  >[0];

  const result =
    await ingestCurrentEgovCorporateTaxSource(
      supabase,
      {
        observedAt:
          '2026-08-16T02:00:00.000Z',
        retrievedAt:
          '2026-08-16T02:01:00.000Z',
        fetchImpl: (async () =>
          new Response(fixtureXml(), {
            status: 200,
          })) as typeof fetch,
      },
    );

  assert.equal(rpcCalls.length, 1);
  assert.equal(
    rpcCalls[0].p_version_label,
    REVISION_ID,
  );
  assert.equal(result.ingestion.wasInserted, false);
});
