import { procedureCompletionGuide } from './procedureCompletionGuide.ts';
import type { RoadmapDocumentGroups } from './roadmapDocuments.ts';

// 書類準備→提出後の確認→明示完了の、画面内だけの純粋な状態遷移。
// 保存・通信・税務判定・期限計算は一切しない。完了の保存は呼び出し側の既存処理（done送信1回）が行う。
// 状態は開いている画面の間だけ。再読込・画面移動・会社/期限/書類条件の変更で消える（保存しない）。

export const COMPLETION_FLOW_CODE = 'DEPRECIABLE_ASSET_TAX_RETURN';

// 初回対象：編集可能な会社別ロードマップの償却資産申告だけ。共有・一般の読み取り画面は対象外。
export function isCompletionFlowTarget(code: unknown, editable: boolean): boolean {
  return editable && code === COMPLETION_FLOW_CODE && procedureCompletionGuide(code).kind === 'filing_only';
}

// 提出後の確認の文言は既存のfiling_only 2条件をそのまま使う（税務基準を増やさない）。
export function completionConfirmLines(code: unknown): string[] {
  const guide = procedureCompletionGuide(code);
  return guide.kind === 'filing_only' ? guide.lines : [];
}

// 対応状況の選択：対象カードで「完了」を選んだら即保存せず確認導線へ。他の状態・他の手続きは従来どおり。
export function statusChangeRoute(isTarget: boolean, next: string): 'open_flow' | 'save' {
  return isTarget && next === 'done' ? 'open_flow' : 'save';
}

// 保存済みの完了は、新しい確認がないことを理由に未完了へ戻さない。導線は未完了のときだけ出す。
export function shouldShowCompletionFlow(status: string): boolean {
  return status !== 'done';
}

export type CompletionDocument = { id: string; name: string; notes: string | null };

export type CompletionDocCondition =
  | { kind: 'ready'; required: CompletionDocument[]; optional: CompletionDocument[]; signature: string }
  | { kind: 'blocked'; reason: 'no_documents' | 'no_required'; optional: CompletionDocument[]; signature: string };

// 書類データは既存の必要書類グループ（procedure_documents）から。取得元は欠落と正常な空を区別できないため
// （normalizeProcedureDocuments は null も空配列にする）、空・必須0件は「揃った」と扱わず新しい完了操作を保留する。
// 準備・提出前チェックは案内のままで条件に含めない。任意の書類も条件外。
export function completionDocCondition(groups: RoadmapDocumentGroups): CompletionDocCondition {
  const toDoc = (d: RoadmapDocumentGroups['documents'][number]): CompletionDocument => ({ id: d.id, name: d.name, notes: d.notes });
  const required = groups.documents.filter((d) => d.isRequired).map(toDoc);
  const optional = groups.documents.filter((d) => !d.isRequired).map(toDoc);
  if (groups.documents.length === 0) return { kind: 'blocked', reason: 'no_documents', optional, signature: 'blocked:no_documents' };
  if (required.length === 0) return { kind: 'blocked', reason: 'no_required', optional, signature: 'blocked:no_required' };
  // 署名は必須書類のid・補足（notes）。補足だけの変更でも古いチェックを流用しない。
  return { kind: 'ready', required, optional, signature: JSON.stringify(required.map((d) => [d.id, d.notes])) };
}

// 既存の「完了にする前の確認」の2条件（見出し＋補足）。静的案内を隠しても補足を失わないために使う。
export function completionConfirmSteps(code: unknown): { title: string; note: string }[] {
  const guide = procedureCompletionGuide(code);
  return guide.kind === 'filing_only' ? guide.steps.map((s) => ({ title: s.title, note: s.note })) : [];
}

// statusは保存済み状態（外部更新で別の未完了状態になった場合も古い確認を流用しない）。
export function completionFlowScope(parts: {
  pathname: string; companyId: number | undefined; procedureId: number; dueDate: string; signature: string; status: string;
}): string {
  return JSON.stringify([parts.pathname, parts.companyId ?? null, parts.procedureId, parts.dueDate, parts.signature, parts.status]);
}

export type CompletionFlowState = {
  step: 'docs' | 'confirm';
  docs: string[]; // 確認済みの必須書類id
  confirms: [boolean, boolean];
};

export function initialCompletionFlowState(): CompletionFlowState {
  return { step: 'docs', docs: [], confirms: [false, false] };
}

export function allDocsChecked(state: CompletionFlowState, requiredIds: string[]): boolean {
  return requiredIds.length > 0 && requiredIds.every((id) => state.docs.includes(id));
}

// 現在の必須書類に存在しないidは捨てる。書類が欠けたら後続の確認も消す。
export function reconcileCompletionFlowState(state: CompletionFlowState, requiredIds: string[]): CompletionFlowState {
  const docs = state.docs.filter((id) => requiredIds.includes(id));
  if (requiredIds.length > 0 && requiredIds.every((id) => docs.includes(id))) {
    return docs.length === state.docs.length ? state : { ...state, docs };
  }
  return { step: 'docs', docs, confirms: [false, false] };
}

export function toggleCompletionDoc(state: CompletionFlowState, requiredIds: string[], id: string, checked: boolean): CompletionFlowState {
  if (!requiredIds.includes(id)) return state;
  const docs = checked ? (state.docs.includes(id) ? state.docs : [...state.docs, id]) : state.docs.filter((d) => d !== id);
  return reconcileCompletionFlowState({ ...state, docs }, requiredIds);
}

export function canAdvanceToConfirm(state: CompletionFlowState, requiredIds: string[]): boolean {
  return allDocsChecked(state, requiredIds);
}

export function advanceToConfirm(state: CompletionFlowState, requiredIds: string[]): CompletionFlowState {
  return canAdvanceToConfirm(state, requiredIds) ? { ...state, step: 'confirm' } : state;
}

// 戻っても書類・確認は保持する。
export function backToDocs(state: CompletionFlowState): CompletionFlowState {
  return state.step === 'docs' ? state : { ...state, step: 'docs' };
}

export function toggleCompletionConfirm(state: CompletionFlowState, requiredIds: string[], index: 0 | 1, checked: boolean): CompletionFlowState {
  if (state.step !== 'confirm' || !allDocsChecked(state, requiredIds)) return state;
  const confirms: [boolean, boolean] = [state.confirms[0], state.confirms[1]];
  confirms[index] = checked;
  return { ...state, confirms };
}

// 確認が揃っても自動完了しない。ボタンの有効条件だけ。保存中・結果未確認（blocked）は不可。
export function canCompleteFlow(state: CompletionFlowState, requiredIds: string[], blocked: boolean): boolean {
  return !blocked && state.step === 'confirm' && allDocsChecked(state, requiredIds) && state.confirms[0] && state.confirms[1];
}
