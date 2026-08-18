import {
  GitCompareArrows,
  Plus,
  Minus,
  RefreshCw,
} from 'lucide-react';

import type {
  TaxSourceArticleDiff,
  TaxSourceVersionDiff,
} from '@/lib/taxIntelligence/sourceVersionDiff';

const STATUS_LABEL = {
  changed: '変更',
  added: '追加',
  removed: '削除',
  unchanged: '変更なし',
} as const;

function articleLabel(
  articleNumber: string,
): string {
  const [main, ...sub] =
    articleNumber.split('_');

  if (sub.length === 0) {
    return `第${main}条`;
  }

  return `第${main}条の${sub.join('の')}`;
}

function DiffText({
  title,
  text,
  kind,
}: {
  title: string;
  text: string | null;
  kind: 'before' | 'after';
}) {
  const isBefore = kind === 'before';

  return (
    <div
      className={`min-w-0 rounded-lg border ${
        isBefore
          ? 'border-red-200 bg-red-50'
          : 'border-green-200 bg-green-50'
      }`}
    >
      <div
        className={`flex items-center gap-2 border-b px-3 py-2 text-xs font-semibold ${
          isBefore
            ? 'border-red-200 text-red-800'
            : 'border-green-200 text-green-800'
        }`}
      >
        {isBefore ? (
          <Minus className="h-3.5 w-3.5" />
        ) : (
          <Plus className="h-3.5 w-3.5" />
        )}
        {title}
      </div>

      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words p-3 font-sans text-xs leading-6 text-gray-800">
        {text ?? '該当条文なし'}
      </pre>
    </div>
  );
}

function ChangedArticle({
  article,
}: {
  article: TaxSourceArticleDiff;
}) {
  const badgeClass =
    article.status === 'added'
      ? 'bg-green-100 text-green-800'
      : article.status === 'removed'
        ? 'bg-red-100 text-red-800'
        : 'bg-blue-100 text-blue-800';

  const Icon =
    article.status === 'added'
      ? Plus
      : article.status === 'removed'
        ? Minus
        : RefreshCw;

  return (
    <li className="rounded-lg border border-gray-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold text-gray-900">
          {articleLabel(article.articleNumber)}
        </h4>

        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClass}`}
        >
          <Icon className="h-3.5 w-3.5" />
          {STATUS_LABEL[article.status]}
        </span>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <DiffText
          title="前版"
          text={article.beforeText}
          kind="before"
        />
        <DiffText
          title="新版"
          text={article.afterText}
          kind="after"
        />
      </div>
    </li>
  );
}

export default function SourceVersionDiffPanel({
  diff,
}: {
  diff: TaxSourceVersionDiff;
}) {
  const changedArticles =
    diff.articles.filter(
      (article) =>
        article.status !== 'unchanged',
    );

  return (
    <details
      className="rounded-lg border border-blue-200 bg-blue-50"
      open={diff.hasChanges}
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-4">
        <span className="inline-flex items-center gap-2 font-semibold text-gray-900">
          <GitCompareArrows className="h-5 w-5 text-blue-600" />
          条文差分
        </span>

        <span className="flex flex-wrap gap-2 text-xs font-medium">
          <span className="rounded-full bg-blue-100 px-2.5 py-1 text-blue-800">
            変更 {diff.changedCount}
          </span>
          <span className="rounded-full bg-green-100 px-2.5 py-1 text-green-800">
            追加 {diff.addedCount}
          </span>
          <span className="rounded-full bg-red-100 px-2.5 py-1 text-red-800">
            削除 {diff.removedCount}
          </span>
          <span className="rounded-full bg-white px-2.5 py-1 text-gray-600">
            変更なし {diff.unchangedCount}
          </span>
        </span>
      </summary>

      <div className="border-t border-blue-200 p-4">
        {changedArticles.length === 0 ? (
          <p className="text-sm text-gray-600">
            対象条文の本文差分はありません。
          </p>
        ) : (
          <ul className="space-y-3">
            {changedArticles.map((article) => (
              <ChangedArticle
                key={article.articleNumber}
                article={article}
              />
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
