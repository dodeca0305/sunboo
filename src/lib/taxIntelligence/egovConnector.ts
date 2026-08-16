import { XMLParser } from 'fast-xml-parser';

import {
  prepareTaxSourceContent,
} from './sourceVersionIngestion.ts';

const TARGET_ARTICLE_NUMBERS = [
  '74',
  '75',
  '75_2',
  '75_3',
] as const;

type XmlValue =
  | string
  | XmlValue[]
  | { [key: string]: XmlValue };

type XmlRecord = Record<string, XmlValue>;

export type EgovCorporateTaxSource = {
  lawId: string;
  revisionId: string;
  lawTitle: string;
  amendmentEnforcementDate: string | null;
  rawReference: string;
  normalizedText: string;
  contentHash: string;
};

export type ParseEgovCorporateTaxSourceOptions = {
  expectedLawId: string;
  expectedRevisionId: string;
};

function isRecord(value: unknown): value is XmlRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function records(value: XmlValue | undefined): XmlRecord[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }

  return isRecord(value) ? [value] : [];
}

function scalarText(
  value: XmlValue | undefined,
): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value
      .map(scalarText)
      .filter(Boolean)
      .join('');
  }

  if (!isRecord(value)) {
    return '';
  }

  return Object.entries(value)
    .filter(([key]) => key !== '@attributes')
    .map(([, child]) => scalarText(child))
    .filter(Boolean)
    .join('');
}

function sentenceTexts(
  container: XmlValue | undefined,
): string[] {
  const result: string[] = [];

  function visit(value: XmlValue | undefined): void {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    if (!isRecord(value)) {
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      if (key === 'Sentence') {
        const values = Array.isArray(child)
          ? child
          : [child];

        for (const sentence of values) {
          const text = scalarText(sentence);

          if (text) {
            result.push(text);
          }
        }
      } else if (key !== '@attributes') {
        visit(child);
      }
    }
  }

  visit(container);
  return result;
}

function renderEnumeratedNode(
  node: XmlRecord,
  titleKey: string,
  sentenceKey: string,
): string {
  const parts = [
    scalarText(node[titleKey]),
    ...sentenceTexts(node[sentenceKey]),
  ];

  for (const [key, child] of Object.entries(node)) {
    if (/^(Subitem\d+|Item)$/.test(key)) {
      for (const nested of records(child)) {
        const nestedPrefix =
          key === 'Item' ? 'Item' : key;

        parts.push(
          renderEnumeratedNode(
            nested,
            `${nestedPrefix}Title`,
            `${nestedPrefix}Sentence`,
          ),
        );
      }
    }
  }

  return parts.filter(Boolean).join(' ');
}

function renderParagraph(
  paragraph: XmlRecord,
): string {
  const parts = [
    scalarText(paragraph.ParagraphNum),
    ...sentenceTexts(paragraph.ParagraphSentence),
  ];

  for (const item of records(paragraph.Item)) {
    parts.push(
      renderEnumeratedNode(
        item,
        'ItemTitle',
        'ItemSentence',
      ),
    );
  }

  return parts.filter(Boolean).join(' ');
}

function renderArticle(article: XmlRecord): string {
  const parts = [
    scalarText(article.ArticleCaption),
    scalarText(article.ArticleTitle),
    ...records(article.Paragraph).map(
      renderParagraph,
    ),
  ];

  return parts.filter(Boolean).join(' ');
}

function collectTargetArticles(
  value: XmlValue,
  result: Map<string, XmlRecord[]>,
): void {
  if (Array.isArray(value)) {
    value.forEach((child) =>
      collectTargetArticles(child, result),
    );
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (key === 'Article') {
      for (const article of records(child)) {
        const attributes = article['@attributes'];
        const number = isRecord(attributes)
          ? scalarText(attributes.Num)
          : '';

        if (
          TARGET_ARTICLE_NUMBERS.includes(
            number as
              (typeof TARGET_ARTICLE_NUMBERS)[number],
          )
        ) {
          const matches = result.get(number) ?? [];
          matches.push(article);
          result.set(number, matches);
        }
      }
    } else if (key !== '@attributes') {
      collectTargetArticles(child, result);
    }
  }
}

function requiredRecord(
  value: unknown,
  label: string,
): XmlRecord {
  if (!isRecord(value)) {
    throw new Error(
      `e-Govレスポンスに${label}がありません。`,
    );
  }

  return value;
}

export function parseEgovCorporateTaxSource(
  xml: string,
  options: ParseEgovCorporateTaxSourceOptions,
): EgovCorporateTaxSource {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributesGroupName: '@attributes',
    attributeNamePrefix: '',
    parseTagValue: false,
    trimValues: true,
  });

  const parsed = requiredRecord(
    parser.parse(xml),
    'root',
  );
  const response = requiredRecord(
    parsed.law_data_response,
    'law_data_response',
  );
  const lawInfo = requiredRecord(
    response.law_info,
    'law_info',
  );
  const revisionInfo = requiredRecord(
    response.revision_info,
    'revision_info',
  );
  const lawFullText = requiredRecord(
    response.law_full_text,
    'law_full_text',
  );
  const law = requiredRecord(lawFullText.Law, 'Law');
  const lawBody = requiredRecord(
    law.LawBody,
    'LawBody',
  );
  const mainProvision = requiredRecord(
    lawBody.MainProvision,
    'MainProvision',
  );

  const lawId = scalarText(lawInfo.law_id);
  const revisionId = scalarText(
    revisionInfo.law_revision_id,
  );
  const lawTitle = scalarText(
    revisionInfo.law_title,
  );

  if (lawId !== options.expectedLawId) {
    throw new Error(
      `e-Gov law_idが一致しません: ${lawId}`,
    );
  }

  if (revisionId !== options.expectedRevisionId) {
    throw new Error(
      `e-Gov law_revision_idが一致しません: ${revisionId}`,
    );
  }

  if (lawTitle !== '法人税法') {
    throw new Error(
      `e-Gov法令タイトルが法人税法ではありません: ${lawTitle}`,
    );
  }

  const articles = new Map<string, XmlRecord[]>();

  collectTargetArticles(mainProvision, articles);

  const articleLines =
    TARGET_ARTICLE_NUMBERS.map((number) => {
      const matches = articles.get(number) ?? [];

      if (matches.length !== 1) {
        throw new Error(
          `本則Article ${number}は1件必要です: ${matches.length}件`,
        );
      }

      return [
        `[Article Num="${number}"]`,
        renderArticle(matches[0]),
      ].join('\n');
    });

  const rawText = [
    `law_id=${lawId}`,
    'scope=main-provision-articles-74-through-75-3',
    ...articleLines,
  ].join('\n');

  const { normalizedText, contentHash } =
    prepareTaxSourceContent(rawText);

  const rawReference =
    `https://laws.e-gov.go.jp/api/2/law_data/${revisionId}` +
    '?law_full_text_format=xml&response_format=xml';

  return {
    lawId,
    revisionId,
    lawTitle,
    amendmentEnforcementDate:
      scalarText(
        revisionInfo.amendment_enforcement_date,
      ) || null,
    rawReference,
    normalizedText,
    contentHash,
  };
}

import type { SupabaseClient } from '../supabase';
import {
  ingestTaxSourceVersion,
  type TaxSourceVersionIngestionResult,
} from './sourceVersionIngestion.ts';

const EGOV_LAW_DATA_BASE_URL =
  'https://laws.e-gov.go.jp/api/2/law_data';

export type EgovFetch = typeof fetch;

export type FetchEgovCorporateTaxSourceOptions = {
  revisionId: string;
  lawId?: string;
  fetchImpl?: EgovFetch;
};

export type IngestEgovCorporateTaxSourceOptions =
  FetchEgovCorporateTaxSourceOptions & {
    observedAt?: Date | string;
    retrievedAt?: Date | string;
  };

export type IngestEgovCorporateTaxSourceResult = {
  source: EgovCorporateTaxSource;
  ingestion: TaxSourceVersionIngestionResult;
};

export async function fetchEgovCorporateTaxSource(
  options: FetchEgovCorporateTaxSourceOptions,
): Promise<EgovCorporateTaxSource> {
  const lawId =
    options.lawId ?? '340AC0000000034';
  const revisionId = options.revisionId.trim();

  if (
    !/^[0-9A-Z]+_[0-9]{8}_[0-9A-Z]+$/.test(
      revisionId,
    )
  ) {
    throw new Error(
      `e-Gov改正IDの形式が不正です: ${revisionId}`,
    );
  }

  const url =
    `${EGOV_LAW_DATA_BASE_URL}/` +
    `${encodeURIComponent(revisionId)}` +
    '?law_full_text_format=xml&response_format=xml';

  const response = await (
    options.fetchImpl ?? globalThis.fetch
  )(url, {
    headers: {
      accept: 'application/xml, text/xml',
    },
  });

  if (!response.ok) {
    throw new Error(
      `e-Gov法令APIの取得に失敗しました: HTTP ${response.status}`,
    );
  }

  const xml = await response.text();

  if (xml.trim().length === 0) {
    throw new Error(
      'e-Gov法令APIから空のレスポンスが返されました。',
    );
  }

  return parseEgovCorporateTaxSource(xml, {
    expectedLawId: lawId,
    expectedRevisionId: revisionId,
  });
}

export async function ingestEgovCorporateTaxSource(
  supabase: SupabaseClient,
  options: IngestEgovCorporateTaxSourceOptions,
): Promise<IngestEgovCorporateTaxSourceResult> {
  const source =
    await fetchEgovCorporateTaxSource(options);

  const ingestion = await ingestTaxSourceVersion(
    supabase,
    {
      provider: 'e_gov',
      canonicalLocator:
        'egov:law:340AC0000000034:articles-74-75-3',
      versionLabel: source.revisionId,
      rawText: source.normalizedText,
      publishedAt: null,
      effectiveFrom:
        source.amendmentEnforcementDate,
      effectiveTo: null,
      observedAt: options.observedAt,
      retrievedAt: options.retrievedAt,
      rawReference: source.rawReference,
    },
  );

  return { source, ingestion };
}

export type FetchCurrentEgovCorporateTaxSourceOptions = {
  lawId?: string;
  fetchImpl?: EgovFetch;
};

export type IngestCurrentEgovCorporateTaxSourceOptions =
  FetchCurrentEgovCorporateTaxSourceOptions & {
    observedAt?: Date | string;
    retrievedAt?: Date | string;
  };

async function fetchEgovXml(
  locator: string,
  fetchImpl: EgovFetch,
): Promise<string> {
  const url =
    `${EGOV_LAW_DATA_BASE_URL}/` +
    `${encodeURIComponent(locator)}` +
    '?law_full_text_format=xml&response_format=xml';

  const response = await fetchImpl(url, {
    headers: {
      accept: 'application/xml, text/xml',
    },
  });

  if (!response.ok) {
    throw new Error(
      `e-Gov法令APIの取得に失敗しました: HTTP ${response.status}`,
    );
  }

  const xml = await response.text();

  if (xml.trim().length === 0) {
    throw new Error(
      'e-Gov法令APIから空のレスポンスが返されました。',
    );
  }

  return xml;
}

function readRevisionIdFromEgovXml(
  xml: string,
): string {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributesGroupName: '@attributes',
    attributeNamePrefix: '',
    parseTagValue: false,
    trimValues: true,
  });

  const parsed = requiredRecord(
    parser.parse(xml),
    'root',
  );
  const response = requiredRecord(
    parsed.law_data_response,
    'law_data_response',
  );
  const revisionInfo = requiredRecord(
    response.revision_info,
    'revision_info',
  );
  const revisionId = scalarText(
    revisionInfo.law_revision_id,
  );

  if (revisionId.length === 0) {
    throw new Error(
      'e-Govレスポンスにlaw_revision_idがありません。',
    );
  }

  return revisionId;
}

export async function fetchCurrentEgovCorporateTaxSource(
  options:
    FetchCurrentEgovCorporateTaxSourceOptions = {},
): Promise<EgovCorporateTaxSource> {
  const lawId =
    options.lawId ?? '340AC0000000034';
  const xml = await fetchEgovXml(
    lawId,
    options.fetchImpl ?? globalThis.fetch,
  );
  const revisionId =
    readRevisionIdFromEgovXml(xml);

  return parseEgovCorporateTaxSource(xml, {
    expectedLawId: lawId,
    expectedRevisionId: revisionId,
  });
}

export async function ingestCurrentEgovCorporateTaxSource(
  supabase: SupabaseClient,
  options:
    IngestCurrentEgovCorporateTaxSourceOptions = {},
): Promise<IngestEgovCorporateTaxSourceResult> {
  const source =
    await fetchCurrentEgovCorporateTaxSource(
      options,
    );

  const ingestion = await ingestTaxSourceVersion(
    supabase,
    {
      provider: 'e_gov',
      canonicalLocator:
        'egov:law:340AC0000000034:articles-74-75-3',
      versionLabel: source.revisionId,
      rawText: source.normalizedText,
      publishedAt: null,
      effectiveFrom:
        source.amendmentEnforcementDate,
      effectiveTo: null,
      observedAt: options.observedAt,
      retrievedAt: options.retrievedAt,
      rawReference: source.rawReference,
    },
  );

  return { source, ingestion };
}
