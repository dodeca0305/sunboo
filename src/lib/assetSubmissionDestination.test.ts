import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ASSET_WARDS,
  KITAKYUSHU_WARDS,
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

const KITA: Array<[string, string]> = [
  ['401013', '門司区'],
  ['401030', '若松区'],
  ['401056', '戸畑区'],
  ['401064', '小倉北区'],
  ['401072', '小倉南区'],
  ['401081', '八幡東区'],
  ['401099', '八幡西区'],
];

test('北九州市7区は正確なコードで同じ窓口・出典・様式案内を返す', () => {
  assert.equal(KITAKYUSHU_WARDS.length, 7);
  for (const [code, label] of KITA) {
    const d = lookupAssetSubmissionDestination(code);
    assert.ok(d, code);
    assert.equal(d.wardLabel, label);
    assert.equal(d.cityLabel, '北九州市');
    assert.equal(d.officeName, '北九州市 財政・変革局 税務部 固定資産税課 償却資産係（市役所6階）');
    assert.equal(d.postalCode, '803-8501');
    assert.equal(d.address, '福岡県北九州市小倉北区城内1番1号');
    assert.equal(d.phone, '093-582-3210');
    assert.equal(d.officialUrl, 'https://www.city.kitakyushu.lg.jp/contents/924_00364.html');
    assert.equal(d.sourceCheckedOn, '2026-11-18');
    assert.match(d.note, /区ごとの書類/);
    assert.ok(d.formNotice);
    assert.equal(d.formNotice.text, '令和9年度の様式は公開を確認できていません（2026/11/18確認）。');
    assert.equal(d.formNotice.url, 'https://www.city.kitakyushu.lg.jp/contents/division260list.html');
    assert.doesNotMatch(JSON.stringify(d), /福岡市|期限|締切|1月31日/);
  }
});

test('様式案内は北九州市のみ・福岡市は従来の窓口と日付のまま・R8ページをR9として使わない', () => {
  for (const w of ASSET_WARDS) {
    const d = lookupAssetSubmissionDestination(w.code);
    assert.ok(d);
    assert.equal(d.formNotice, undefined);
    assert.equal(d.cityLabel, '福岡市');
    assert.equal(d.sourceCheckedOn, '2026-11-16');
    assert.equal(d.officialUrl, ASSET_DESTINATION_OFFICIAL_URL);
  }
  const k = lookupAssetSubmissionDestination('401064');
  assert.ok(k?.formNotice);
  assert.doesNotMatch(k.formNotice.url, /26000004|\.pdf/i);
});

test('福岡の修正済みコードと北九州の不正コード・市集計', () => {
  assert.equal(lookupAssetSubmissionDestination('401358')?.wardLabel, '西区');
  assert.equal(lookupAssetSubmissionDestination('401366')?.wardLabel, '城南区');
  assert.equal(lookupAssetSubmissionDestination('401374')?.wardLabel, '早良区');
  for (const v of ['401005', '401000', '401013 ', ' 401013', '40101', '４０１０１３', 401013, '401099\n', '401102'])
    assert.equal(lookupAssetSubmissionDestination(v), null, String(v));
});

test('コンポーネント：北九州optgroup・市別リンク名・様式案内は安全な別タブ・保存/通信なし', () => {
  const comp = readFileSync(new URL('../components/AssetSubmissionDestination.tsx', import.meta.url), 'utf8');
  assert.match(comp, /<optgroup label="北九州市">/);
  assert.match(comp, /destination\.cityLabel\}の公式案内を開く/);
  assert.match(comp, /destination\.formNotice &&/);
  assert.equal((comp.match(/rel="noopener noreferrer"/g) ?? []).length, 2);
  assert.doesNotMatch(comp, /福岡市の公式案内|localStorage|sessionStorage|fetch\(|props\.company/);
  assert.match(comp, /disabled=\{disabled\}/);
});
