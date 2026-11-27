import test from 'node:test';
import assert from 'node:assert/strict';
import { ASSET_CITY_GROUPS, lookupAssetSubmissionDestination } from './assetSubmissionDestination.ts';

test('確認済み10市の全区だけに利用条件を出し、残る市へ代用しない', () => {
  const cities = ['福岡市', '北九州市', 'さいたま市', '千葉市', '静岡市', '浜松市', '名古屋市', '京都市', '神戸市', '札幌市'];
  let covered = 0;
  for (const group of ASSET_CITY_GROUPS) for (const ward of group.wards) {
    const d = lookupAssetSubmissionDestination(ward.code)!;
    assert.equal(Boolean(d.formPreparation), cities.includes(group.cityLabel), group.cityLabel);
    if (!d.formPreparation) continue;
    covered++;
    assert.match(d.formPreparation.sourceUrl, /^https:\/\/www\.city\.[^/]+\/.+\.pdf$/);
    assert.match(d.formPreparation.sourcePages, /ページ/);
    assert.match(d.formNotice!.text, /令和9年度に使えるか確認中/);
    assert.doesNotMatch(JSON.stringify(d.formPreparation), /令和9年度.*使えます|提出準備完了/);
  }
  assert.equal(covered, 82);
  assert.equal(lookupAssetSubmissionDestination('other'), null);
});

test('郵送の同封条件と電子申告の例外を残す', () => {
  const nagoya = lookupAssetSubmissionDestination('231011')!.formPreparation!;
  assert.match(nagoya.items.join(''), /二次元コードがある場合.*同封.*電子申告では同封不要/);
  const saitama = lookupAssetSubmissionDestination('111015')!.formPreparation!;
  assert.match(saitama.items.join(''), /電算申告の独自用紙.*未記入の申告書も添付/);
  const sapporo = lookupAssetSubmissionDestination('011011')!.formPreparation!;
  assert.match(sapporo.scope, /電算処理.*全資産/);
  assert.match(sapporo.items.join(''), /お持ちの種類別明細書も一緒に/);
});

test('コードの違いと独自用紙の方法の制約を残す', () => {
  assert.match(lookupAssetSubmissionDestination('281018')!.formPreparation!.scope, /電算処理.*全資産/);
  assert.match(lookupAssetSubmissionDestination('281018')!.formPreparation!.items.join(''), /13桁/);
  assert.match(lookupAssetSubmissionDestination('121011')!.formPreparation!.items.join(''), /11桁/);
  assert.match(lookupAssetSubmissionDestination('221015')!.formPreparation!.items.join(''), /整理番号/);
  assert.match(lookupAssetSubmissionDestination('261017')!.formPreparation!.items.join(''), /納税者コード/);
});
