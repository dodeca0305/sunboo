// 完了の目安を短く示す静的な表示用ヘルパー。完了の判定・保存・期限計算はしない。
// 分類は手続きコード（既存の識別子）だけで行い、名称やカテゴリからの推測はしない。

export type ProcedureCompletionGuide =
  | { kind: 'filing_only'; heading: string; lines: string[] }
  | { kind: 'filing_and_payment'; heading: string; lines: string[] }
  | { kind: 'unconfirmed'; heading: string; intro: string; questions: string[] };

// 申告だけで、納付を含まない手続き。
const FILING_ONLY_CODES = new Set(['DEPRECIABLE_ASSET_TAX_RETURN']);

// 既存のcanPlanTaxPaymentが「申告＋納付」として扱う申告コード（源泉/住民税の天引きは含めない）。
const FILING_AND_PAYMENT_CODES = new Set([
  'CORP_TAX_RETURN',
  'CONSUMPTION_TAX_RETURN',
  'PREFECTURAL_RESIDENT_TAX_RETURN',
  'PREFECTURAL_BUSINESS_TAX_RETURN',
  'MUNICIPAL_RESIDENT_TAX_RETURN',
]);

export function procedureCompletionGuide(code: unknown): ProcedureCompletionGuide {
  if (typeof code === 'string') {
    if (FILING_ONLY_CODES.has(code)) {
      return {
        kind: 'filing_only',
        heading: '完了の目安',
        lines: [
          '申告書を提出した',
          '受付完了を確認し、控えを残した',
        ],
      };
    }
    if (FILING_AND_PAYMENT_CODES.has(code)) {
      return {
        kind: 'filing_and_payment',
        heading: '完了の目安',
        lines: [
          '申告書を提出し、受付完了を確認した',
          '納める税金がある場合は、支払いを済ませた',
          '提出と支払いの控えを残した',
        ],
      };
    }
  }
  return {
    kind: 'unconfirmed',
    heading: 'まず、担当者にこの2つを確認',
    intro: '完了の目安は未確認です',
    questions: ['この手続きは必要ですか？', '何をすれば完了ですか？'],
  };
}
