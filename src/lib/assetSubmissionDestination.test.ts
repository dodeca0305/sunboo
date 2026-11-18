import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ASSET_WARDS,
  ASSET_DESTINATION_OFFICIAL_URL,
  lookupAssetSubmissionDestination,
} from './assetSubmissionDestination.ts';

const EXPECTED: Array<[string, string]> = [
  ['401315', '東区'],
  ['401323', '博多区'],
  ['401331', '中央区'],
  ['401340', '南区'],
  ['401358', '西区'],
  ['401366', '城南区'],
  ['401374', '早良区'],
];

test('福岡市7区は正確なコードで同じ提出先を返す', () => {
  assert.equal(ASSET_WARDS.length, 7);
  for (const [code, label] of EXPECTED) {
    const d = lookupAssetSubmissionDestination(code);
    assert.ok(d, code);
    assert.equal(d.wardLabel, label);
    assert.equal(d.cityLabel, '福岡市');
    assert.equal(d.officeName, '福岡市 財政局 資産課税課（博多区役所 9階）');
    assert.doesNotMatch(d.officeName, /資産税課/);
    assert.equal(d.postalCode, '812-8512');
    assert.equal(d.address, '福岡県福岡市博多区博多駅前2丁目8番1号');
    assert.equal(d.phone, '092-292-2479');
    assert.equal(d.officialUrl, ASSET_DESTINATION_OFFICIAL_URL);
    assert.match(d.note, /区ごとの申告書/);
  }
});

test('空・未知・不正形式・他地域はnull（会社所在地への代替なし）', () => {
  const bad: unknown[] = [
    '', ' ', 'other', '130010', '131016', '401005', '401307', '40131', '4013155',
    ' 401315', '401315 ', '４０１３１５', '401315\n', 401315, null, undefined, {}, [], '401323x',
  ];
  for (const v of bad) assert.equal(lookupAssetSubmissionDestination(v), null, String(v));
});

test('出典情報と期限の非引用', () => {
  const d = lookupAssetSubmissionDestination('401331');
  assert.ok(d);
  assert.equal(d.sourceCheckedOn, '2026-11-16');
  assert.match(d.officialUrl, /^https:\/\/www\.city\.fukuoka\.lg\.jp\//);
  assert.doesNotMatch(JSON.stringify(d), /期限|締切|1月31日/);
});

test('統合：ゲートは編集可能かつ償却資産申告のみ／他手続は従来のまま', () => {
  const road = readFileSync(new URL('../components/AnnualRoadmapView.tsx', import.meta.url), 'utf8');
  assert.match(road, /showAssetDestination\s*=\s*editable\s*&&\s*item\.procedure\.code\s*===\s*'DEPRECIABLE_ASSET_TAX_RETURN'/);
  assert.match(road, /<AssetSubmissionDestination/);
  assert.match(road, /!showAssetDestination\s*&&\s*trialExecutionLinks\(item\.procedure\)/);
  assert.match(road, /\{!showAssetDestination && <div>\s*<SectionLabel>提出先/);
  assert.equal((road.match(/<AssetSubmissionDestination/g) ?? []).length, 1);
  assert.match(road, /!showAssetDestination\s*&&\s*<RoadmapNextAction/);
  assert.match(road, /<ElectronicFilingEntry procedure=\{item\.procedure\} \/>/);
  const draft = readFileSync(new URL('../components/DepreciationDocumentDraft.tsx', import.meta.url), 'utf8');
  assert.equal((draft.match(/<AssetSubmissionDestination/g) ?? []).length, 1);
  assert.match(draft, /disabled=\{busy\}/);
  const comp = readFileSync(new URL('../components/AssetSubmissionDestination.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(comp, /localStorage|sessionStorage|fetch\(|XMLHttpRequest|sendBeacon/);
});
