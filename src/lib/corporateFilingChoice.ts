import { buildRoadmapNextAction } from './roadmapSubmissionInfo.ts';
import { electronicFilingEntry } from './electronicFilingEntry.ts';
import type { ScheduleProcedure } from './scheduleProcedure.ts';

// 法人税の申告だけが対象。法人住民税/事業税など他の手続きは既存の次の一歩・電子手続き表示のまま。
export const CORPORATE_FILING_CHOICE_CODE = 'CORP_TAX_RETURN';

export const CORPORATE_FILING_CHOICES = [
  { value: 'accountant', label: '税理士にお願いする' },
  { value: 'self', label: '自分で電子申告する' },
  { value: 'consult', label: 'どうすればいいか相談する' },
] as const;

export type CorporateFilingChoice = (typeof CORPORATE_FILING_CHOICES)[number]['value'];

export const CONSULT_BUTTON_LABEL = '相談先の案内を開く';
export const ACCOUNTANT_LINES = ['顧問税理士に、申告の依頼をしてください。', '必要な書類と提出予定日を確認しましょう。'] as const;

export function usesCorporateFilingChoice(procedure: Pick<ScheduleProcedure, 'code'>): boolean {
  return procedure.code === CORPORATE_FILING_CHOICE_CODE;
}

export function isCorporateFilingChoice(value: string): value is CorporateFilingChoice {
  return CORPORATE_FILING_CHOICES.some((choice) => choice.value === value);
}

// 提出先未確定の注意は、選択前でも常に見えるようにする（相談を選んだ時だけ出して見落とさせない）。
export function corporateDestinationNotice(procedure: Pick<ScheduleProcedure, 'submissionGuidance'>): string | null {
  return procedure.submissionGuidance ? '提出先はまだ確定していません。' : null;
}

type NextAction =ReturnType<typeof buildRoadmapNextAction>;
export type CorporateFilingView =
  | { kind: 'accountant'; lines: readonly string[] }
  | { kind: 'self'; entry: ReturnType<typeof electronicFilingEntry> }
  | { kind: 'consult'; action: NextAction };

// 表示の選択だけを返す純粋関数。保存・担当割当・状態変更は行わない。
export function corporateFilingView(choice: CorporateFilingChoice, procedure: ScheduleProcedure): CorporateFilingView {
  if (choice === 'accountant') return { kind: 'accountant', lines: ACCOUNTANT_LINES };
  if (choice === 'self') return { kind: 'self', entry: electronicFilingEntry(procedure) };
  const action = buildRoadmapNextAction(procedure);
  // 相談先の案内であり、申告方法ではない。リンクが無い場合は既存の注記（未登録/確認中）をそのまま返す。
  return { kind: 'consult', action: action.href ? { ...action, buttonLabel: CONSULT_BUTTON_LABEL } : action };
}
