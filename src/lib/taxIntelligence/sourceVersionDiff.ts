export type TaxSourceArticleDiffStatus =
  | 'unchanged'
  | 'changed'
  | 'added'
  | 'removed';

export type TaxSourceArticleDiff = {
  articleNumber: string;
  status: TaxSourceArticleDiffStatus;
  beforeText: string | null;
  afterText: string | null;
};

export type TaxSourceVersionDiff = {
  articles: TaxSourceArticleDiff[];
  unchangedCount: number;
  changedCount: number;
  addedCount: number;
  removedCount: number;
  hasChanges: boolean;
};

type ParsedArticle = {
  articleNumber: string;
  text: string;
};

const ARTICLE_MARKER =
  /^\[Article Num="([^"]+)"\]$/;

function compareArticleNumbers(
  left: string,
  right: string,
): number {
  const leftParts =
    left.split('_').map(Number);
  const rightParts =
    right.split('_').map(Number);

  const areNumeric = [
    ...leftParts,
    ...rightParts,
  ].every(Number.isFinite);

  if (!areNumeric) {
    return left.localeCompare(
      right,
      'ja',
      { numeric: true },
    );
  }

  const length = Math.max(
    leftParts.length,
    rightParts.length,
  );

  for (let index = 0; index < length; index += 1) {
    const difference =
      (leftParts[index] ?? 0)
      - (rightParts[index] ?? 0);

    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

function parseArticles(
  normalizedText: string,
  label: string,
): ParsedArticle[] {
  if (!normalizedText) {
    throw new Error(
      `${label}のnormalized_textが空です。`,
    );
  }

  const articles: ParsedArticle[] = [];
  const seenNumbers = new Set<string>();
  const lines = normalizedText.split('\n');

  let currentNumber: string | null = null;
  let currentLines: string[] = [];

  function finishCurrentArticle() {
    if (currentNumber === null) return;

    articles.push({
      articleNumber: currentNumber,
      text: currentLines.join('\n'),
    });
  }

  for (const line of lines) {
    const marker = line.match(ARTICLE_MARKER);

    if (marker) {
      finishCurrentArticle();

      const articleNumber = marker[1];

      if (seenNumbers.has(articleNumber)) {
        throw new Error(
          `${label}にArticle ${articleNumber}が重複しています。`,
        );
      }

      seenNumbers.add(articleNumber);
      currentNumber = articleNumber;
      currentLines = [];
      continue;
    }

    if (currentNumber === null) {
      if (line.trim().length > 0) {
        throw new Error(
          `${label}にArticle markerより前の本文があります。`,
        );
      }

      continue;
    }

    currentLines.push(line);
  }

  finishCurrentArticle();

  if (articles.length === 0) {
    throw new Error(
      `${label}にArticleがありません。`,
    );
  }

  return articles;
}

export function buildTaxSourceVersionDiff(
  beforeNormalizedText: string,
  afterNormalizedText: string,
): TaxSourceVersionDiff {
  const beforeArticles = parseArticles(
    beforeNormalizedText,
    '前版',
  );
  const afterArticles = parseArticles(
    afterNormalizedText,
    '新版',
  );

  const beforeByNumber = new Map(
    beforeArticles.map((article) => [
      article.articleNumber,
      article,
    ]),
  );
  const afterByNumber = new Map(
    afterArticles.map((article) => [
      article.articleNumber,
      article,
    ]),
  );

  const articleNumbers = [
    ...new Set([
      ...beforeByNumber.keys(),
      ...afterByNumber.keys(),
    ]),
  ].sort(compareArticleNumbers);

  const articles = articleNumbers.map(
    (articleNumber): TaxSourceArticleDiff => {
      const before =
        beforeByNumber.get(articleNumber);
      const after =
        afterByNumber.get(articleNumber);

      if (!before && after) {
        return {
          articleNumber,
          status: 'added',
          beforeText: null,
          afterText: after.text,
        };
      }

      if (before && !after) {
        return {
          articleNumber,
          status: 'removed',
          beforeText: before.text,
          afterText: null,
        };
      }

      if (!before || !after) {
        throw new Error(
          `Article ${articleNumber}の差分状態が不正です。`,
        );
      }

      return {
        articleNumber,
        status:
          before.text === after.text
            ? 'unchanged'
            : 'changed',
        beforeText: before.text,
        afterText: after.text,
      };
    },
  );

  const count = (
    status: TaxSourceArticleDiffStatus,
  ) =>
    articles.filter(
      (article) => article.status === status,
    ).length;

  const changedCount = count('changed');
  const addedCount = count('added');
  const removedCount = count('removed');

  return {
    articles,
    unchangedCount: count('unchanged'),
    changedCount,
    addedCount,
    removedCount,
    hasChanges:
      changedCount > 0
      || addedCount > 0
      || removedCount > 0,
  };
}
