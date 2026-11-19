import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ASSET_WARDS,
  KITAKYUSHU_WARDS,
  SENDAI_WARDS,
  SAITAMA_WARDS,
  CHIBA_WARDS,
  YOKOHAMA_WARDS,
  KAWASAKI_WARDS,
  SAGAMIHARA_WARDS,
  NIIGATA_WARDS,
  SHIZUOKA_WARDS,
  HAMAMATSU_WARDS,
  ASSET_CITY_GROUPS,
  ASSET_DESTINATION_COVERAGE,
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
  assert.match(comp, /ASSET_CITY_GROUPS\.map/);
  assert.match(comp, /<optgroup key=\{g\.cityLabel\} label=\{g\.cityLabel\}>/);
  assert.match(comp, /destination\.cityLabel\}の公式案内を開く/);
  assert.match(comp, /destination\.formNotice &&/);
  assert.equal((comp.match(/rel="noopener noreferrer"/g) ?? []).length, 2);
  assert.doesNotMatch(comp, /福岡市の公式案内|localStorage|sessionStorage|fetch\(|props\.company/);
  assert.match(comp, /disabled=\{disabled\}/);
});

// ---- 第1弾：仙台市・さいたま市・千葉市（公式確認 2026-11-19） ----
const STAGE1 = [
  {
    city: '仙台市', wards: SENDAI_WARDS, count: 5,
    office: '仙台市 財政局 資産課税課 償却資産係（北庁舎1階）', postal: '980-8671',
    address: '宮城県仙台市青葉区二日町1番1号（仙台市役所北庁舎1階）', phone: '022-214-8619',
    url: 'https://www.city.sendai.jp/sisanze-chose/kurashi/tetsuzuki/zekin/kekaku/tebiki/shisanze.html',
    codes: [['041017', '青葉区'], ['041025', '宮城野区'], ['041033', '若林区'], ['041041', '太白区'], ['041050', '泉区']],
  },
  {
    city: 'さいたま市', wards: SAITAMA_WARDS, count: 10,
    office: 'さいたま市 南部市税事務所 資産課税課 償却資産係（ときわ会館1階）', postal: '330-0061',
    address: '埼玉県さいたま市浦和区常盤6丁目4番21号（ときわ会館1階）', phone: '048-829-1186',
    url: 'https://www.city.saitama.lg.jp/001/153/004/002/002/004/p009364.html',
    codes: [['111015', '西区'], ['111023', '北区'], ['111031', '大宮区'], ['111040', '見沼区'], ['111058', '中央区'],
      ['111066', '桜区'], ['111074', '浦和区'], ['111082', '南区'], ['111091', '緑区'], ['111104', '岩槻区']],
  },
  {
    city: '千葉市', wards: CHIBA_WARDS, count: 6,
    office: '千葉市 東部市税事務所 法人課 償却資産班（若葉区役所内）', postal: '264-8582',
    address: '千葉県千葉市若葉区桜木北2丁目1番1号（若葉区役所内）', phone: '043-233-8146',
    url: 'https://www.city.chiba.jp/zaiseikyoku/zeimu/tobushizei/hojin/syoukyakushisan.html',
    codes: [['121011', '中央区'], ['121029', '花見川区'], ['121037', '稲毛区'], ['121045', '若葉区'], ['121053', '緑区'], ['121061', '美浜区']],
  },
] as const;

test('第1弾3市21区：正確な6桁コードで窓口・出典・R9案内を返す', () => {
  let total = 0;
  for (const c of STAGE1) {
    assert.equal(c.wards.length, c.count);
    for (const [code, label] of c.codes) {
      total++;
      const d = lookupAssetSubmissionDestination(code);
      assert.ok(d, code);
      assert.equal(d.jisCode, code);
      assert.equal(d.wardLabel, label);
      assert.equal(d.cityLabel, c.city);
      assert.equal(d.officeName, c.office);
      assert.equal(d.postalCode, c.postal);
      assert.equal(d.address, c.address);
      assert.equal(d.phone, c.phone);
      assert.equal(d.officialUrl, c.url);
      assert.equal(d.sourceCheckedOn, '2026-11-19');
      assert.equal(d.note, '資産がある区ごとに書類を用意し、この提出先へ出します。');
      assert.ok(d.formNotice);
      assert.equal(d.formNotice.text, '令和9年度の様式は公開を確認できていません（2026/11/19確認）。');
      assert.equal(d.formNotice.actionLabel, '最新の様式を公式サイトで確認');
      assert.equal(d.formNotice.url, c.url);
      assert.doesNotMatch(JSON.stringify(d), /期限|締切|1月31日|税率|免税点|未公開/);
    }
  }
  assert.equal(total, 21);
});

test('11グループ・77コード・重複なし・旧5市35コードは先頭で不変、第2弾8市63コードの順序も不変', () => {
  assert.deepEqual(ASSET_CITY_GROUPS.map((g) => [g.cityLabel, g.wards.length]),
    [['福岡市', 7], ['北九州市', 7], ['仙台市', 5], ['さいたま市', 10], ['千葉市', 6], ['横浜市', 18], ['川崎市', 7], ['相模原市', 3],
      ['新潟市', 8], ['静岡市', 3], ['浜松市', 3]]);
  const all = ASSET_CITY_GROUPS.flatMap((g) => g.wards.map((w) => w.code));
  assert.equal(all.length, 77);
  assert.equal(new Set(all).size, 77);
  assert.equal(ASSET_CITY_GROUPS.slice(0, 5).flatMap((g) => g.wards).length, 35);
  assert.equal(ASSET_CITY_GROUPS.slice(0, 8).flatMap((g) => g.wards).length, 63);
  for (const c of all) assert.match(c, /^\d{6}$/);
  const prefix: Record<string, RegExp> = {
    仙台市: /^0410/, さいたま市: /^111/, 千葉市: /^121/, 福岡市: /^4013/, 北九州市: /^401[01]/,
    横浜市: /^141[01]/, 川崎市: /^1413/, 相模原市: /^1415/, 新潟市: /^1510/, 静岡市: /^2210/, 浜松市: /^221[34]/,
  };
  for (const g of ASSET_CITY_GROUPS) for (const w of g.wards) assert.match(w.code, prefix[g.cityLabel], w.code);
  assert.match(ASSET_DESTINATION_COVERAGE, /仙台市（5区）.*さいたま市（10区）.*千葉市（6区）.*横浜市（18区）.*川崎市（7区）.*相模原市（3区）.*新潟市（8区）.*静岡市（3区）.*浜松市（3区）/);
  assert.doesNotMatch(ASSET_DESTINATION_COVERAGE, /全国|17/);
});

// ---- 第2弾：横浜市・川崎市・相模原市（公式確認 2026-11-19） ----
const R9_TEXT = '令和9年度の様式は公開を確認できていません（2026/11/19確認）。';
const STAGE2 = [
  {
    city: '横浜市', wards: YOKOHAMA_WARDS, office: '横浜市償却資産センター（償却資産課）', postal: '231-8343',
    address: '神奈川県横浜市中区山下町2番地（産業貿易センタービル5階）', phone: '045-671-4384',
    url: 'https://www.city.yokohama.lg.jp/kurashi/koseki-zei-hoken/zeikin/jigyosya/madoguchi/shoukyaku-center.html',
    note: '資産がある区ごとに書類を用意し、この提出先へ出します。',
    form: 'https://www.city.yokohama.lg.jp/kurashi/koseki-zei-hoken/zeikin/jigyosya/tebiki/shokyakushisan-dl.html',
    codes: [['141011', '鶴見区'], ['141020', '神奈川区'], ['141038', '西区'], ['141046', '中区'], ['141054', '南区'], ['141062', '保土ケ谷区'],
      ['141071', '磯子区'], ['141089', '金沢区'], ['141097', '港北区'], ['141101', '戸塚区'], ['141119', '港南区'], ['141127', '旭区'],
      ['141135', '緑区'], ['141143', '瀬谷区'], ['141151', '栄区'], ['141160', '泉区'], ['141178', '青葉区'], ['141186', '都筑区']],
  },
  {
    city: '川崎市', wards: KAWASAKI_WARDS, office: 'かわさき市税事務所 資産税課 償却資産担当（川崎御幸ビル3階）', postal: '210-8576',
    address: '神奈川県川崎市川崎区砂子1-8-9（川崎御幸ビル3階）', phone: '044-200-1321／044-200-1322',
    url: 'https://www.city.kawasaki.jp/230/page/0000148698.html',
    note: '資産がある区ごとに書類を用意します。電話は川崎区・幸区が1321、その他5区が1322です。',
    form: 'https://www.city.kawasaki.jp/230/page/0000053635.html',
    codes: [['141313', '川崎区'], ['141321', '幸区'], ['141330', '中原区'], ['141348', '高津区'], ['141356', '多摩区'], ['141364', '宮前区'], ['141372', '麻生区']],
  },
  {
    city: '相模原市', wards: SAGAMIHARA_WARDS, office: '相模原市 資産税課 賦課・償却資産班（市役所第2別館2階）', postal: '252-5277',
    address: '神奈川県相模原市中央区中央2-11-15（市役所第2別館2階）', phone: '042-769-8264',
    url: 'https://www.city.sagamihara.kanagawa.jp/kurashi/1026448/zeikin/1026477/shisan_keikaku/1007752.html',
    note: '資産がある区ごとに書類を用意し、この提出先へ郵送します。',
    form: 'https://www.city.sagamihara.kanagawa.jp/shinseisho_menu/zei/1011360.html',
    codes: [['141518', '緑区'], ['141526', '中央区'], ['141534', '南区']],
  },
] as const;

test('第2弾3市28区：正確な6桁コードで窓口・電話・注記・R9案内を返す', () => {
  let total = 0;
  for (const c of STAGE2) {
    assert.equal(c.wards.length, c.codes.length);
    for (const [code, label] of c.codes) {
      total++;
      const d = lookupAssetSubmissionDestination(code);
      assert.ok(d, code);
      assert.equal(d.jisCode, code);
      assert.equal(d.wardLabel, label);
      assert.equal(d.cityLabel, c.city);
      assert.equal(d.officeName, c.office);
      assert.equal(d.postalCode, c.postal);
      assert.equal(d.address, c.address);
      assert.equal(d.phone, c.phone);
      assert.equal(d.officialUrl, c.url);
      assert.equal(d.sourceCheckedOn, '2026-11-19');
      assert.equal(d.note, c.note);
      assert.deepEqual(d.formNotice, { text: R9_TEXT, actionLabel: '最新の様式を公式サイトで確認', url: c.form });
      assert.notEqual(d.formNotice?.url, d.officialUrl);
      assert.doesNotMatch(JSON.stringify(d), /期限|締切|1月31日|税率|免税点|未公開|\.pdf/);
    }
  }
  assert.equal(total, 28);
  assert.deepEqual(STAGE2.map((c) => c.codes.length), [18, 7, 3]);
});

test('川崎市：電話は両方・注記は原文どおり（区ごとに書類を用意は公式FAQで確認済み）', () => {
  const k = lookupAssetSubmissionDestination('141330');
  assert.ok(k);
  assert.match(k.phone, /044-200-1321.*044-200-1322/);
  assert.equal(k.note, '資産がある区ごとに書類を用意します。電話は川崎区・幸区が1321、その他5区が1322です。');
  assert.doesNotMatch(JSON.stringify(k), /未確認/);
  for (const code of ['141011', '141313', '141518']) assert.match(lookupAssetSubmissionDestination(code)!.note, /区ごとに書類を用意し/);
  // 未公開と断定せず、R8をR9として扱わない
  for (const w of [...YOKOHAMA_WARDS, ...KAWASAKI_WARDS, ...SAGAMIHARA_WARDS])
    assert.match(lookupAssetSubmissionDestination(w.code)!.formNotice!.text, /公開を確認できていません/);
});

test('第2弾：区コード・区名は公開マスタSQLと一致、窓口はSQLパッチと一致、横浜は1410/1411の両方', () => {
  const geo = readFileSync(new URL('../../supabase/migration_designated_cities_geography.sql', import.meta.url), 'utf8');
  const patch = readFileSync(new URL('../../scripts/sql/20261119-designated-cities-stage2.sql', import.meta.url), 'utf8');
  for (const c of STAGE2) {
    for (const [code, label] of c.codes) {
      assert.ok(geo.includes(`('14','${code}','${c.city}${label}')`), `${code} ${c.city}${label}`);
      assert.ok(patch.includes(`('${code}','${c.city}','${label}')`), `patch ${code}`);
    }
    assert.ok(patch.includes(c.office) && patch.includes(c.phone) && patch.includes(c.postal) && patch.includes(c.url) && patch.includes(c.address), c.city);
    assert.ok(patch.includes(c.form), `form ${c.city}`);
  }
  const yk = STAGE2[0].codes.map(([c]) => c.slice(0, 4));
  assert.equal(yk.filter((p) => p === '1410').length, 9);
  assert.equal(yk.filter((p) => p === '1411').length, 9);
});

test('第2弾でも既存5市35コードの窓口・日付・案内は不変', () => {
  assert.equal(lookupAssetSubmissionDestination('401331')!.sourceCheckedOn, '2026-11-16');
  assert.equal(lookupAssetSubmissionDestination('401331')!.formNotice, undefined);
  assert.equal(lookupAssetSubmissionDestination('401099')!.sourceCheckedOn, '2026-11-18');
  assert.equal(lookupAssetSubmissionDestination('041017')!.officeName, '仙台市 財政局 資産課税課 償却資産係（北庁舎1階）');
  assert.equal(lookupAssetSubmissionDestination('121061')!.phone, '043-233-8146');
  assert.equal(lookupAssetSubmissionDestination('111104')!.cityLabel, 'さいたま市');
});

test('第2弾：不正・空・他県/他市・市名・近いコードはnull', () => {
  const bad: unknown[] = ['141000', '141003', '141200', '141305', '141500', '141542', '14101', '1410111', ' 141011', '141011 ', '１４１０１１', '141011\n',
    '141518x', 141011, '横浜市', '川崎市', '相模原市', '141', '140007', '131016', 'other', '', null, undefined];
  for (const v of bad) assert.equal(lookupAssetSubmissionDestination(v), null, String(v));
});

test('公開マスタSQLの区コードと一致（ミラー文言だけに頼らない）', () => {
  const sql = readFileSync(new URL('../../supabase/migration_designated_cities_geography.sql', import.meta.url), 'utf8');
  for (const c of STAGE1) for (const [code, label] of c.codes)
    assert.ok(sql.includes(`'${code}','${c.city}${label}'`), `${code} ${c.city}${label}`);
  const patch = readFileSync(new URL('../../scripts/sql/20261119-designated-cities-stage1.sql', import.meta.url), 'utf8');
  for (const c of STAGE1) {
    assert.ok(patch.includes(c.office) && patch.includes(c.phone) && patch.includes(c.postal) && patch.includes(c.url), c.city);
    for (const [code] of c.codes) assert.ok(patch.includes(`'${code}'`), code);
  }
});

test('既存：福岡・北九州の窓口と日付・様式案内は第1弾で不変、福岡に案内なし', () => {
  const f = lookupAssetSubmissionDestination('401331');
  assert.ok(f);
  assert.equal(f.sourceCheckedOn, '2026-11-16');
  assert.equal(f.formNotice, undefined);
  assert.equal(f.officeName, '福岡市 財政局 資産課税課（博多区役所 9階）');
  const k = lookupAssetSubmissionDestination('401099');
  assert.ok(k?.formNotice);
  assert.equal(k.sourceCheckedOn, '2026-11-18');
  assert.match(k.formNotice.text, /11\/18確認/);
});

test('不正・空・会社所在地・他市は第1弾でもnull（市単位の集約や部分一致なし）', () => {
  const bad: unknown[] = ['041009', '041', '04101', '0410177', ' 041017', '041017 ', '０４１０１７', '111007', '121002', '121100',
    '141003', '261000', '271004', '281000', '130010', 'sendai', '仙台市', 'さいたま市', '千葉市', '', null, undefined, 41017, '111015\n', '121061x'];
  for (const v of bad) assert.equal(lookupAssetSubmissionDestination(v), null, String(v));
});

test('実装（ヘルパー・コンポーネント）は保存・通信・会社所在地に触れない', () => {
  const lib = readFileSync(new URL('./assetSubmissionDestination.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(lib, /localStorage|sessionStorage|fetch\(|^import /m);
  const comp = readFileSync(new URL('../components/AssetSubmissionDestination.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(comp, /localStorage|sessionStorage|fetch\(|XMLHttpRequest|sendBeacon|company|supabase/i);
  assert.equal((comp.match(/useState\(/g) ?? []).length, 1);
});

// ---- 第3弾：新潟市・静岡市・浜松市（Codex確認済みの公式データ 2026-11-19） ----
const STAGE3 = [
  {
    city: '新潟市', wards: NIIGATA_WARDS, office: '新潟市 資産税課 償却資産係（古町ルフル3階）', postal: '951-8554',
    address: '新潟県新潟市中央区古町通7番町1010番地（古町ルフル3階）', phone: '025-226-2277',
    url: 'https://lgpos.task-asp.net/cu/151009/ea/residents/procedures/apply/1d2d117d-bbdb-4325-80f1-68b6dbc01674/start',
    note: '資産がある区ごとに書類を用意し、この提出先へ出します。区役所・出張所では受け付けていません。',
    codes: [['151017', '北区'], ['151025', '東区'], ['151033', '中央区'], ['151041', '江南区'], ['151050', '秋葉区'], ['151068', '南区'], ['151076', '西区'], ['151084', '西蒲区']],
  },
  {
    city: '静岡市', wards: SHIZUOKA_WARDS, office: '静岡市 固定資産税課 償却資産係（静岡庁舎新館2階）', postal: '420-8602',
    address: '静岡県静岡市葵区追手町5番1号（静岡庁舎新館2階）', phone: '054-221-1048',
    url: 'https://www.city.shizuoka.lg.jp/shinsei/s5724/p2536.html',
    note: '資産がある区ごとに書類を用意し、この提出先へ出します。',
    codes: [['221015', '葵区'], ['221023', '駿河区'], ['221031', '清水区']],
  },
  {
    city: '浜松市', wards: HAMAMATSU_WARDS, office: '浜松市 資産税課 償却資産グループ（元目分庁舎3階）', postal: '430-0948',
    address: '静岡県浜松市中央区元目町120番地の1（元目分庁舎3階）', phone: '053-457-2156',
    url: 'https://www.city.hamamatsu.shizuoka.jp/shisanze/zei/shisanze/shoukyaku2.html',
    note: '資産がある区ごとに書類を用意し、郵送はこの提出先へ出します。',
    codes: [['221384', '中央区'], ['221392', '浜名区'], ['221406', '天竜区']],
  },
] as const;

test('第3弾3市14区：正確な6桁コードで窓口・電話・注記・R9案内を返す（様式URLは公式ページと同じで正しい）', () => {
  let total = 0;
  for (const c of STAGE3) {
    assert.equal(c.wards.length, c.codes.length);
    for (const [code, label] of c.codes) {
      total++;
      const d = lookupAssetSubmissionDestination(code);
      assert.ok(d, code);
      assert.equal(d.jisCode, code);
      assert.equal(d.wardLabel, label);
      assert.equal(d.cityLabel, c.city);
      assert.equal(d.officeName, c.office);
      assert.equal(d.postalCode, c.postal);
      assert.equal(d.address, c.address);
      assert.equal(d.phone, c.phone);
      assert.equal(d.officialUrl, c.url);
      assert.equal(d.sourceCheckedOn, '2026-11-19');
      assert.equal(d.note, c.note);
      assert.deepEqual(d.formNotice, { text: R9_TEXT, actionLabel: '最新の様式を公式サイトで確認', url: c.url });
      assert.doesNotMatch(JSON.stringify(d), /期限|締切|1月31日|税率|免税点|未公開|\.pdf|2266|令和8/);
    }
  }
  assert.equal(total, 14);
  assert.deepEqual(STAGE3.map((c) => c.codes.length), [8, 3, 3]);
});

test('新潟市は直通2277（2266不使用）・区役所受付不可、浜松市は2024再編後の3区のみ', () => {
  const n = lookupAssetSubmissionDestination('151033');
  assert.ok(n);
  assert.equal(n.phone, '025-226-2277');
  assert.match(n.note, /区役所・出張所では受け付けていません/);
  assert.match(n.officeName, /古町ルフル3階/);
  assert.equal(lookupAssetSubmissionDestination('151041')!.cityLabel, '新潟市');
  assert.equal(HAMAMATSU_WARDS.length, 3);
  assert.deepEqual(HAMAMATSU_WARDS.map((w) => w.label), ['中央区', '浜名区', '天竜区']);
  // 旧7区（浜松市の2024年前の区）・浜北/北/東/西/南は対象外
  for (const old of ['221317', '221325', '221333', '221341', '221350', '221368', '221376', '221309', '221317']) assert.equal(lookupAssetSubmissionDestination(old), null, old);
  assert.doesNotMatch(lookupAssetSubmissionDestination('221392')!.note, /区役所/);
});

test('第3弾：区コード・区名は公開マスタSQLと一致、窓口・URLはstage3 SQLパッチと一致', () => {
  const geo = readFileSync(new URL('../../supabase/migration_designated_cities_geography.sql', import.meta.url), 'utf8');
  const patch = readFileSync(new URL('../../scripts/sql/20261119-designated-cities-stage3.sql', import.meta.url), 'utf8');
  for (const c of STAGE3) {
    for (const [code, label] of c.codes) {
      assert.ok(geo.includes(`'${code}','${c.city}${label}'`), `${code} ${c.city}${label}`);
      assert.ok(patch.includes(`('${code}','${c.city}','${label}')`), `patch ${code}`);
    }
    assert.ok(patch.includes(c.office) && patch.includes(c.phone) && patch.includes(c.postal) && patch.includes(c.url) && patch.includes(c.address), c.city);
  }
  assert.ok(patch.includes('ARRAY[\'2213\',\'2214\']'));
  assert.equal(STAGE3[2].codes.filter(([c]) => c.startsWith('2213')).length, 2);
  assert.equal(STAGE3[2].codes.filter(([c]) => c.startsWith('2214')).length, 1);
});

test('第3弾でも既存8市63コードの窓口・日付・案内は不変', () => {
  assert.equal(lookupAssetSubmissionDestination('401331')!.sourceCheckedOn, '2026-11-16');
  assert.equal(lookupAssetSubmissionDestination('401331')!.formNotice, undefined);
  assert.equal(lookupAssetSubmissionDestination('401099')!.sourceCheckedOn, '2026-11-18');
  assert.equal(lookupAssetSubmissionDestination('041017')!.officeName, '仙台市 財政局 資産課税課 償却資産係（北庁舎1階）');
  assert.equal(lookupAssetSubmissionDestination('141330')!.phone, '044-200-1321／044-200-1322');
  assert.equal(lookupAssetSubmissionDestination('141534')!.formNotice!.url, 'https://www.city.sagamihara.kanagawa.jp/shinseisho_menu/zei/1011360.html');
});

test('第3弾：不正・空・他県/他市・市名・近いコードはnull', () => {
  const bad: unknown[] = ['151000', '151009', '151092', '221000', '221007', '221040', '221376', '221414', '22101', '2210151', ' 151017', '151017 ', '１５１０１７',
    '151017\n', '221015x', 151017, '新潟市', '静岡市', '浜松市', '151', '150002', '220001', 'other', '', null, undefined];
  for (const v of bad) assert.equal(lookupAssetSubmissionDestination(v), null, String(v));
});
