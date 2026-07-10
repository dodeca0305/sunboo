'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  WORKSPACE_DOCUMENT_TYPES, WORKSPACE_DOCUMENT_TYPE_LABEL,
  WORKSPACE_DOCUMENT_STATUSES, WORKSPACE_DOCUMENT_STATUS_LABEL,
  type WorkspaceDocumentType, type WorkspaceDocumentStatus, type WorkspaceDocumentStatusMap,
} from '@/lib/workspaceDocumentStatus';
import { createBrowserSupabase } from '@/lib/supabase/browser';

// ── Company Workspace — 書類一覧（Sprint 26 Workspace Documents MVP）─────────
// workspace_documents（本Sprint新設）のステータスを表示・変更する。ファイルアップロードは
// スコープ外（メタデータのみ）。AnnualRoadmapView（Sprint23.3・24.1）の楽観的更新パターンを踏襲する。

const STATUS_TONE: Record<WorkspaceDocumentStatus, 'neutral' | 'amber'> = {
  not_registered: 'neutral',
  registered: 'neutral',
  needs_update: 'amber',
};

export default function WorkspaceDocumentsView({
  companyId,
  statusMap,
}: {
  companyId: number;
  statusMap: WorkspaceDocumentStatusMap;
}) {
  const [localStatusMap, setLocalStatusMap] = useState<WorkspaceDocumentStatusMap>(statusMap);
  const [error, setError] = useState<string | null>(null);

  async function handleStatusChange(documentType: WorkspaceDocumentType, status: WorkspaceDocumentStatus) {
    const previous = localStatusMap[documentType] ?? 'not_registered';
    setLocalStatusMap((prev) => ({ ...prev, [documentType]: status })); // 楽観的更新
    setError(null);

    const supabase = createBrowserSupabase();
    if (!supabase) return;
    const { error: upsertError } = await supabase
      .from('workspace_documents')
      .upsert({ company_id: companyId, document_type: documentType, status }, { onConflict: 'company_id,document_type' });

    if (upsertError) {
      setLocalStatusMap((prev) => ({ ...prev, [documentType]: previous }));
      setError(`保存に失敗しました: ${upsertError.message}`);
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}
      <ul className="space-y-2">
        {WORKSPACE_DOCUMENT_TYPES.map((documentType) => {
          const status = localStatusMap[documentType] ?? 'not_registered';
          const tone = STATUS_TONE[status];
          return (
            <li key={documentType} className="card flex flex-wrap items-center gap-2 py-3">
              <span className="text-sm font-medium text-gray-900">{WORKSPACE_DOCUMENT_TYPE_LABEL[documentType]}</span>
              {tone === 'amber' && <span className="tag border-amber-200 text-amber-700">要更新</span>}
              <select
                value={status}
                onChange={(e) => handleStatusChange(documentType, e.target.value as WorkspaceDocumentStatus)}
                className="form-select ml-auto w-auto py-1 text-xs"
              >
                {WORKSPACE_DOCUMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>{WORKSPACE_DOCUMENT_STATUS_LABEL[s]}</option>
                ))}
              </select>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
