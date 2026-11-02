'use client';

import { useRef, useState } from 'react';
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
// スコープ外（メタデータのみ）。取得済みの状態だけを編集し、保存成功後に表示を更新する。
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

  const [saving, setSaving] = useState(false);
  const [requiresReload, setRequiresReload] = useState(false);
  // 同一描画中の連続操作も止め、結果不明の要求は再読み込みまで再送しない。
  const saveBlocked = useRef(false);

  async function saveStatus(
    table: 'workspace_documents' | 'workspace_required_document_statuses',
    payload: { document_type: WorkspaceDocumentType; status: WorkspaceDocumentStatus }
      | { document_name: string; status: WorkspaceRequiredDocumentStatus },
    onConflict: string,
  ): Promise<boolean> {
    if (saveBlocked.current) return false;
    saveBlocked.current = true;
    setSaving(true);
    setError(null);
    let confirmed = false;
    try {
      const supabase = createBrowserSupabase();
      if (!supabase) throw new Error('Document client unavailable');
      const { error: upsertError } = await supabase.from(table)
        .upsert({ company_id: companyId, ...payload }, { onConflict });
      if (upsertError) throw upsertError;
      confirmed = true;
      return true;
    } catch {
      setRequiresReload(true);
      setError('書類の保存結果を確認できませんでした。再読み込みして登録内容を確認してください。');
      return false;
    } finally {
      saveBlocked.current = !confirmed;
      setSaving(false);
    }
  }

  async function handleStatusChange(documentType: WorkspaceDocumentType, status: WorkspaceDocumentStatus) {
    if (await saveStatus('workspace_documents', { document_type: documentType, status }, 'company_id,document_type')) {
      setLocalStatusMap(previous => ({ ...previous, [documentType]: status }));
    }
  }

  async function handleRequiredStatusChange(documentName: string, status: WorkspaceRequiredDocumentStatus) {
    if (await saveStatus('workspace_required_document_statuses', { document_name: documentName, status }, 'company_id,document_name')) {
      setLocalRequiredStatusMap(previous => ({ ...previous, [documentName]: status }));
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <div role="alert">
          <InformationCard kind="error">
            {error}
            <a className="mt-2 block underline" href={`/admin/workspaces/${companyId}/documents`}>再読み込み</a>
          </InformationCard>
        </div>
      )}
      {saving && <p role="status" className="text-xs text-sunboo-ink-muted">保存中…</p>}
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
                disabled={saving || requiresReload}
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
                      disabled={saving || requiresReload}
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
