'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import InformationCard from '@/components/InformationCard';
import TaxReviewActionPicker from '@/components/TaxReviewActionPicker';
import { groupReviewItems, reviewNextAction } from '@/lib/taxIntelligence/reviewPresentation';
import type {
  WorkspaceTaxReviewCaseStatus,
  WorkspaceTaxReviewItem,
} from '@/lib/taxIntelligence/reviewCases';

const CASE_STATUS_LABEL: Record<WorkspaceTaxReviewCaseStatus, string> = {
  open: '未対応',
  resolved: '解決済み',
  dismissed: '対象外',
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

function ReviewReason({ item }: { item: WorkspaceTaxReviewItem }) {
  return (
                    <dl className="grid gap-3 text-xs sm:grid-cols-2">
                      <div className="sm:col-span-2"><dt className="font-medium">確認する理由</dt><dd className="mt-1 whitespace-pre-wrap text-sunboo-ink-muted">{item.reasonSummary}</dd></div>
                      <div><dt className="font-medium">チェックの種類</dt><dd className="mt-1 text-sunboo-ink-muted">{item.controlTitle}（{item.controlCode} / 版{item.controlVersionNo}）</dd></div>
                      <div><dt className="font-medium">判定の状態</dt><dd className="mt-1 text-sunboo-ink-muted">{item.resultStatus === 'unknown' ? '情報などが足りず、判断できません' : '内容の確認が必要です'}</dd></div>
                      <div><dt className="font-medium">判定の基準日</dt><dd className="mt-1 text-sunboo-ink-muted">{item.asOfDate}</dd></div>
                      <div><dt className="font-medium">チェックした日時</dt><dd className="mt-1 text-sunboo-ink-muted">{formatDateTime(item.evaluatedAt)}</dd></div>
                    </dl>
  );
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
  const router = useRouter();
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

    try {
      const { data, error: updateError } = await supabase
        .from('workspace_tax_review_cases')
        .update(payload)
        .eq('id', item.caseId)
        .eq('company_id', companyId)
        .select(
          'status, resolution_summary, resolved_by, resolved_at, updated_at',
        )
        .single();

      if (updateError) {
        setError(`保存に失敗しました: ${updateError.message}`);
        return;
      }

      if (!data) {
        setError('保存結果を確認できませんでした。再読み込みして状態を確認してください。');
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

      // 見出しの未対応件数はServer Componentで集計しているため再取得する。
      router.refresh();
    } catch {
      setError('保存結果を確認できませんでした。通信状態を確認し、再読み込みして状態を確認してください。');
    } finally {
      setSavingCaseId(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="card border border-gray-200 bg-gray-50 py-8 text-center">
        <p className="mt-3 text-sm font-semibold text-sunboo-ink">
          確認する項目はまだ登録されていません
        </p>
        <p className="mt-1 text-xs text-sunboo-ink-muted">
          チェック前でも0件になります。「税務上の問題なし」という意味ではありません。
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

      <p className="text-xs text-sunboo-ink-muted">
        確認の重要度順です。申告・納付の期限順ではありません。
      </p>
      {groupReviewItems(items).map((section) => (
        <section key={section.id} aria-labelledby={`review-section-${section.id}`} className="space-y-3" data-testid={`review-section-${section.id}`}>
          <h2 id={`review-section-${section.id}`} className={`rounded-lg border px-4 py-3 text-sm font-semibold ${section.tone}`}>
            {section.title} <span className="ml-2 tabular-nums">{section.items.length}件</span>
          </h2>
          {section.items.map((item) => {
            const isOpen = item.caseStatus === 'open';
            const isSaving = savingCaseId === item.caseId;
            return (
              <article key={item.caseId} className="card space-y-3" data-testid={`review-case-${item.caseId}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-sunboo-ink">{item.title}</h3>
                  <span className="tag">{CASE_STATUS_LABEL[item.caseStatus]}</span>
                </div>
                {isOpen && (
                  <div className="space-y-1 text-sm">
                    <p className="font-medium text-sunboo-ink">{reviewNextAction(item)}</p>
                    <p className="whitespace-pre-wrap text-sunboo-ink-muted">{item.issueSummary}</p>
                  </div>
                )}
                <details className="rounded-lg border border-gray-200 p-3">
                  <summary className="cursor-pointer text-sm font-medium text-sunboo-ink">
                    {isOpen ? '次にすることを選ぶ' : '記録した内容を見る'}
                  </summary>
                  <div className="mt-4 space-y-4">
                    {isOpen ? (
                      <>
                        <TaxReviewActionPicker companyId={companyId} canEdit={canManage} consultationSubject={item.title}>
                          <ReviewReason item={item} />
                        </TaxReviewActionPicker>
                        {canManage && (
                          <details className="rounded-lg border border-gray-200 p-3">
                            <summary className="cursor-pointer text-sm font-medium">対応した内容を記録する</summary>
                      <div className="space-y-3 border-t border-gray-100 pt-4">
                        <label className="block">
                          <span className="form-label">判断・対応内容</span>
                          <textarea value={drafts[item.caseId] ?? ''} onChange={(event) => setDrafts((prev) => ({ ...prev, [item.caseId]: event.target.value }))}
                            rows={3} className="form-input" placeholder="確認した内容や判断理由を記録してください" />
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" disabled={isSaving} onClick={() => updateCase(item, 'resolved')} className="btn-primary disabled:opacity-50">解決済みにする</button>
                          <button type="button" disabled={isSaving} onClick={() => updateCase(item, 'dismissed')} className="btn-secondary disabled:opacity-50">対象外にする</button>
                        </div>
                      </div>

                          </details>
                        )}
                      </>
                    ) : (
                      <>
                          <ReviewReason item={item} />
                      <div className="space-y-3 border-t border-gray-100 pt-4">
                        <div className="rounded-lg bg-gray-50 p-3 text-sm">
                          <p className="font-medium text-sunboo-ink">{item.caseStatus === 'resolved' ? '解決内容' : '対象外とした理由'}</p>
                          <p className="mt-1 whitespace-pre-wrap text-sunboo-ink-muted">{item.resolutionSummary}</p>
                          <p className="mt-2 text-xs text-sunboo-ink-muted">{item.resolvedBy ?? '-'} / {formatDateTime(item.resolvedAt)}</p>
                        </div>
                        {canManage && <button type="button" disabled={isSaving} onClick={() => updateCase(item, 'open')} className="btn-secondary disabled:opacity-50">再オープン</button>}
                      </div>

                      </>
                    )}
                  </div>
                </details>
              </article>
            );
          })}
        </section>
      ))}
    </div>
  );
}
