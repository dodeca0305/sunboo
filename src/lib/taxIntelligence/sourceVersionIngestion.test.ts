import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeTaxSourceText,
  prepareTaxSourceContent,
} from './sourceVersionIngestion.ts';

test('改行・行末空白・末尾改行を決定的に正規化する', () => {
  assert.equal(
    normalizeTaxSourceText(
      'first  \r\nsecond\t\rthird\n\n\n',
    ),
    'first\nsecond\nthird',
  );
});

test('行頭空白・文章内の連続空白・空行は保持する', () => {
  assert.equal(
    normalizeTaxSourceText(
      '  first  value\n\nsecond value',
    ),
    '  first  value\n\nsecond value',
  );
});

test('UnicodeをNFCへ統一する', () => {
  const decomposed = 'ポイント';
  const composed = 'ポイント';

  assert.equal(
    prepareTaxSourceContent(decomposed).contentHash,
    prepareTaxSourceContent(composed).contentHash,
  );
});

test('正規化後に空となる入力は拒否する', () => {
  assert.throws(
    () => normalizeTaxSourceText(' \t\r\n\t'),
    /空にはできません/,
  );
});

test('同じ正規化結果から同じSHA-256を生成する', () => {
  const first = prepareTaxSourceContent(
    'source=C1-1\r\ntopic=corporate-tax-filing  ',
  );
  const second = prepareTaxSourceContent(
    'source=C1-1\ntopic=corporate-tax-filing\n\n',
  );

  assert.equal(first.normalizedText, second.normalizedText);
  assert.equal(first.contentHash, second.contentHash);
  assert.match(first.contentHash, /^[a-f0-9]{64}$/);
});

test('既存NTA seedと同じcontent_hashを生成する', () => {
  const content = prepareTaxSourceContent(
    [
      'source=C1-1',
      'topic=corporate-tax-filing',
      'general_due_rule=business-year-end-next-day+2-months',
      'extension_rule=use-extended-deadline-if-approved',
      'holiday_rule=next-day-when-deadline-falls-on-weekend-or-national-holiday',
    ].join('\n'),
  );

  assert.equal(
    content.contentHash,
    'bb1824ef6cb588a16f2cf2047c021f79ea5dce8136d94f52397a18d744053cc5',
  );
});
