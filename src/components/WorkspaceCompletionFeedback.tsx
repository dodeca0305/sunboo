'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

export function workspaceCompletionFeedbackKey(companyId: number): string {
  return `sunboo:workspace:${companyId}:completion-feedback`;
}

export default function WorkspaceCompletionFeedback({
  companyId,
}: {
  companyId: number;
}) {
  const [procedureName, setProcedureName] = useState<string | null>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const key = workspaceCompletionFeedbackKey(companyId);

      try {
        const storedProcedureName = window.sessionStorage.getItem(key);

        // 一度表示したら再読み込みでは繰り返さない。
        window.sessionStorage.removeItem(key);

        if (storedProcedureName?.trim()) {
          setProcedureName(storedProcedureName);
        }
      } catch {
        // sessionStorageを利用できない環境では通知を省略する。
      }
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [companyId]);

  if (!procedureName) {
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
        <p className="text-sm font-semibold text-sunboo-ink">完了しました</p>
        <p className="mt-0.5 text-xs leading-relaxed text-sunboo-ink-muted">
          「{procedureName}」を完了として記録しました。
        </p>
      </div>
    </div>
  );
}
