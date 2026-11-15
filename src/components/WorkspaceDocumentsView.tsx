'use client';

import { useEffect, useRef, useState } from 'react';
import WorkspaceDocumentEditor from './WorkspaceDocumentEditor';
import type { DocumentSnapshotMap } from '@/lib/workspaceDocumentTiming';
import { CheckCircle2, Circle, CalendarClock, FileText, LoaderCircle } from 'lucide-react';
import {
  groupRequiredDocumentsByNearestDue,
  requiredDocumentNextAction,
} from '@/lib/workspaceDocumentPresentation';
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
// 表示の並べ替え・分割は workspaceDocumentPresentation（期限と書類名のみに依存）で行う。

const DETAILS_CLASS = 'rounded-lg border border-sunboo-mist';
const SUMMARY_CLASS = 'min-h-11 cursor-pointer px-4 py-3 text-sm font-bold text-sunboo-ink [overflow-wrap:anywhere]';

function RequiredDocumentCard({
  document, status, disabled, primary, onChange,
}: {
  document: WorkspaceRequiredDocument;
  status: WorkspaceRequiredDocumentStatus;
  disabled: boolean;
  primary: boolean;
  onChange: (status: WorkspaceRequiredDocumentStatus) => void;
}) {
  const action = requiredDocumentNextAction(status);
  const PreparationIcon = status === 'ready' ? CheckCircle2 : status === 'in_progress' ? LoaderCircle : Circle;
  const iconClass = status === 'ready' ? 'text-sunboo-moss' : status === 'in_progress' ? 'text-sunboo-morning-sun-dark' : 'text-sunboo-mist';
  return (
    <li className={`card space-y-3 py-4 ${primary ? 'border-2 border-sunboo-ink' : ''}`} data-testid="required-document-card" data-document-name={document.name}>
      <div className="flex items-start gap-2">
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-sunboo-moss" aria-hidden="true" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-sunboo-ink [overflow-wrap:anywhere]">
            {document.name}
            {document.formNumber && (
              <span className="ml-2 text-xs font-normal text-sunboo-ink-muted">様式 {document.formNumber}</span>
            )}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-sunboo-ink-muted [overflow-wrap:anywhere]">
            使用する手続き：{document.procedures.join('、')}
          </p>
        </div>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-sunboo-morning-sun-dark">
        <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        手続きの期限：{document.nearestDueDate}
      </p>
      <label className="block text-xs font-semibold text-sunboo-ink">
        <span className="flex items-center gap-1.5">
          <PreparationIcon className={`h-4 w-4 ${iconClass}`} aria-hidden="true" />
          準備状況
        </span>
        <select
          value={status}
          disabled={disabled}
          aria-label={`${document.name}の準備状況`}
          onChange={(event) => onChange(event.target.value as WorkspaceRequiredDocumentStatus)}
          className="form-select mt-1 min-h-11 w-full text-sm"
        >
          {action === null && (
            <option value={String(status)} disabled>確認が必要</option>
          )}
          {WORKSPACE_REQUIRED_DOCUMENT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {WORKSPACE_REQUIRED_DOCUMENT_STATUS_LABEL[value]}
            </option>
          ))}
        </select>
      </label>
      <div role="status" data-testid="required-document-next-action" className="rounded-md bg-sunboo-warm-paper px-3 py-2">
        <span className="block text-xs text-sunboo-ink-muted">次にすること</span>
        <strong className="block text-sm text-sunboo-ink [overflow-wrap:anywhere]">
          {action ?? '準備状況を確認できないため、次にすることは表示していません。'}
        </strong>
      </div>
    </li>
  );
}

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

  const controlsDisabled = saving || requiresReload || !actorId;
  const grouped = requiredDocuments ? groupRequiredDocumentsByNearestDue(requiredDocuments) : null;
  const statusOf = (name: string) => localRequiredStatusMap[name] ?? 'not_ready';
  const renderCards = (docs: WorkspaceRequiredDocument[], primary: boolean) => (
    <ul className="space-y-3">
      {docs.map((document) => (
        <RequiredDocumentCard
          key={document.name}
          document={document}
          status={statusOf(document.name)}
          primary={primary}
          disabled={controlsDisabled}
          onChange={(status) => { void handleRequiredStatusChange(document.name, status); }}
        />
      ))}
    </ul>
  );

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert">
          <InformationCard kind="error">
            {error}
            <a className="mt-2 block underline" href={`/admin/workspaces/${companyId}/documents`}>再読み込み</a>
          </InformationCard>
        </div>
      )}
      {saving && <p role="status" className="text-xs text-sunboo-ink-muted">保存中…</p>}

      <section className="space-y-3" aria-labelledby="required-documents-heading">
        <h2 id="required-documents-heading" className="text-base font-bold text-sunboo-ink">まず用意する書類</h2>

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
          <InformationCard kind="info">
            現在のロードマップでは、未完了の手続きで必要な必須書類は見つかりませんでした。手続きがないという意味ではありません。
          </InformationCard>
        ) : (
          <>
            {renderCards(grouped!.primary, true)}
            <p className="text-xs leading-relaxed text-sunboo-ink-muted">
              用意できたら「準備済み」にします。準備済みは提出済みではありません。
            </p>
            <p className="text-xs leading-relaxed text-sunboo-ink-muted">
              準備状況は書類名ごとの共通記録で、年度ごとの提出済み記録ではありません。
            </p>
          </>
        )}
      </section>

      {grouped && grouped.later.length > 0 && (
        <details className={DETAILS_CLASS} data-testid="later-documents">
          <summary className={SUMMARY_CLASS}>このあとに用意する書類（{grouped.later.length}種類）</summary>
          <div className="px-4 pb-4">{renderCards(grouped.later, false)}</div>
        </details>
      )}

      <details className={DETAILS_CLASS} data-testid="document-records">
        <summary className={SUMMARY_CLASS}>定款など、手元の書類の記録</summary>
        <div className="space-y-3 px-4 pb-4">
          <InformationCard kind="info" title="いつの書類か、手元の書類で確認してください">
            <p>書類の状態と、原本で確認した対象期間・発行日を記録できます。不明な時期は空欄のまま残せます。</p>
            <p className="mt-2">「記録済み」でも、今年分・最新版・提出済みとは限りません。申告書は対象期間、登記簿謄本は発行日を、原本で確認してください。</p>
            <p className="mt-2"><strong>記録なしは、書類が手元にないという意味ではありません。</strong></p>
            <p className="mt-2">ファイルの添付や行政機関への提出は行いません。</p>
          </InformationCard>
          <p className="text-sm font-medium" role="status">{Object.values(confirmed).filter(row => row?.status === 'registered').length}/5件記録済み</p>
          <ul className="space-y-2">
            {WORKSPACE_DOCUMENT_TYPES.map(documentType => <WorkspaceDocumentEditor
              key={`${companyId}:${documentType}:${actorId ?? 'checking'}`}
              companyId={companyId} documentType={documentType} initial={snapshots[documentType] ?? null}
              actorId={actorId} disabled={saving || requiresReload || !actorId} onSafetyBlock={() => setRequiresReload(true)} onConfirmed={snapshot => setConfirmed(previous => ({...previous,[documentType]:snapshot}))}
            />)}
          </ul>
        </div>
      </details>
    </div>
  );
}
