// 完了の目安を短く示す静的な表示用ヘルパー。完了の判定・保存・期限計算はしない。
// 分類は手続きコード（既存の識別子）だけで行い、名称やカテゴリからの推測はしない。

// 表示用の1行動。title=大きい行動名、condition=常に添える条件、note=折り畳みの補足。
export type CompletionStep = { title: string; condition?: string; note: string };

export type ProcedureCompletionGuide =
  | { kind: 'filing_only'; heading: string; lines: string[]; steps: CompletionStep[] }
  | { kind: 'filing_and_payment'; heading: string; lines: string[]; steps: CompletionStep[] }
  | { kind: 'unconfirmed'; heading: string; intro: string; questions: string[] };

const FLOW_HEADING = '完了にする前の確認';

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
        heading: FLOW_HEADING,
        lines: [
          '申告書を提出した',
          '受付を確認し、控えを保管した',
        ],
        steps: [
          { title: '申告書を提出した', note: '公式案内に沿って申告書を提出します。' },
          { title: '受付を確認し、控えを保管した', note: '受付が完了したことを確認し、控えを保管します。' },
        ],
      };
    }
    if (FILING_AND_PAYMENT_CODES.has(code)) {
      return {
        kind: 'filing_and_payment',
        heading: FLOW_HEADING,
        lines: [
          '申告の受付を確認した',
          '納める税金がある場合は、支払いを済ませた',
          '提出・支払いの控えを保管した',
        ],
        steps: [
          { title: '申告の受付を確認した', note: '公式案内に沿って申告書を提出し、受付が完了したことを確認します。' },
          { title: '支払いを済ませた', condition: '納める税金がある場合', note: '納付先と方法は公式案内で確認します。' },
          { title: '提出・支払いの控えを保管した', condition: '支払いの控えは、納める税金がある場合', note: '提出の控えを保管します。納める税金がある場合は、支払いの控えも保管します。' },
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
