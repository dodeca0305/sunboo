'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import InformationCard from '@/components/InformationCard';
import type {
  WorkspaceTaxReviewCaseStatus,
  WorkspaceTaxReviewItem,
} from '@/lib/taxIntelligence/reviewCases';

const CASE_STATUS_LABEL: Record<WorkspaceTaxReviewCaseStatus, string> = {
  open: '未対応',
  resolved: '解決済み',
  dismissed: '対象外',
};

const SEVERITY_LABEL: Record<WorkspaceTaxReviewItem['severity'], string> = {
  info: '情報',
  warning: '注意',
  error: 'エラー',
  critical: '重大',
};

function formatDateTime(value: string | null): string {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default function WorkspaceTaxReviewView({
  companyId,
  initialItems,
  canManage,
}: {
  companyId: number;
  initialItems: WorkspaceTaxReviewItem[];
  canManage: boolean;
}) {
  const [items, setItems] = useState(initialItems);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [savingCaseId, setSavingCaseId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function updateCase(
    item: WorkspaceTaxReviewItem,
    status: WorkspaceTaxReviewCaseStatus,
  ) {
    const summary = (drafts[item.caseId] ?? '').trim();

    if ((status === 'resolved' || status === 'dismissed') && !summary) {
      setError('解決または対象外にする場合は、判断内容を入力してください。');
      return;
    }

    const supabase = createBrowserSupabase();
    if (!supabase) {
      setError('Supabaseに接続できません。');
      return;
    }

    setSavingCaseId(item.caseId);
    setError(null);

    const payload =
      status === 'open'
        ? { status: 'open' as const }
        : {
            status,
            resolution_summary: summary,
          };

    const { data, error: updateError } = await supabase
      .from('workspace_tax_review_cases')
      .update(payload)
      .eq('id', item.caseId)
      .eq('company_id', companyId)
      .select(
        'status, resolution_summary, resolved_by, resolved_at, updated_at',
      )
      .single();

    setSavingCaseId(null);

    if (updateError) {
      setError(`保存に失敗しました: ${updateError.message}`);
      return;
    }

    const updated = data as {
      status: WorkspaceTaxReviewCaseStatus;
      resolution_summary: string | null;
      resolved_by: string | null;
      resolved_at: string | null;
      updated_at: string;
    };

    setItems((prev) =>
      prev.map((row) =>
        row.caseId === item.caseId
          ? {
              ...row,
              caseStatus: updated.status,
              resolutionSummary: updated.resolution_summary,
              resolvedBy: updated.resolved_by,
              resolvedAt: updated.resolved_at,
              updatedAt: updated.updated_at,
            }
          : row,
      ),
    );

    if (status === 'open') {
      setDrafts((prev) => ({ ...prev, [item.caseId]: '' }));
    }
  }

  if (items.length === 0) {
    return (
      <div className="card py-10 text-center">
        <CheckCircle2 className="mx-auto h-6 w-6 text-sunboo-moss" />
        <p className="mt-3 text-sm font-semibold text-sunboo-ink">
          現在、確認が必要な税務レビューはありません
        </p>
        <p className="mt-1 text-xs text-sunboo-ink-muted">
          Tax IntelligenceのReviewCaseが作成されると、ここに表示されます。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <InformationCard kind="error">{error}</InformationCard>}

      {!canManage && (
        <InformationCard kind="info">
          閲覧権限のみのため、レビュー結果の変更はできません。
        </InformationCard>
      )}

      {items.map((item) => {
        const isOpen = item.caseStatus === 'open';
        const isSaving = savingCaseId === item.caseId;
        const StatusIcon =
          item.resultStatus === 'unknown' ? CircleHelp : AlertTriangle;

        return (
          <article key={item.caseId} className="card space-y-4">
            <div className="flex flex-wrap items-start gap-3">
              <StatusIcon
                className={`mt-0.5 h-5 w-5 shrink-0 ${
                  item.resultStatus === 'unknown'
                    ? 'text-gray-500'
                    : 'text-sunboo-morning-sun-dark'
                }`}
              />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold text-sunboo-ink">
                    {item.title}
                  </h2>
                  <span className="tag">{item.controlCode}</span>
                  <span className="tag">
                    {SEVERITY_LABEL[item.severity]}
                  </span>
                  <span
                    className={
                      item.caseStatus === 'open'
                        ? 'tag tag--caution'
                        : 'tag'
                    }
                  >
                    {CASE_STATUS_LABEL[item.caseStatus]}
                  </span>
                  <span className="tag">
                    {item.resultStatus === 'unknown' ? 'UNKNOWN' : 'REVIEW'}
                  </span>
                </div>

                <p className="mt-2 text-sm leading-relaxed text-sunboo-ink">
                  {item.issueSummary}
                </p>
              </div>
            </div>

            <div className="grid gap-2 rounded-lg bg-gray-50 p-3 text-xs text-sunboo-ink-muted sm:grid-cols-2">
              <p>
                <span className="font-medium text-sunboo-ink">Control:</span>{' '}
                {item.controlTitle} v{item.controlVersionNo}
              </p>
              <p>
                <span className="font-medium text-sunboo-ink">基準日:</span>{' '}
                {item.asOfDate}
              </p>
              <p>
                <span className="font-medium text-sunboo-ink">理由:</span>{' '}
                {item.reasonSummary}
              </p>
              <p>
                <span className="font-medium text-sunboo-ink">評価日時:</span>{' '}
                {formatDateTime(item.evaluatedAt)}
              </p>
            </div>

            {isOpen ? (
              canManage && (
                <div className="space-y-3 border-t border-gray-100 pt-4">
                  <label className="block">
                    <span className="form-label">判断・対応内容</span>
                    <textarea
                      value={drafts[item.caseId] ?? ''}
                      onChange={(event) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [item.caseId]: event.target.value,
                        }))
                      }
                      rows={3}
                      className="form-input"
                      placeholder="確認した内容や判断理由を記録してください"
                    />
                  </label>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => updateCase(item, 'resolved')}
                      className="btn-primary disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      解決済みにする
                    </button>

                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => updateCase(item, 'dismissed')}
                      className="btn-secondary disabled:opacity-50"
                    >
                      <XCircle className="h-4 w-4" />
                      対象外にする
                    </button>
                  </div>
                </div>
              )
            ) : (
              <div className="space-y-3 border-t border-gray-100 pt-4">
                <div className="rounded-lg bg-gray-50 p-3 text-sm">
                  <p className="font-medium text-sunboo-ink">
                    {item.caseStatus === 'resolved' ? '解決内容' : '対象外とした理由'}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sunboo-ink-muted">
                    {item.resolutionSummary}
                  </p>
                  <p className="mt-2 text-xs text-sunboo-ink-muted">
                    {item.resolvedBy ?? '-'} / {formatDateTime(item.resolvedAt)}
                  </p>
                </div>

                {canManage && (
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => updateCase(item, 'open')}
                    className="btn-secondary disabled:opacity-50"
                  >
                    <RotateCcw className="h-4 w-4" />
                    再オープン
                  </button>
                )}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
