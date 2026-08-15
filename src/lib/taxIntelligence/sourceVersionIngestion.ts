import { createHash } from 'node:crypto';

export type NormalizedTaxSourceContent = {
  normalizedText: string;
  contentHash: string;
};

/**
 * TaxSourceVersionの同一性判定に使う決定的な正規化。
 *
 * 意味を持つ可能性がある行頭空白・連続空白・空行は保持する。
 * 既存seedとの互換性のため、末尾改行は付与しない。
 */
export function normalizeTaxSourceText(
  rawText: string,
): string {
  const normalized = rawText
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n+$/g, '');

  if (normalized.length === 0) {
    throw new Error(
      'TaxSourceのnormalized_textを空にはできません。',
    );
  }

  return normalized;
}

export function prepareTaxSourceContent(
  rawText: string,
): NormalizedTaxSourceContent {
  const normalizedText = normalizeTaxSourceText(rawText);
  const contentHash = createHash('sha256')
    .update(normalizedText, 'utf8')
    .digest('hex');

  return { normalizedText, contentHash };
}

import type { SupabaseClient } from '../supabase';

export type TaxSourceVersionIngestionInput = {
  provider: string;
  canonicalLocator: string;
  versionLabel?: string | null;
  rawText: string;
  publishedAt?: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  observedAt?: Date | string;
  retrievedAt?: Date | string;
  rawReference?: string | null;
};

export type TaxSourceVersionIngestionResult = {
  taxSourceVersionId: number;
  taxSourceId: number;
  contentHash: string;
  supersedesVersionId: number | null;
  wasInserted: boolean;
};

type TaxSourceVersionIngestionRow = {
  tax_source_version_id: number;
  tax_source_id: number;
  content_hash: string;
  supersedes_version_id: number | null;
  was_inserted: boolean;
};

function toIsoTimestamp(
  value: Date | string,
  fieldName: string,
): string {
  const date =
    value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName}が有効な日時ではありません。`);
  }

  return date.toISOString();
}

export async function ingestTaxSourceVersion(
  supabase: SupabaseClient,
  input: TaxSourceVersionIngestionInput,
): Promise<TaxSourceVersionIngestionResult> {
  const provider = input.provider.trim();
  const canonicalLocator =
    input.canonicalLocator.trim();

  if (provider.length === 0) {
    throw new Error('providerを空にはできません。');
  }

  if (canonicalLocator.length === 0) {
    throw new Error(
      'canonicalLocatorを空にはできません。',
    );
  }

  const { normalizedText, contentHash } =
    prepareTaxSourceContent(input.rawText);

  const now = new Date();
  const observedAt = toIsoTimestamp(
    input.observedAt ?? now,
    'observedAt',
  );
  const retrievedAt = toIsoTimestamp(
    input.retrievedAt ?? now,
    'retrievedAt',
  );

  const { data, error } = await supabase.rpc(
    'ingest_tax_source_version',
    {
      p_provider: provider,
      p_canonical_locator: canonicalLocator,
      p_version_label: input.versionLabel ?? null,
      p_content_hash: contentHash,
      p_published_at: input.publishedAt ?? null,
      p_effective_from: input.effectiveFrom ?? null,
      p_effective_to: input.effectiveTo ?? null,
      p_observed_at: observedAt,
      p_retrieved_at: retrievedAt,
      p_raw_reference: input.rawReference ?? null,
      p_normalized_text: normalizedText,
    },
  );

  if (error) {
    throw new Error(
      `TaxSourceVersionの取り込みに失敗しました: ${error.message}`,
    );
  }

  const rows =
    (data as TaxSourceVersionIngestionRow[] | null) ??
    [];

  if (rows.length !== 1) {
    throw new Error(
      `TaxSourceVersionの取り込み結果が不正です: ${rows.length}件`,
    );
  }

  const row = rows[0];

  if (row.content_hash !== contentHash) {
    throw new Error(
      'TaxSourceVersionの取り込み結果でcontent_hashが一致しません。',
    );
  }

  return {
    taxSourceVersionId: row.tax_source_version_id,
    taxSourceId: row.tax_source_id,
    contentHash: row.content_hash,
    supersedesVersionId:
      row.supersedes_version_id,
    wasInserted: row.was_inserted,
  };
}
