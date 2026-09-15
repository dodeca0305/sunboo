'use client';

import { useState } from 'react';
import { CheckCircle2, Circle, AlertTriangle, CalendarClock, FileText, LoaderCircle } from 'lucide-react';
import {
  WORKSPACE_DOCUMENT_TYPES, WORKSPACE_DOCUMENT_TYPE_LABEL,
  WORKSPACE_DOCUMENT_STATUSES, WORKSPACE_DOCUMENT_STATUS_LABEL,
  type WorkspaceDocumentType, type WorkspaceDocumentStatus, type WorkspaceDocumentStatusMap,
} from '@/lib/workspaceDocumentStatus';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import InformationCard from '@/components/InformationCard';
import type { WorkspaceRequiredDocument } from '@/lib/workspaceRequiredDocuments';
import {
  WORKSPACE_REQUIRED_DOCUMENT_STATUSES,
  WORKSPACE_REQUIRED_DOCUMENT_STATUS_LABEL,
  type WorkspaceRequiredDocumentStatus,
  type WorkspaceRequiredDocumentStatusMap,
} from '@/lib/workspaceRequiredDocumentStatus';

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
  requiredDocuments,
  requiredDocumentStatusMap,
}: {
  companyId: number;
  statusMap: WorkspaceDocumentStatusMap;
  requiredDocuments: WorkspaceRequiredDocument[];
  requiredDocumentStatusMap: WorkspaceRequiredDocumentStatusMap;
}) {
  const [localStatusMap, setLocalStatusMap] = useState<WorkspaceDocumentStatusMap>(statusMap);
  const [error, setError] = useState<string | null>(null);
  const [localRequiredStatusMap, setLocalRequiredStatusMap] =
    useState<WorkspaceRequiredDocumentStatusMap>(requiredDocumentStatusMap);

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

  async function handleRequiredStatusChange(
    documentName: string,
    status: WorkspaceRequiredDocumentStatus,
  ) {
    const previous = localRequiredStatusMap[documentName] ?? 'not_ready';
    setLocalRequiredStatusMap((prev) => ({ ...prev, [documentName]: status }));
    setError(null);

    const supabase = createBrowserSupabase();
    if (!supabase) return;
    const { error: upsertError } = await supabase
      .from('workspace_required_document_statuses')
      .upsert(
        { company_id: companyId, document_name: documentName, status },
        { onConflict: 'company_id,document_name' },
      );

    if (upsertError) {
      setLocalRequiredStatusMap((prev) => ({ ...prev, [documentName]: previous }));
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

      <section className="space-y-3 pt-5">
        <div>
          <h2 className="text-base font-bold text-sunboo-ink">今後の手続きに必要な書類</h2>
          <p className="mt-1 text-xs text-sunboo-ink-muted">
            未完了のロードマップから、必須書類を重複なくまとめています。
          </p>
        </div>

        {requiredDocuments.length === 0 ? (
          <InformationCard kind="info">現在のロードマップに未準備の必須書類はありません。</InformationCard>
        ) : (
          <ul className="space-y-2">
            {requiredDocuments.map((document) => {
              const preparationStatus = localRequiredStatusMap[document.name] ?? 'not_ready';
              const PreparationIcon = preparationStatus === 'ready'
                ? CheckCircle2
                : preparationStatus === 'in_progress'
                  ? LoaderCircle
                  : Circle;
              const preparationIconClass = preparationStatus === 'ready'
                ? 'text-sunboo-moss'
                : preparationStatus === 'in_progress'
                  ? 'text-sunboo-morning-sun-dark'
                  : 'text-sunboo-mist';

              return (
              <li key={document.name} className="card space-y-2 py-3">
                <div className="flex items-start gap-2">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-sunboo-moss" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-sunboo-ink">
                      {document.name}
                      {document.formNumber && (
                        <span className="ml-2 text-xs font-normal text-sunboo-ink-muted">様式 {document.formNumber}</span>
                      )}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-sunboo-ink-muted">
                      使用する手続き：{document.procedures.join('、')}
                    </p>
                  </div>
                  <div className="ml-auto flex shrink-0 items-center gap-2">
                    <PreparationIcon className={`h-4 w-4 ${preparationIconClass}`} aria-hidden="true" />
                    <select
                      value={preparationStatus}
                      aria-label={`${document.name}の準備状況`}
                      onChange={(event) => handleRequiredStatusChange(
                        document.name,
                        event.target.value as WorkspaceRequiredDocumentStatus,
                      )}
                      className="form-select w-auto py-1 text-xs"
                    >
                      {WORKSPACE_REQUIRED_DOCUMENT_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {WORKSPACE_REQUIRED_DOCUMENT_STATUS_LABEL[status]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="flex items-center gap-1.5 pl-6 text-xs text-sunboo-morning-sun-dark">
                  <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                  最も近い期限：{document.nearestDueDate}
                </p>
              </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
