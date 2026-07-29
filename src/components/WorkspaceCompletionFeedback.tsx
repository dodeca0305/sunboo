'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, RotateCcw } from 'lucide-react';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import {
  WORKSPACE_PROCEDURE_STATUSES,
  type WorkspaceProcedureStatus,
} from '@/lib/workspaceProcedureStatus';
import { trackEvent } from '@/lib/analytics';

export type WorkspaceCompletionFeedbackPayload = {
  procedureId: number;
  dueDate: string;
  procedureName: string;
  previousStatus: WorkspaceProcedureStatus;
};

export function workspaceCompletionFeedbackKey(companyId: number): string {
  return `sunboo:workspace:${companyId}:completion-feedback`;
}

function isCompletionFeedbackPayload(
  value: unknown,
): value is WorkspaceCompletionFeedbackPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<WorkspaceCompletionFeedbackPayload>;

  return (
    Number.isInteger(candidate.procedureId) &&
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

export default function WorkspaceCompletionFeedback({
  companyId,
}: {
  companyId: number;
}) {
  const [feedback, setFeedback] =
    useState<WorkspaceCompletionFeedbackPayload | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const key = workspaceCompletionFeedbackKey(companyId);

      try {
        const storedFeedback = window.sessionStorage.getItem(key);

        // 一度表示したら、再読み込みでは繰り返さない。
        window.sessionStorage.removeItem(key);

        if (!storedFeedback) {
          return;
        }

        const parsed: unknown = JSON.parse(storedFeedback);

        if (isCompletionFeedbackPayload(parsed)) {
          setFeedback(parsed);
        }
      } catch {
        // 不正な保存値やsessionStorageを利用できない環境では通知を省略する。
      }
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [companyId]);

  async function handleUndo() {
    if (!feedback || isRestoring) {
      return;
    }

    setIsRestoring(true);
    setRestoreError(null);

    const supabase = createBrowserSupabase();

    if (!supabase) {
      setRestoreError('ステータスを元に戻せませんでした。');
      setIsRestoring(false);
      return;
    }

    const { error } = await supabase
      .from('workspace_procedure_statuses')
      .upsert(
        {
          company_id: companyId,
          procedure_id: feedback.procedureId,
          occurrence_key: feedback.dueDate,
          status: feedback.previousStatus,
        },
        {
          onConflict: 'company_id,procedure_id,occurrence_key',
        },
      );

    if (error) {
      setRestoreError(`元に戻せませんでした: ${error.message}`);
      setIsRestoring(false);
      return;
    }

    trackEvent('procedure_status_changed', {
      workspace_id: companyId,
      company_id: companyId,
    });

    window.location.assign(`/admin/workspaces/${companyId}`);
  }

  if (!feedback) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="information-card information-card--info flex items-start gap-3"
    >
      <CheckCircle2
        className="mt-0.5 h-4 w-4 shrink-0 text-sunboo-morning-sun-dark"
        aria-hidden="true"
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-sunboo-ink">
              完了しました
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-sunboo-ink-muted">
              「{feedback.procedureName}」を完了として記録しました。
            </p>
          </div>

          <button
            type="button"
            onClick={handleUndo}
            disabled={isRestoring}
            className="btn-secondary inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {isRestoring ? '戻しています…' : '元に戻す'}
          </button>
        </div>

        {restoreError && (
          <p role="alert" className="mt-2 text-xs text-sunboo-danger">
            {restoreError}
          </p>
        )}
      </div>
    </div>
  );
}
