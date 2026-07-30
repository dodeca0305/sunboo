import {
  WORKSPACE_PROCEDURE_STATUSES,
  type WorkspaceProcedureStatus,
} from './workspaceProcedureStatus.ts';

export type WorkspaceCompletionFeedbackPayload = {
  procedureId: number;
  dueDate: string;
  procedureName: string;
  previousStatus: WorkspaceProcedureStatus;
};

export function workspaceCompletionFeedbackKey(companyId: number): string {
  return `sunboo:workspace:${companyId}:completion-feedback`;
}

export function isWorkspaceCompletionFeedbackPayload(
  value: unknown,
): value is WorkspaceCompletionFeedbackPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<WorkspaceCompletionFeedbackPayload>;

  return (
    typeof candidate.procedureId === 'number' &&
    Number.isInteger(candidate.procedureId) &&
    candidate.procedureId > 0 &&
    typeof candidate.dueDate === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(candidate.dueDate) &&
    typeof candidate.procedureName === 'string' &&
    candidate.procedureName.trim().length > 0 &&
    typeof candidate.previousStatus === 'string' &&
    WORKSPACE_PROCEDURE_STATUSES.includes(
      candidate.previousStatus as WorkspaceProcedureStatus,
    )
  );
}

export function parseWorkspaceCompletionFeedback(
  raw: string | null,
): WorkspaceCompletionFeedbackPayload | null {
  if (raw === null) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    return isWorkspaceCompletionFeedbackPayload(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export function serializeWorkspaceCompletionFeedback(
  payload: WorkspaceCompletionFeedbackPayload,
): string {
  return JSON.stringify(payload);
}
