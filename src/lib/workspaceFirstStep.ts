import { profileInputId, type MissingProfileInput } from './profileInputGuidance.ts';
import type { WorkspaceDecisionAction } from './workspaceDecisions.ts';

// 会社ホーム最上部の「最初の一歩」の選択だけを行う純粋関数。
// 税務・期限の再判定や新しい優先順位は持たず、既存のtodayActions先頭/missingProfileInputs先頭を選ぶだけ。

export function actionHrefFor(companyId: number, action: WorkspaceDecisionAction): string {
  if (action.actionHref) return action.actionHref;
  if (action.procedureId != null && action.dueDate !== null) {
    return `/admin/workspaces/${companyId}/roadmap?procedureId=${action.procedureId}&dueDate=${encodeURIComponent(action.dueDate)}`;
  }
  return `/admin/workspaces/${companyId}/roadmap`;
}

export type WorkspaceFirstStep =
  | { kind: 'unavailable' }
  | { kind: 'urgent'; title: string; reason: string; href: string }
  | { kind: 'profile'; title: string; reason: string; href: string }
  | { kind: 'action'; title: string; reason: string; href: string }
  | { kind: 'roadmap'; title: string; reason: string; href: string };

export function selectWorkspaceFirstStep(input: {
  companyId: number;
  readFailed: boolean;
  missingInputs: MissingProfileInput[];
  todayActions: WorkspaceDecisionAction[];
}): WorkspaceFirstStep {
  const { companyId, readFailed, missingInputs, todayActions } = input;
  // 取得失敗は未登録/0件と区別し、次の行動も優先順位も確定しない。
  if (readFailed) return { kind: 'unavailable' };
  const first = todayActions[0];
  if (first && first.priority === 'high') {
    return { kind: 'urgent', title: first.title, reason: first.reason, href: actionHrefFor(companyId, first) };
  }
  if (missingInputs.length > 0) {
    return {
      kind: 'profile',
      title: 'まず、会社情報を入力してください',
      reason: `未入力：${missingInputs.map((field) => field.label).join('・')}`,
      href: `/admin/workspaces/${companyId}/profile#${profileInputId(missingInputs[0].key)}`,
    };
  }
  if (first) {
    return { kind: 'action', title: first.title, reason: first.reason, href: actionHrefFor(companyId, first) };
  }
  return {
    kind: 'roadmap',
    title: '今後の手続きを確認してください',
    reason: '今の登録情報では、先に表示する対応候補はありません。',
    href: `/admin/workspaces/${companyId}/roadmap`,
  };
}
