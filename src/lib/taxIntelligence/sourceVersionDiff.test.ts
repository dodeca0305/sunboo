import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTaxSourceVersionDiff,
} from './sourceVersionDiff.ts';

function article(
  number: string,
  text: string,
): string {
  return [
    `[Article Num="${number}"]`,
    text,
  ].join('\n');
}

test('同一条文群はすべてunchangedになる', () => {
  const text = [
    article('74', '第七十四条 本文'),
    article('75', '第七十五条 本文'),
  ].join('\n');

  const result =
    buildTaxSourceVersionDiff(
      text,
      text,
    );

  assert.equal(result.hasChanges, false);
  assert.equal(result.unchangedCount, 2);
  assert.equal(result.changedCount, 0);
  assert.deepEqual(
    result.articles.map((item) => item.status),
    ['unchanged', 'unchanged'],
  );
});

test('同じArticle番号の本文変更を検出する', () => {
  const result =
    buildTaxSourceVersionDiff(
      article('74', '第七十四条 旧本文'),
      article('74', '第七十四条 新本文'),
    );

  assert.equal(result.hasChanges, true);
  assert.equal(result.changedCount, 1);
  assert.deepEqual(result.articles[0], {
    articleNumber: '74',
    status: 'changed',
    beforeText: '第七十四条 旧本文',
    afterText: '第七十四条 新本文',
  });
});

test('Articleの追加と削除を区別する', () => {
  const before = [
    article('74', '本文74'),
    article('75_2', '旧本文75の2'),
  ].join('\n');

  const after = [
    article('74', '本文74'),
    article('75', '新規本文75'),
  ].join('\n');

  const result =
    buildTaxSourceVersionDiff(
      before,
      after,
    );

  assert.deepEqual(
    result.articles.map((item) => [
      item.articleNumber,
      item.status,
    ]),
    [
      ['74', 'unchanged'],
      ['75', 'added'],
      ['75_2', 'removed'],
    ],
  );
  assert.equal(result.addedCount, 1);
  assert.equal(result.removedCount, 1);
});

test('Article番号の自然順で並べる', () => {
  const before = [
    article('75_3', '本文75の3'),
    article('74', '本文74'),
    article('75_2', '本文75の2'),
    article('75', '本文75'),
  ].join('\n');

  const result =
    buildTaxSourceVersionDiff(
      before,
      before,
    );

  assert.deepEqual(
    result.articles.map(
      (item) => item.articleNumber,
    ),
    ['74', '75', '75_2', '75_3'],
  );
});

test('Article markerの重複を拒否する', () => {
  assert.throws(
    () =>
      buildTaxSourceVersionDiff(
        [
          article('74', '本文A'),
          article('74', '本文B'),
        ].join('\n'),
        article('74', '本文C'),
      ),
    /Article 74が重複しています/,
  );
});

test('Article markerより前の本文を拒否する', () => {
  assert.throws(
    () =>
      buildTaxSourceVersionDiff(
        [
          '不正な前置き',
          article('74', '本文'),
        ].join('\n'),
        article('74', '本文'),
      ),
    /Article markerより前の本文/,
  );
});
