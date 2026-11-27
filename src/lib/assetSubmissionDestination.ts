// 償却資産の提出先案内（資産の所在地を明示選択したときだけ）。純粋な参照のみ。
// 会社所在地・チャットからの自動選択はしない。対応範囲：福岡市7区・北九州市7区・仙台市5区・さいたま市10区・千葉市6区・横浜市18区・川崎市7区・相模原市3区・新潟市8区・静岡市3区・浜松市3区・名古屋市16区・京都市11区・大阪市24区・堺市7区・神戸市9区・岡山市4区・広島市8区・熊本市5区・札幌市10区のみ（全国対応ではない）。
// 期限の引用・計算、課税判定、保存はしない。

import { ASSET_FORM_PREPARATION, type AssetFormPreparation } from './assetFormPreparation.ts';

export interface AssetSubmissionDestination {
  jisCode: string;
  wardLabel: string;
  cityLabel: string;
  officeName: string;
  postalCode: string;
  address: string;
  phone: string;
  officialUrl: string;
  sourceCheckedOn: string;
  note: string;
  /** 現行様式の内容と対象年度の確認状況（窓口情報の確認日とは別）。 */
  formNotice?: { text: string; actionLabel: string; url: string };
  formPreparation?: AssetFormPreparation;
}

// コードと区名の根拠：福岡県の市区町村コード表（2026-11-18にCodexが確認）
// https://www.pref.fukuoka.lg.jp/uploaded/attachment/59111.pdf
// 401358=西区, 401366=城南区, 401374=早良区（supabase/migration_organizations.sqlとも一致）。
export const ASSET_WARDS = [
  { code: '401315', label: '東区' },
  { code: '401323', label: '博多区' },
  { code: '401331', label: '中央区' },
  { code: '401340', label: '南区' },
  { code: '401358', label: '西区' },
  { code: '401366', label: '城南区' },
  { code: '401374', label: '早良区' },
] as const;

// 北九州市7区（コードと区名は福岡県の市区町村コード表と公開マスタで確認）。
export const KITAKYUSHU_WARDS = [
  { code: '401013', label: '門司区' },
  { code: '401030', label: '若松区' },
  { code: '401056', label: '戸畑区' },
  { code: '401064', label: '小倉北区' },
  { code: '401072', label: '小倉南区' },
  { code: '401081', label: '八幡東区' },
  { code: '401099', label: '八幡西区' },
] as const;

export const OTHER_REGION_VALUE = 'other';
export const ASSET_DESTINATION_COVERAGE = '福岡市（7区）・北九州市（7区）・仙台市（5区）・さいたま市（10区）・千葉市（6区）・横浜市（18区）・川崎市（7区）・相模原市（3区）・新潟市（8区）・静岡市（3区）・浜松市（3区）・名古屋市（16区）・京都市（11区）・大阪市（24区）・堺市（7区）・神戸市（9区）・岡山市（4区）・広島市（8区）・熊本市（5区）・札幌市（10区）';
export const ASSET_DESTINATION_SOURCE_CHECKED_ON = '2026-11-16';
export const ASSET_DESTINATION_OFFICIAL_URL =
  'https://www.city.fukuoka.lg.jp/zaisei/zeisei/life/koteisisanzei/003.html';

// 2026-11-25：20市の現行申告書・明細書と公式案内を確認。年度欄の空欄をR9利用可とみなさない。
// 根拠・添付内の固定年度：docs/ai/ASSET_FORM_GUIDANCE.md。窓口・税務判定・期限は変更しない。
const FORM_ACTION = '様式と記入方法を確認';
const BLANK_YEAR_FORM_NOTICE = '年度欄は空欄です。令和9年度に使えるか確認中です（2026/11/25確認）。';
const SENDAI_FORM_NOTICE = '申告書が届いていなければ、市の入手案内を確認してください。令和9年度の案内は確認中です（2026/11/25確認）。';
const YOKOHAMA_FORM_NOTICE = '現行の申告書・明細書で準備できます。令和9年度の手引は確認中です（2026/11/25確認）。';
const OSAKA_FORM_NOTICE = '様式に令和8年度の記載があります。令和9年度用を確認中です（2026/11/25確認）。';
const OKAYAMA_FORM_NOTICE = 'Excelには年度「8」が入力済みです。令和9年度の利用方法を確認中です（2026/11/25確認）。';

const FUKUOKA_DESTINATION = {
  cityLabel: '福岡市',
  officeName: '福岡市 財政局 資産課税課（博多区役所 9階）',
  postalCode: '812-8512',
  address: '福岡県福岡市博多区博多駅前2丁目8番1号',
  phone: '092-292-2479',
  officialUrl: ASSET_DESTINATION_OFFICIAL_URL,
  sourceCheckedOn: ASSET_DESTINATION_SOURCE_CHECKED_ON,
  note: '福岡市内の資産は、区ごとの申告書を用意し、同じ提出先へ出します。',
  formNotice: { text: BLANK_YEAR_FORM_NOTICE, actionLabel: FORM_ACTION, url: 'https://www.city.fukuoka.lg.jp/zaisei/zeisei/netdetetsuduki/007.html' },
} as const;

const KITAKYUSHU_DESTINATION = {
  cityLabel: '北九州市',
  officeName: '北九州市 財政・変革局 税務部 固定資産税課 償却資産係（市役所6階）',
  postalCode: '803-8501',
  address: '福岡県北九州市小倉北区城内1番1号',
  phone: '093-582-3210',
  officialUrl: 'https://www.city.kitakyushu.lg.jp/contents/924_00364.html',
  sourceCheckedOn: '2026-11-18',
  note: '資産の所在地の区ごとの書類を用意し、同じ提出先へ出します。',
  formNotice: { text: BLANK_YEAR_FORM_NOTICE, actionLabel: FORM_ACTION, url: 'https://www.city.kitakyushu.lg.jp/contents/division260list.html' },
} as const;

// 第1弾の3市（コードと区名は公開マスタ migration_designated_cities_geography.sql と一致）。
// 公式の償却資産申告ページで、区ごとに書類を作成し1か所の提出先へ出すことを確認（2026-11-19）。
export const SENDAI_WARDS = [
  { code: '041017', label: '青葉区' },
  { code: '041025', label: '宮城野区' },
  { code: '041033', label: '若林区' },
  { code: '041041', label: '太白区' },
  { code: '041050', label: '泉区' },
] as const;

export const SAITAMA_WARDS = [
  { code: '111015', label: '西区' },
  { code: '111023', label: '北区' },
  { code: '111031', label: '大宮区' },
  { code: '111040', label: '見沼区' },
  { code: '111058', label: '中央区' },
  { code: '111066', label: '桜区' },
  { code: '111074', label: '浦和区' },
  { code: '111082', label: '南区' },
  { code: '111091', label: '緑区' },
  { code: '111104', label: '岩槻区' },
] as const;

export const CHIBA_WARDS = [
  { code: '121011', label: '中央区' },
  { code: '121029', label: '花見川区' },
  { code: '121037', label: '稲毛区' },
  { code: '121045', label: '若葉区' },
  { code: '121053', label: '緑区' },
  { code: '121061', label: '美浜区' },
] as const;

const STAGE1_NOTE = '資産がある区ごとに書類を用意し、この提出先へ出します。';

const SENDAI_URL = 'https://www.city.sendai.jp/sisanze-chose/kurashi/tetsuzuki/zekin/kekaku/tebiki/shisanze.html';
const SAITAMA_URL = 'https://www.city.saitama.lg.jp/001/153/004/002/002/004/p009364.html';
const CHIBA_URL = 'https://www.city.chiba.jp/zaiseikyoku/zeimu/tobushizei/hojin/syoukyakushisan.html';

const SENDAI_DESTINATION = {
  cityLabel: '仙台市',
  officeName: '仙台市 財政局 資産課税課 償却資産係（北庁舎1階）',
  postalCode: '980-8671',
  address: '宮城県仙台市青葉区二日町1番1号（仙台市役所北庁舎1階）',
  phone: '022-214-8619',
  officialUrl: SENDAI_URL,
  sourceCheckedOn: '2026-11-19',
  note: STAGE1_NOTE,
  formNotice: { text: SENDAI_FORM_NOTICE, actionLabel: '申告書の入手案内を確認', url: SENDAI_URL },
} as const;

const SAITAMA_DESTINATION = {
  cityLabel: 'さいたま市',
  officeName: 'さいたま市 南部市税事務所 資産課税課 償却資産係（ときわ会館1階）',
  postalCode: '330-0061',
  address: '埼玉県さいたま市浦和区常盤6丁目4番21号（ときわ会館1階）',
  phone: '048-829-1186',
  officialUrl: SAITAMA_URL,
  sourceCheckedOn: '2026-11-19',
  note: STAGE1_NOTE,
  formNotice: { text: BLANK_YEAR_FORM_NOTICE, actionLabel: FORM_ACTION, url: SAITAMA_URL },
} as const;

const CHIBA_DESTINATION = {
  cityLabel: '千葉市',
  officeName: '千葉市 東部市税事務所 法人課 償却資産班（若葉区役所内）',
  postalCode: '264-8582',
  address: '千葉県千葉市若葉区桜木北2丁目1番1号（若葉区役所内）',
  phone: '043-233-8146',
  officialUrl: CHIBA_URL,
  sourceCheckedOn: '2026-11-19',
  note: STAGE1_NOTE,
  formNotice: { text: BLANK_YEAR_FORM_NOTICE, actionLabel: FORM_ACTION, url: CHIBA_URL },
} as const;

// 第2弾の3市（コードと区名は公開マスタ migration_designated_cities_geography.sql と一致、神奈川県）。
// 横浜市・相模原市は区ごとに書類を作成し1か所へ提出。川崎市も区ごとに書類を作成（公式FAQで確認）、電話だけ区で分かれる。
export const YOKOHAMA_WARDS = [
  { code: '141011', label: '鶴見区' },
  { code: '141020', label: '神奈川区' },
  { code: '141038', label: '西区' },
  { code: '141046', label: '中区' },
  { code: '141054', label: '南区' },
  { code: '141062', label: '保土ケ谷区' },
  { code: '141071', label: '磯子区' },
  { code: '141089', label: '金沢区' },
  { code: '141097', label: '港北区' },
  { code: '141101', label: '戸塚区' },
  { code: '141119', label: '港南区' },
  { code: '141127', label: '旭区' },
  { code: '141135', label: '緑区' },
  { code: '141143', label: '瀬谷区' },
  { code: '141151', label: '栄区' },
  { code: '141160', label: '泉区' },
  { code: '141178', label: '青葉区' },
  { code: '141186', label: '都筑区' },
] as const;

export const KAWASAKI_WARDS = [
  { code: '141313', label: '川崎区' },
  { code: '141321', label: '幸区' },
  { code: '141330', label: '中原区' },
  { code: '141348', label: '高津区' },
  { code: '141356', label: '多摩区' },
  { code: '141364', label: '宮前区' },
  { code: '141372', label: '麻生区' },
] as const;

export const SAGAMIHARA_WARDS = [
  { code: '141518', label: '緑区' },
  { code: '141526', label: '中央区' },
  { code: '141534', label: '南区' },
] as const;

const YOKOHAMA_DESTINATION = {
  cityLabel: '横浜市',
  officeName: '横浜市償却資産センター（償却資産課）',
  postalCode: '231-8343',
  address: '神奈川県横浜市中区山下町2番地（産業貿易センタービル5階）',
  phone: '045-671-4384',
  officialUrl: 'https://www.city.yokohama.lg.jp/kurashi/koseki-zei-hoken/zeikin/jigyosya/madoguchi/shoukyaku-center.html',
  sourceCheckedOn: '2026-11-19',
  note: '資産がある区ごとに書類を用意し、この提出先へ出します。',
  formNotice: { text: YOKOHAMA_FORM_NOTICE, actionLabel: FORM_ACTION, url: 'https://www.city.yokohama.lg.jp/kurashi/koseki-zei-hoken/zeikin/jigyosya/tebiki/shokyakushisan-dl.html' },
} as const;

const KAWASAKI_DESTINATION = {
  cityLabel: '川崎市',
  officeName: 'かわさき市税事務所 資産税課 償却資産担当（川崎御幸ビル3階）',
  postalCode: '210-8576',
  address: '神奈川県川崎市川崎区砂子1-8-9（川崎御幸ビル3階）',
  phone: '044-200-1321／044-200-1322',
  officialUrl: 'https://www.city.kawasaki.jp/230/page/0000148698.html',
  sourceCheckedOn: '2026-11-19',
  note: '資産がある区ごとに書類を用意します。電話は川崎区・幸区が1321、その他5区が1322です。',
  formNotice: { text: BLANK_YEAR_FORM_NOTICE, actionLabel: FORM_ACTION, url: 'https://www.city.kawasaki.jp/230/page/0000053635.html' },
} as const;

const SAGAMIHARA_DESTINATION = {
  cityLabel: '相模原市',
  officeName: '相模原市 資産税課 賦課・償却資産班（市役所第2別館2階）',
  postalCode: '252-5277',
  address: '神奈川県相模原市中央区中央2-11-15（市役所第2別館2階）',
  phone: '042-769-8264',
  officialUrl: 'https://www.city.sagamihara.kanagawa.jp/kurashi/1026448/zeikin/1026477/shisan_keikaku/1007752.html',
  sourceCheckedOn: '2026-11-19',
  note: '資産がある区ごとに書類を用意し、この提出先へ郵送します。',
  formNotice: { text: BLANK_YEAR_FORM_NOTICE, actionLabel: FORM_ACTION, url: 'https://www.city.sagamihara.kanagawa.jp/shinseisho_menu/zei/1011360.html' },
} as const;

// 第3弾の3市（コードと区名は公開マスタ migration_designated_cities_geography.sql と一致、新潟県・静岡県）。
// 新潟市・静岡市・浜松市は公式ページ/PDFで区ごとに書類を作成することを確認（2026-11-19、Codex確認）。浜松市は2024年再編後の3区のみ。
export const NIIGATA_WARDS = [
  { code: '151017', label: '北区' },
  { code: '151025', label: '東区' },
  { code: '151033', label: '中央区' },
  { code: '151041', label: '江南区' },
  { code: '151050', label: '秋葉区' },
  { code: '151068', label: '南区' },
  { code: '151076', label: '西区' },
  { code: '151084', label: '西蒲区' },
] as const;

export const SHIZUOKA_WARDS = [
  { code: '221015', label: '葵区' },
  { code: '221023', label: '駿河区' },
  { code: '221031', label: '清水区' },
] as const;

export const HAMAMATSU_WARDS = [
  { code: '221384', label: '中央区' },
  { code: '221392', label: '浜名区' },
  { code: '221406', label: '天竜区' },
] as const;

const NIIGATA_URL = 'https://lgpos.task-asp.net/cu/151009/ea/residents/procedures/apply/1d2d117d-bbdb-4325-80f1-68b6dbc01674/start';
const SHIZUOKA_URL = 'https://www.city.shizuoka.lg.jp/shinsei/s5724/p2536.html';
const HAMAMATSU_URL = 'https://www.city.hamamatsu.shizuoka.jp/shisanze/zei/shisanze/shoukyaku2.html';

const NIIGATA_DESTINATION = {
  cityLabel: '新潟市',
  officeName: '新潟市 資産税課 償却資産係（古町ルフル3階）',
  postalCode: '951-8554',
  address: '新潟県新潟市中央区古町通7番町1010番地（古町ルフル3階）',
  phone: '025-226-2277',
  officialUrl: NIIGATA_URL,
  sourceCheckedOn: '2026-11-19',
  note: '資産がある区ごとに書類を用意し、この提出先へ出します。区役所・出張所では受け付けていません。',
  formNotice: { text: BLANK_YEAR_FORM_NOTICE, actionLabel: FORM_ACTION, url: NIIGATA_URL },
} as const;

const SHIZUOKA_DESTINATION = {
  cityLabel: '静岡市',
  officeName: '静岡市 固定資産税課 償却資産係（静岡庁舎新館2階）',
  postalCode: '420-8602',
  address: '静岡県静岡市葵区追手町5番1号（静岡庁舎新館2階）',
  phone: '054-221-1048',
  officialUrl: SHIZUOKA_URL,
  sourceCheckedOn: '2026-11-19',
  note: STAGE1_NOTE,
  formNotice: { text: BLANK_YEAR_FORM_NOTICE, actionLabel: FORM_ACTION, url: SHIZUOKA_URL },
} as const;

const HAMAMATSU_DESTINATION = {
  cityLabel: '浜松市',
  officeName: '浜松市 資産税課 償却資産グループ（元目分庁舎3階）',
  postalCode: '430-0948',
  address: '静岡県浜松市中央区元目町120番地の1（元目分庁舎3階）',
  phone: '053-457-2156',
  officialUrl: HAMAMATSU_URL,
  sourceCheckedOn: '2026-11-19',
  note: '資産がある区ごとに書類を用意し、郵送はこの提出先へ出します。',
  formNotice: { text: BLANK_YEAR_FORM_NOTICE, actionLabel: FORM_ACTION, url: HAMAMATSU_URL },
} as const;


// 第4弾の3市（コードと区名は公開マスタ migration_designated_cities_geography.sql と一致、愛知県・京都府・大阪府）。
// 公式ページ/PDFで区ごとに書類を作成することを確認（2026-11-19、Codex確認）。名古屋市は2026年4月以降、全区の窓口が金山市税事務所に集約。
export const NAGOYA_WARDS = [
  { code: '231011', label: '千種区' },
  { code: '231029', label: '東区' },
  { code: '231037', label: '北区' },
  { code: '231045', label: '西区' },
  { code: '231053', label: '中村区' },
  { code: '231061', label: '中区' },
  { code: '231070', label: '昭和区' },
  { code: '231088', label: '瑞穂区' },
  { code: '231096', label: '熱田区' },
  { code: '231100', label: '中川区' },
  { code: '231118', label: '港区' },
  { code: '231126', label: '南区' },
  { code: '231134', label: '守山区' },
  { code: '231142', label: '緑区' },
  { code: '231151', label: '名東区' },
  { code: '231169', label: '天白区' },
] as const;

export const KYOTO_WARDS = [
  { code: '261017', label: '北区' },
  { code: '261025', label: '上京区' },
  { code: '261033', label: '左京区' },
  { code: '261041', label: '中京区' },
  { code: '261050', label: '東山区' },
  { code: '261068', label: '下京区' },
  { code: '261076', label: '南区' },
  { code: '261084', label: '右京区' },
  { code: '261092', label: '伏見区' },
  { code: '261106', label: '山科区' },
  { code: '261114', label: '西京区' },
] as const;

export const OSAKA_WARDS = [
  { code: '271021', label: '都島区' },
  { code: '271039', label: '福島区' },
  { code: '271047', label: '此花区' },
  { code: '271063', label: '西区' },
  { code: '271071', label: '港区' },
  { code: '271080', label: '大正区' },
  { code: '271098', label: '天王寺区' },
  { code: '271110', label: '浪速区' },
  { code: '271136', label: '西淀川区' },
  { code: '271144', label: '東淀川区' },
  { code: '271152', label: '東成区' },
  { code: '271161', label: '生野区' },
  { code: '271179', label: '旭区' },
  { code: '271187', label: '城東区' },
  { code: '271195', label: '阿倍野区' },
  { code: '271209', label: '住吉区' },
  { code: '271217', label: '東住吉区' },
  { code: '271225', label: '西成区' },
  { code: '271233', label: '淀川区' },
  { code: '271241', label: '鶴見区' },
  { code: '271250', label: '住之江区' },
  { code: '271268', label: '平野区' },
  { code: '271276', label: '北区' },
  { code: '271284', label: '中央区' },
] as const;

const NAGOYA_URL = 'https://www.city.nagoya.jp/kurashi/zeikin/1037356/1011931/1011953/1011959.html';
const NAGOYA_FORM_URL = 'https://www.city.nagoya.jp/kurashi/zeikin/1037356/1011931/1011953/1011956.html';
const KYOTO_URL = 'https://www.city.kyoto.lg.jp/gyozai/page/0000052941.html';
const OSAKA_URL = 'https://www.city.osaka.lg.jp/zaisei/page/0000006293.html';

const NAGOYA_DESTINATION = {
  cityLabel: '名古屋市',
  officeName: '名古屋市 金山市税事務所 償却資産課税課（名鉄正木第一ビル）',
  postalCode: '460-8626',
  address: '愛知県名古屋市中区正木三丁目5番33号（名鉄正木第一ビル）',
  phone: '052-324-9809',
  officialUrl: NAGOYA_URL,
  sourceCheckedOn: '2026-11-19',
  note: '資産がある区ごとに書類を用意し、金山市税事務所へ出します。2026年4月から全区の窓口が集約されています。',
  formNotice: { text: BLANK_YEAR_FORM_NOTICE, actionLabel: FORM_ACTION, url: NAGOYA_FORM_URL },
} as const;

const KYOTO_DESTINATION = {
  cityLabel: '京都市',
  officeName: '京都市 市税事務所 法人諸税室 償却資産担当（分庁舎地下1階）',
  postalCode: '604-8571',
  address: '京都府京都市中京区寺町通御池上る上本能寺前町488番地（京都市役所分庁舎地下1階）',
  phone: '075-222-3170',
  officialUrl: KYOTO_URL,
  sourceCheckedOn: '2026-11-19',
  note: '資産がある区ごとに書類を用意し、この提出先へ出します。区役所・支所・出張所では受け付けていません。',
  formNotice: { text: BLANK_YEAR_FORM_NOTICE, actionLabel: FORM_ACTION, url: KYOTO_URL },
} as const;

const OSAKA_DESTINATION = {
  cityLabel: '大阪市',
  officeName: '大阪市 船場法人市税事務所 固定資産税（償却資産）グループ（船場センタービル3号館2階北側）',
  postalCode: '541-8551',
  address: '大阪府大阪市中央区船場中央1-4-3-203（船場センタービル3号館2階北側）',
  phone: '06-4705-2941',
  officialUrl: OSAKA_URL,
  sourceCheckedOn: '2026-11-19',
  note: '資産がある区ごとに書類を用意し、郵送はこの提出先へ出します。区役所では受け付けていません。',
  formNotice: { text: OSAKA_FORM_NOTICE, actionLabel: FORM_ACTION, url: OSAKA_URL },
} as const;

// 第5弾の3市（コードと区名は公開マスタ migration_designated_cities_geography.sql と一致、大阪府・兵庫県・岡山県）。
// 公式ページ/PDFで区ごとに書類を作成することを確認（2026-11-20、Codex確認）。堺市は郵送先が一つで各区の市税窓口でも持参可、
// 神戸市は郵送または持参、岡山市は区役所・市税事務所では受け付けない（R8手引PDF 1枚目で区ごとの作成を確認）。
export const SAKAI_WARDS = [
  { code: '271411', label: '堺区' },
  { code: '271420', label: '中区' },
  { code: '271438', label: '東区' },
  { code: '271446', label: '西区' },
  { code: '271454', label: '南区' },
  { code: '271462', label: '北区' },
  { code: '271471', label: '美原区' },
] as const;

export const KOBE_WARDS = [
  { code: '281018', label: '東灘区' },
  { code: '281026', label: '灘区' },
  { code: '281051', label: '兵庫区' },
  { code: '281069', label: '長田区' },
  { code: '281077', label: '須磨区' },
  { code: '281085', label: '垂水区' },
  { code: '281093', label: '北区' },
  { code: '281107', label: '中央区' },
  { code: '281115', label: '西区' },
] as const;

export const OKAYAMA_WARDS = [
  { code: '331015', label: '北区' },
  { code: '331023', label: '中区' },
  { code: '331031', label: '東区' },
  { code: '331040', label: '南区' },
] as const;

const SAKAI_URL = 'https://www.city.sakai.lg.jp/shisei/gaiyo/annai/gyoseikiko/zaisei/shizei/kotei.html';
const SAKAI_FORM_URL = 'https://www.city.sakai.lg.jp/benri/download/download_shimin/mokuteki/kurashi/zeikin/koteishisan/syoukyakushishanshinkoku.html';
const KOBE_URL = 'https://www.city.kobe.lg.jp/a03858/kurashi/registration/shinsei/zei/koteishisan/syokyaku_sinkoku.html';
const OKAYAMA_URL = 'https://www.city.okayama.jp/kurashi/0000005379.html';
const OKAYAMA_FORM_URL = 'https://www.city.okayama.jp/kurashi/0000031132.html';

const SAKAI_DESTINATION = {
  cityLabel: '堺市',
  officeName: '堺市 市税事務所 固定資産税課 償却資産係（三国ヶ丘庁舎3階）',
  postalCode: '591-8037',
  address: '大阪府堺市北区百舌鳥赤畑町1丁3番地1（三国ヶ丘庁舎3階）',
  phone: '072-231-9765',
  officialUrl: SAKAI_URL,
  sourceCheckedOn: '2026-11-20',
  note: '資産がある区ごとに書類を用意し、郵送はこの提出先へ出します。持参は各区の市税の窓口でも受け付けています。',
  formNotice: { text: BLANK_YEAR_FORM_NOTICE, actionLabel: FORM_ACTION, url: SAKAI_FORM_URL },
} as const;

const KOBE_DESTINATION = {
  cityLabel: '神戸市',
  officeName: '神戸市 固定資産税調整課 償却資産担当（新長田合同庁舎4階）',
  postalCode: '653-8773',
  address: '兵庫県神戸市長田区二葉町5丁目1番32号（新長田合同庁舎4階）',
  phone: '078-647-9433',
  officialUrl: KOBE_URL,
  sourceCheckedOn: '2026-11-20',
  note: '資産がある区ごとに書類を用意し、この提出先へ郵送または持参します。法人市民税の提出先とは異なります。',
  formNotice: { text: BLANK_YEAR_FORM_NOTICE, actionLabel: FORM_ACTION, url: KOBE_URL },
} as const;

const OKAYAMA_DESTINATION = {
  cityLabel: '岡山市',
  officeName: '岡山市 課税管理課 償却資産係（分庁舎3階）',
  postalCode: '700-8544',
  address: '岡山県岡山市北区大供一丁目2番3号（分庁舎3階）',
  phone: '086-803-1181',
  officialUrl: OKAYAMA_URL,
  sourceCheckedOn: '2026-11-20',
  note: '資産がある区ごとに書類を用意し、この提出先へまとめて出します。区役所や市税事務所への提出ではありません。',
  formNotice: { text: OKAYAMA_FORM_NOTICE, actionLabel: FORM_ACTION, url: OKAYAMA_FORM_URL },
} as const;

// 第6弾：広島・熊本。2026-11-20公式照合、2026-11-25再確認。
export const HIROSHIMA_WARDS = [
  { code: '341011', label: '中区' },
  { code: '341029', label: '東区' },
  { code: '341037', label: '南区' },
  { code: '341045', label: '西区' },
  { code: '341053', label: '安佐南区' },
  { code: '341061', label: '安佐北区' },
  { code: '341070', label: '安芸区' },
  { code: '341088', label: '佐伯区' },
] as const;

const HIROSHIMA_DESTINATION = {
  cityLabel: '広島市',
  officeName: '広島市 財政局 税務部 固定資産税課 償却資産係（本庁舎8階）',
  postalCode: '730-8586',
  address: '広島県広島市中区国泰寺町一丁目6番34号（本庁舎8階）',
  phone: '082-504-2127',
  officialUrl: 'https://www.city.hiroshima.lg.jp/living/zei/1006021/1025589/1019210.html',
  sourceCheckedOn: '2026-11-20',
  note: '資産がある区ごとに書類を用意し、この提出先へ出します。区役所内の市税事務所家屋係・税務室でも受け付けています。',
  formNotice: { text: BLANK_YEAR_FORM_NOTICE, actionLabel: FORM_ACTION, url: 'https://www.city.hiroshima.lg.jp/living/zei/1006021/1025589/1019210.html' },
} as const;

export const KUMAMOTO_WARDS = [
  { code: '431010', label: '中央区' },
  { code: '431028', label: '東区' },
  { code: '431036', label: '西区' },
  { code: '431044', label: '南区' },
  { code: '431052', label: '北区' },
] as const;

const KUMAMOTO_DESTINATION = {
  cityLabel: '熊本市',
  officeName: '熊本市 固定資産税課 償却資産班（本庁舎2階）',
  postalCode: '860-8601',
  address: '熊本県熊本市中央区手取本町1番1号（本庁舎2階）',
  phone: '096-328-2195',
  officialUrl: 'https://www.city.kumamoto.jp/kiji00364398/index.html',
  sourceCheckedOn: '2026-11-20',
  note: '資産がある区ごとに書類を用意し、郵送はこの提出先へまとめて出せます。窓口は本庁舎2階です。eLTAXは資産がある区ごとに送信します。',
  formNotice: { text: BLANK_YEAR_FORM_NOTICE, actionLabel: FORM_ACTION, url: 'https://www.city.kumamoto.jp/kiji00364398/index.html' },
} as const;

// 札幌市10区。既存公開マスター窓口88・主管轄登録済み、2026-11-25公式確認。
export const SAPPORO_WARDS = [
  { code: '011011', label: '中央区' },
  { code: '011029', label: '北区' },
  { code: '011037', label: '東区' },
  { code: '011045', label: '白石区' },
  { code: '011053', label: '豊平区' },
  { code: '011061', label: '南区' },
  { code: '011070', label: '西区' },
  { code: '011088', label: '厚別区' },
  { code: '011096', label: '手稲区' },
  { code: '011100', label: '清田区' },
] as const;

const SAPPORO_DESTINATION = {
  cityLabel: '札幌市',
  officeName: '札幌市 中央市税事務所 固定資産税課 償却資産担当（庁舎6階）',
  postalCode: '060-8572',
  address: '北海道札幌市中央区南3条西11丁目（札幌市中央市税事務所庁舎6階）',
  phone: '011-596-7303',
  officialUrl: 'https://www.city.sapporo.jp/s024/114194.html',
  sourceCheckedOn: '2026-11-25',
  note: '資産がある区ごとに書類を用意し、中央市税事務所へ出します。他の市税事務所の固定資産税課でも受け付けています。',
  formNotice: { text: '令和9年度の手引と、市が掲載している申告用紙を確認できます（2026/11/27確認）。', actionLabel: FORM_ACTION, url: 'https://www.city.sapporo.jp/s024/114194.html' },
} as const;

type CityDestination = Omit<AssetSubmissionDestination, 'jisCode' | 'wardLabel'>;

export interface AssetCityGroup {
  cityLabel: string;
  wards: ReadonlyArray<{ code: string; label: string }>;
  destination: CityDestination;
}

/** 選択肢の表示順（福岡市・北九州市・仙台市・さいたま市・千葉市・横浜市・川崎市・相模原市・新潟市・静岡市・浜松市・名古屋市・京都市・大阪市・堺市・神戸市・岡山市・広島市・熊本市・札幌市）。画面はこの配列を回す。 */
export const ASSET_CITY_GROUPS: ReadonlyArray<AssetCityGroup> = [
  { cityLabel: '福岡市', wards: ASSET_WARDS, destination: FUKUOKA_DESTINATION },
  { cityLabel: '北九州市', wards: KITAKYUSHU_WARDS, destination: KITAKYUSHU_DESTINATION },
  { cityLabel: '仙台市', wards: SENDAI_WARDS, destination: SENDAI_DESTINATION },
  { cityLabel: 'さいたま市', wards: SAITAMA_WARDS, destination: SAITAMA_DESTINATION },
  { cityLabel: '千葉市', wards: CHIBA_WARDS, destination: CHIBA_DESTINATION },
  { cityLabel: '横浜市', wards: YOKOHAMA_WARDS, destination: YOKOHAMA_DESTINATION },
  { cityLabel: '川崎市', wards: KAWASAKI_WARDS, destination: KAWASAKI_DESTINATION },
  { cityLabel: '相模原市', wards: SAGAMIHARA_WARDS, destination: SAGAMIHARA_DESTINATION },
  { cityLabel: '新潟市', wards: NIIGATA_WARDS, destination: NIIGATA_DESTINATION },
  { cityLabel: '静岡市', wards: SHIZUOKA_WARDS, destination: SHIZUOKA_DESTINATION },
  { cityLabel: '浜松市', wards: HAMAMATSU_WARDS, destination: HAMAMATSU_DESTINATION },
  { cityLabel: '名古屋市', wards: NAGOYA_WARDS, destination: NAGOYA_DESTINATION },
  { cityLabel: '京都市', wards: KYOTO_WARDS, destination: KYOTO_DESTINATION },
  { cityLabel: '大阪市', wards: OSAKA_WARDS, destination: OSAKA_DESTINATION },
  { cityLabel: '堺市', wards: SAKAI_WARDS, destination: SAKAI_DESTINATION },
  { cityLabel: '神戸市', wards: KOBE_WARDS, destination: KOBE_DESTINATION },
  { cityLabel: '岡山市', wards: OKAYAMA_WARDS, destination: OKAYAMA_DESTINATION },
  { cityLabel: '広島市', wards: HIROSHIMA_WARDS, destination: HIROSHIMA_DESTINATION },
  { cityLabel: '熊本市', wards: KUMAMOTO_WARDS, destination: KUMAMOTO_DESTINATION },
  { cityLabel: '札幌市', wards: SAPPORO_WARDS, destination: SAPPORO_DESTINATION },
];

/** 6桁の文字列（全国地方公共団体コード）と完全一致する対応20市の区のみ。それ以外はnull（未対応）。 */
export function lookupAssetSubmissionDestination(code: unknown): AssetSubmissionDestination | null {
  if (typeof code !== 'string') return null;
  for (const g of ASSET_CITY_GROUPS) {
    const w = g.wards.find((x) => x.code === code);
    if (w) return { jisCode: w.code, wardLabel: w.label, ...g.destination, formPreparation: ASSET_FORM_PREPARATION[g.cityLabel] };
  }
  return null;
}
