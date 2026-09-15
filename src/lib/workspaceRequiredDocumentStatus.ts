export const WORKSPACE_REQUIRED_DOCUMENT_STATUSES = [
  'not_ready',
  'in_progress',
  'ready',
] as const;

export type WorkspaceRequiredDocumentStatus =
  typeof WORKSPACE_REQUIRED_DOCUMENT_STATUSES[number];

export const WORKSPACE_REQUIRED_DOCUMENT_STATUS_LABEL: Record<
  WorkspaceRequiredDocumentStatus,
  string
> = {
  not_ready: '未準備',
  in_progress: '準備中',
  ready: '準備済み',
};

export type WorkspaceRequiredDocumentStatusMap = Record<
  string,
  WorkspaceRequiredDocumentStatus
>;
