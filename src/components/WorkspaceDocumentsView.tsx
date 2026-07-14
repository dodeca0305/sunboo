'use client';

import { useState } from 'react';
import { CheckCircle2, Circle, AlertTriangle } from 'lucide-react';
import {
  WORKSPACE_DOCUMENT_TYPES, WORKSPACE_DOCUMENT_TYPE_LABEL,
  WORKSPACE_DOCUMENT_STATUSES, WORKSPACE_DOCUMENT_STATUS_LABEL,
  type WorkspaceDocumentType, type WorkspaceDocumentStatus, type WorkspaceDocumentStatusMap,
} from '@/lib/workspaceDocumentStatus';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import InformationCard from '@/components/InformationCard';

// ── Company Workspace — 書類一覧（Sprint 26 Workspace Documents MVP・Sprint 85）─────────
// workspace_documents（本Sprint新設）のステータスを表示・変更する。ファイルアップロードは
// スコープ外（メタデータのみ）。AnnualRoadmapView（Sprint23.3・24.1）の楽観的更新パターンを踏襲する。
// 【Sprint85で追加】各行を「今年提出した書類の記録」として読めるよう、状態をアイコンで示す
// （registered=Moss・needs_update=MorningSun系・not_registered=中立）。ステータス種別・DB問い合わせは無変更。

const STATUS_ICON: Record<WorkspaceDocumentStatus, typeof CheckCircle2> = {
  not_registered: Circle,
  registered: CheckCircle2,
  needs_update: AlertTriangle,
};

const STATUS_ICON_CLASS: Record<WorkspaceDocumentStatus, string> = {
  not_registered: 'text-sunboo-mist',
  registered: 'text-sunboo-moss',
  needs_update: 'text-sunboo-morning-sun-dark',
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
      {error && <InformationCard kind="error">{error}</InformationCard>}
      <ul className="space-y-2">
        {WORKSPACE_DOCUMENT_TYPES.map((documentType) => {
          const status = localStatusMap[documentType] ?? 'not_registered';
          const Icon = STATUS_ICON[status];
          return (
            <li key={documentType} className="card flex flex-wrap items-center gap-3 py-3">
              <Icon className={`h-4 w-4 shrink-0 ${STATUS_ICON_CLASS[status]}`} aria-hidden="true" />
              <span className="text-sm font-medium text-sunboo-ink">{WORKSPACE_DOCUMENT_TYPE_LABEL[documentType]}</span>
              {status === 'needs_update' && <span className="tag tag--caution">要更新</span>}
              <select
                value={status}
                aria-label={`${WORKSPACE_DOCUMENT_TYPE_LABEL[documentType]}の登録状況`}
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
