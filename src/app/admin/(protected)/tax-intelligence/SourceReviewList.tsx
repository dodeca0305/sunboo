'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  AlertTriangle,
  CheckCircle2,
  FileSearch,
  XCircle,
} from 'lucide-react';

import type {
  TaxSourceChangeReviewItem,
} from '@/lib/taxIntelligence/sourceChangeReviews';
import SourceVersionDiffPanel from './SourceVersionDiffPanel';

import {
  closeTaxSourceReviewAction,
  type CloseTaxSourceReviewActionState,
} from './actions';

function formatDateTime(
  value: string | null,
): string {
  if (!value) return '-';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function SubmitButtons() {
  const { pending } = useFormStatus();

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="submit"
        name="status"
        value="resolved"
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-green-300"
      >
        <CheckCircle2 className="h-4 w-4" />
        {pending ? '保存中…' : '解決済みにする'}
      </button>

      <button
        type="submit"
        name="status"
        value="dismissed"
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
      >
        <XCircle className="h-4 w-4" />
        対象外にする
      </button>
    </div>
  );
}

function ReviewCard({
  item,
}: {
  item: TaxSourceChangeReviewItem;
}) {
  const initialState:
    CloseTaxSourceReviewActionState = {
      status: 'idle',
      message: '',
    };

  const [state, formAction] = useActionState(
    closeTaxSourceReviewAction,
    initialState,
  );

  const isOpen = item.status === 'open';

  return (
    <article className="card overflow-hidden">
      <div className="border-b border-gray-100 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-gray-900">
                ReviewCase {item.reviewId}
              </h3>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  isOpen
                    ? 'bg-amber-100 text-amber-800'
                    : item.status === 'resolved'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-700'
                }`}
              >
                {isOpen
                  ? '未対応'
                  : item.status === 'resolved'
                    ? '解決済み'
                    : '対象外'}
              </span>
            </div>

            <p className="mt-2 text-sm font-medium text-gray-800">
              {item.sourceTitle}
            </p>
            <p className="mt-1 break-all text-xs text-gray-500">
              {item.provider} / {item.canonicalLocator}
            </p>
          </div>

          <p className="text-xs text-gray-500">
            検知: {formatDateTime(item.detectedAt)}
          </p>
        </div>
      </div>

      <div className="space-y-5 p-5">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-gray-500">新版</dt>
            <dd className="mt-1 font-medium text-gray-900">
              {item.versionLabel ?? `ID ${item.taxSourceVersionId}`}
            </dd>
            <dd className="mt-1 break-all font-mono text-xs text-gray-500">
              {item.contentHash}
            </dd>
          </div>

          <div>
            <dt className="text-gray-500">前版</dt>
            <dd className="mt-1 font-medium text-gray-900">
              {item.supersedesVersionLabel
                ?? `ID ${item.supersedesSourceVersionId}`}
            </dd>
            <dd className="mt-1 break-all font-mono text-xs text-gray-500">
              {item.supersedesContentHash}
            </dd>
          </div>

          <div>
            <dt className="text-gray-500">適用開始日</dt>
            <dd className="mt-1 text-gray-900">
              {item.effectiveFrom ?? '-'}
            </dd>
          </div>

          <div>
            <dt className="text-gray-500">取得日時</dt>
            <dd className="mt-1 text-gray-900">
              {formatDateTime(item.retrievedAt)}
            </dd>
          </div>
        </dl>

        <SourceVersionDiffPanel diff={item.sourceDiff} />

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-gray-200 p-4">
            <h4 className="text-sm font-semibold text-gray-900">
              影響候補ルール
              <span className="ml-2 text-gray-500">
                {item.impact.ruleCandidates.length}件
              </span>
            </h4>

            {item.impact.ruleCandidates.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">
                候補なし
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {item.impact.ruleCandidates.map(
                  (rule) => (
                    <li
                      key={rule.id}
                      className="rounded-md bg-gray-50 p-3 text-sm"
                    >
                      <p className="font-medium text-gray-900">
                        {rule.ruleCode} v{rule.versionNo}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        Rule ID {rule.id} / {rule.status}
                      </p>
                    </li>
                  ),
                )}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-gray-200 p-4">
            <h4 className="text-sm font-semibold text-gray-900">
              影響候補コントロール
              <span className="ml-2 text-gray-500">
                {item.impact.controlCandidates.length}件
              </span>
            </h4>

            {item.impact.controlCandidates.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">
                候補なし
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {item.impact.controlCandidates.map(
                  (control) => (
                    <li
                      key={control.id}
                      className="rounded-md bg-gray-50 p-3 text-sm"
                    >
                      <p className="font-medium text-gray-900">
                        {control.controlCode} v{control.versionNo}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {control.status} /{' '}
                        {control.isEnabled
                          ? 'enabled'
                          : 'disabled'}
                      </p>
                      <p className="mt-1 break-all text-xs text-gray-500">
                        {control.evaluatorKey}
                      </p>
                    </li>
                  ),
                )}
              </ul>
            )}
          </div>
        </div>

        {isOpen ? (
          <form
            action={formAction}
            className="rounded-lg border border-amber-200 bg-amber-50 p-4"
          >
            <input
              type="hidden"
              name="reviewId"
              value={item.reviewId}
            />

            <label
              htmlFor={`resolution-${item.reviewId}`}
              className="text-sm font-semibold text-gray-900"
            >
              判断内容
            </label>
            <textarea
              id={`resolution-${item.reviewId}`}
              name="resolutionSummary"
              required
              rows={3}
              placeholder="確認した内容、影響の有無、対応方針を記録"
              className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />

            <div className="mt-3">
              <SubmitButtons />
            </div>

            {state.status !== 'idle' && (
              <p
                className={`mt-3 flex items-start gap-2 text-sm ${
                  state.status === 'success'
                    ? 'text-green-700'
                    : 'text-red-700'
                }`}
              >
                {state.status === 'success' ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                {state.message}
              </p>
            )}
          </form>
        ) : (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <p className="text-sm font-semibold text-gray-900">
              判断内容
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
              {item.resolutionSummary}
            </p>
            <p className="mt-3 text-xs text-gray-500">
              {item.resolvedBy ?? '-'} /{' '}
              {formatDateTime(item.resolvedAt)}
            </p>
          </div>
        )}
      </div>
    </article>
  );
}

export default function SourceReviewList({
  items,
}: {
  items: TaxSourceChangeReviewItem[];
}) {
  const openCount = items.filter(
    (item) => item.status === 'open',
  ).length;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Source変更レビュー
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            保存済みの変更影響と判断履歴
          </p>
        </div>

        <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1.5 text-sm font-semibold text-amber-800">
          <FileSearch className="h-4 w-4" />
          未対応 {openCount}件
        </span>
      </div>

      {items.length === 0 ? (
        <div className="card py-10 text-center">
          <CheckCircle2 className="mx-auto h-6 w-6 text-green-600" />
          <p className="mt-3 text-sm font-semibold text-gray-900">
            保存済みの変更レビューはありません
          </p>
          <p className="mt-1 text-xs text-gray-500">
            e-Govで新版を検知すると、ここに表示されます。
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <ReviewCard
              key={item.reviewId}
              item={item}
            />
          ))}
        </div>
      )}
    </section>
  );
}
