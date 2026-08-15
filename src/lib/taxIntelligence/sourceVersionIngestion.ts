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
