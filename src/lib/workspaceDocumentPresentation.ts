import type { WorkspaceRequiredDocument } from './workspaceRequiredDocuments.ts';
import {
  WORKSPACE_REQUIRED_DOCUMENT_STATUSES,
  type WorkspaceRequiredDocumentStatus,
} from './workspaceRequiredDocumentStatus.ts';

// 表示専用の整理。税務判定・期限計算・集約（buildWorkspaceRequiredDocuments）は変更しない。
// 並べ替え・分割は期限と書類名だけで決め、準備状況には依存しない（準備状況を変えてもカードは移動しない）。

export const REQUIRED_DOCUMENT_NEXT_ACTION: Record<WorkspaceRequiredDocumentStatus, string> = {
  not_ready: '手元に書類があるか確認し、なければ担当者に準備を相談してください。',
  in_progress: '不足している書類や記載内容をそろえてください。',
  ready: '使う年度を確かめ、年間ロードマップで提出先・提出方法を確認してください。',
};

/** 不明な（想定外の）状態では null を返し、次にすることを主張しない。 */
export function requiredDocumentNextAction(status: unknown): string | null {
  return typeof status === 'string' &&
    (WORKSPACE_REQUIRED_DOCUMENT_STATUSES as readonly string[]).includes(status)
    ? REQUIRED_DOCUMENT_NEXT_ACTION[status as WorkspaceRequiredDocumentStatus]
    : null;
}

export type GroupedRequiredDocuments = {
  /** 最も近い期限が同じ書類（全件）。 */
  primary: WorkspaceRequiredDocument[];
  /** それ以降の期限の書類。 */
  later: WorkspaceRequiredDocument[];
};

/** 入力を変更せず、期限→書類名で並べた複製を最も近い期限の組と残りに分ける。 */
export function groupRequiredDocumentsByNearestDue(
  documents: readonly WorkspaceRequiredDocument[],
): GroupedRequiredDocuments {
  const sorted = [...documents].sort(
    (a, b) =>
      a.nearestDueDate.localeCompare(b.nearestDueDate) ||
      a.name.localeCompare(b.name, 'ja'),
  );
  if (sorted.length === 0) return { primary: [], later: [] };
  const first = sorted[0].nearestDueDate;
  return {
    primary: sorted.filter((d) => d.nearestDueDate === first),
    later: sorted.filter((d) => d.nearestDueDate !== first),
  };
}
