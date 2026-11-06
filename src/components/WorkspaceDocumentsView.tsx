'use client';

import { useEffect, useRef, useState } from 'react';
import WorkspaceDocumentEditor from './WorkspaceDocumentEditor';
import type { DocumentSnapshotMap } from '@/lib/workspaceDocumentTiming';
import { CheckCircle2, Circle, CalendarClock, FileText, LoaderCircle } from 'lucide-react';
import {
  WORKSPACE_DOCUMENT_TYPES,
} from '@/lib/workspaceDocumentStatus';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import InformationCard from '@/components/InformationCard';
import WorkspaceReadReloadButton from '@/components/WorkspaceReadReloadButton';
import type { WorkspaceRequiredDocument } from '@/lib/workspaceRequiredDocuments';
import {
  WORKSPACE_REQUIRED_DOCUMENT_STATUSES,
  WORKSPACE_REQUIRED_DOCUMENT_STATUS_LABEL,
  type WorkspaceRequiredDocumentStatus,
  type WorkspaceRequiredDocumentStatusMap,
} from '@/lib/workspaceRequiredDocumentStatus';

// 書類ごとの状態・時期は専用エディターで原子的に保存する。
// 必要書類の準備状況は既存の独立した保存先を維持する。

export default function WorkspaceDocumentsView({
  companyId,
  snapshots,
  requiredDocuments,
  requiredDocumentStatusMap,
  requiredDocumentsMissingFiscalMonth = false,
}: {
  companyId: number;
  snapshots: DocumentSnapshotMap;
  requiredDocuments: WorkspaceRequiredDocument[] | null;
  requiredDocumentsMissingFiscalMonth?: boolean;
  requiredDocumentStatusMap: WorkspaceRequiredDocumentStatusMap;
}) {
  const [confirmed, setConfirmed] = useState(snapshots);
  const [actorId, setActorId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localRequiredStatusMap, setLocalRequiredStatusMap] =
    useState<WorkspaceRequiredDocumentStatusMap>(requiredDocumentStatusMap);

  const [saving, setSaving] = useState(false);
  const [requiresReload, setRequiresReload] = useState(false);
  // 同一描画中の連続操作も止め、結果不明の要求は再読み込みまで再送しない。
  const saveBlocked = useRef(false);

  useEffect(() => {
    let active = true;
    const client = createBrowserSupabase();
    if (!client) return;
    void client.auth.getUser().then(({data, error}) => {
      if (!active) return;
      if (!error && data.user) setActorId(data.user.id);
      else {setRequiresReload(true); setError('ログイン状態を確認できません。再読み込みしてください。');}
    }).catch(() => {if (active) {setRequiresReload(true); setError('ログイン状態を確認できません。再読み込みしてください。');}});
    return () => {active = false;};
  }, []);

  async function saveStatus(
    payload: { document_name: string; status: WorkspaceRequiredDocumentStatus },
  ): Promise<boolean> {
    if (saveBlocked.current) return false;
    saveBlocked.current = true;
    setSaving(true);
    setError(null);
    let confirmed = false;
    try {
      const supabase = createBrowserSupabase();
      if (!supabase) throw new Error('Document client unavailable');
      const { error: upsertError } = await supabase.from('workspace_required_document_statuses')
        .upsert({ company_id: companyId, ...payload }, { onConflict: 'company_id,document_name' });
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

  async function handleRequiredStatusChange(documentName: string, status: WorkspaceRequiredDocumentStatus) {
    if (await saveStatus({ document_name: documentName, status })) {
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
      <p className="text-sm font-medium" role="status">{Object.values(confirmed).filter(row => row?.status === 'registered').length}/5件登録済み</p>
      <ul className="space-y-2">
        {WORKSPACE_DOCUMENT_TYPES.map(documentType => <WorkspaceDocumentEditor
          key={`${companyId}:${documentType}:${actorId ?? 'checking'}`}
          companyId={companyId} documentType={documentType} initial={snapshots[documentType] ?? null}
          actorId={actorId} disabled={saving || requiresReload || !actorId} onSafetyBlock={() => setRequiresReload(true)} onConfirmed={snapshot => setConfirmed(previous => ({...previous,[documentType]:snapshot}))}
        />)}
      </ul>

      <section className="space-y-3 pt-5">
        <div>
          <h2 className="text-base font-bold text-sunboo-ink">今後の手続きに必要な書類</h2>
          <p className="mt-1 text-xs text-sunboo-ink-muted">
            未完了のロードマップから、必須書類を重複なくまとめています。
            準備状況は書類名ごとの共通記録で、年度ごとの提出済み記録ではありません。
          </p>
        </div>

        {requiredDocuments === null && requiredDocumentsMissingFiscalMonth ? (
          <InformationCard kind="info" title="必要書類の算出を保留しています">
            決算月が未登録です。会社プロフィールに決算月を登録すると、今後の手続きに必要な書類を算出できます。
          </InformationCard>
        ) : requiredDocuments === null ? (
          <div role="alert" data-testid="required-documents-unavailable">
            <InformationCard kind="error" title="必要書類を取得できません">
              予定や手続き状態の取得が完了していないため、必要書類の算出・準備状況の変更を保留しています。
              <WorkspaceReadReloadButton />
            </InformationCard>
          </div>
        ) : requiredDocuments.length === 0 ? (
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
                      disabled={saving || requiresReload || !actorId}
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
