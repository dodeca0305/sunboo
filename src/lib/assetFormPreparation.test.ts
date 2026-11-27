import test from 'node:test';
import assert from 'node:assert/strict';
import { ASSET_CITY_GROUPS, lookupAssetSubmissionDestination } from './assetSubmissionDestination.ts';

test('確認済み16市の全区だけに利用条件を出し、残る市へ代用しない', () => {
  const cities = ['福岡市', '北九州市', 'さいたま市', '千葉市', '静岡市', '浜松市', '名古屋市', '京都市', '神戸市', '札幌市', '川崎市', '相模原市', '新潟市', '堺市', '広島市', '熊本市'];
  let covered = 0;
  for (const group of ASSET_CITY_GROUPS) for (const ward of group.wards) {
    const d = lookupAssetSubmissionDestination(ward.code)!;
    assert.equal(Boolean(d.formPreparation), cities.includes(group.cityLabel), group.cityLabel);
    if (!d.formPreparation) continue;
    covered++;
    assert.match(d.formPreparation.sourceUrl, /^https:\/\/www\.city\.[^/]+\/.+\.pdf$/);
    assert.match(d.formPreparation.sourcePages, /ページ/);
    if (group.cityLabel === '札幌市') assert.match(d.formNotice!.text, /令和9年度の手引.*申告用紙を確認できます/);
    else assert.match(d.formNotice!.text, /令和9年度に使えるか確認中/);
    assert.doesNotMatch(JSON.stringify(d.formPreparation), /令和9年度.*使えます|提出準備完了/);
  }
  assert.equal(covered, 120);
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

test('残り6市は必須とお願いを分け、独自用紙の許可を一般化しない', () => {
  const get = (code: string) => lookupAssetSubmissionDestination(code)!.formPreparation!;
  assert.match(get('141313').items.join(''), /所有者コード.*11桁/);
  assert.match(get('141518').items.join(''), /所在区.*所有者コード/);
  assert.match(get('151017').items.join(''), /提出できれば.*修正申告用/);
  assert.match(get('271411').items.join(''), /電算申告で特例・非課税.*可能な限り/);
  for (const code of ['151017', '271411', '341011']) {
    assert.doesNotMatch(get(code).items.join(''), /独自用紙.*使えます|私製.*使用可/);
    assert.equal(get(code).checkedOn, '2026/11/27');
  }
});

test('熊本の既知のR9控え返送廃止を、用紙の利用可否と区別する', () => {
  const d = lookupAssetSubmissionDestination('431010')!;
  assert.match(d.formPreparation!.items.join(''), /紙申告.*市から届いた申告書も必ず添付/);
  assert.match(d.formPreparation!.items.join(''), /令和9年1月受付分.*押印・返送.*廃止/);
  assert.match(d.formPreparation!.items.join(''), /令和9年度に使えるかは別途確認中/);
  assert.ok(d.formPreparation!.sourceLinks!.some(s => s.url === 'https://www.city.kumamoto.jp/kiji00364398/index.html'));
});

test('広島の分割手引は複数の根拠へ案内し、同じPDFを重複表示しない', () => {
  const d = lookupAssetSubmissionDestination('341011')!.formPreparation!;
  assert.equal(d.sourceLinks!.length, 5);
  assert.equal(new Set(d.sourceLinks!.map(s => s.url)).size, 5);
  for (const suffix of ['256152.pdf', '256153.pdf', '256154.pdf', '256155.pdf'])
    assert.ok(d.sourceLinks!.some(s => s.url.endsWith(suffix)), suffix);
  assert.match(d.items.join(''), /短縮・増加償却.*写し/);
});


test('札幌のR9手引だけ年度案内を更新し、残る15市へ確認済みを広げない', () => {
  let confirmed = 0;
  for (const group of ASSET_CITY_GROUPS) for (const ward of group.wards) {
    const d = lookupAssetSubmissionDestination(ward.code)!;
    if (group.cityLabel === '札幌市') {
      confirmed++;
      assert.match(d.formNotice!.text, /令和9年度の手引.*2026\/11\/27確認/);
      assert.equal(d.formPreparation!.sourceUrl, 'https://www.city.sapporo.jp/documents/114194/09_shokyaku_tebiki.pdf');
      assert.match(d.formPreparation!.yearNotice!, /令和9年度の手引に基づく/);
      assert.equal(d.formPreparation!.checkedOn, '2026/11/27');
      assert.match(d.formPreparation!.items.join(''), /全項目.*毎年.*全資産.*市の申告書.*種類別明細書/);
      assert.match(d.formPreparation!.items.join(''), /協力/);
      assert.doesNotMatch(JSON.stringify(d), /旧用紙.*使えます|提出準備完了/);
    } else if (d.formPreparation) {
      assert.equal(d.formPreparation.yearNotice, undefined, group.cityLabel);
    }
  }
  assert.equal(confirmed, 10);
});
