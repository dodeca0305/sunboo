// 償却資産の提出先案内（資産の所在地を明示選択したときだけ）。純粋な参照のみ。
// 会社所在地・チャットからの自動選択はしない。対応範囲：福岡市7区・北九州市7区・仙台市5区・さいたま市10区・千葉市6区のみ（全国対応ではない）。
// 期限の引用・計算、課税判定、保存はしない。

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
  /** 様式の公開状況の案内（北九州市・仙台市・さいたま市・千葉市のみ）。 */
  formNotice?: { text: string; actionLabel: string; url: string };
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
export const ASSET_DESTINATION_COVERAGE = '福岡市（7区）・北九州市（7区）・仙台市（5区）・さいたま市（10区）・千葉市（6区）';
export const ASSET_DESTINATION_SOURCE_CHECKED_ON = '2026-11-16';
export const ASSET_DESTINATION_OFFICIAL_URL =
  'https://www.city.fukuoka.lg.jp/zaisei/zeisei/life/koteisisanzei/003.html';

const FUKUOKA_DESTINATION = {
  cityLabel: '福岡市',
  officeName: '福岡市 財政局 資産課税課（博多区役所 9階）',
  postalCode: '812-8512',
  address: '福岡県福岡市博多区博多駅前2丁目8番1号',
  phone: '092-292-2479',
  officialUrl: ASSET_DESTINATION_OFFICIAL_URL,
  sourceCheckedOn: ASSET_DESTINATION_SOURCE_CHECKED_ON,
  note: '福岡市内の資産は、区ごとの申告書を用意し、同じ提出先へ出します。',
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
  formNotice: {
    text: '令和9年度の様式は公開を確認できていません（2026/11/18確認）。',
    actionLabel: '最新の様式を公式サイトで確認',
    url: 'https://www.city.kitakyushu.lg.jp/contents/division260list.html',
  },
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

const R9_UNCONFIRMED = '令和9年度の様式は公開を確認できていません（2026/11/19確認）。';
const R9_ACTION = '最新の様式を公式サイトで確認';
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
  formNotice: { text: R9_UNCONFIRMED, actionLabel: R9_ACTION, url: SENDAI_URL },
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
  formNotice: { text: R9_UNCONFIRMED, actionLabel: R9_ACTION, url: SAITAMA_URL },
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
  formNotice: { text: R9_UNCONFIRMED, actionLabel: R9_ACTION, url: CHIBA_URL },
} as const;

type CityDestination = Omit<AssetSubmissionDestination, 'jisCode' | 'wardLabel'>;

export interface AssetCityGroup {
  cityLabel: string;
  wards: ReadonlyArray<{ code: string; label: string }>;
  destination: CityDestination;
}

/** 選択肢の表示順（福岡市・北九州市・仙台市・さいたま市・千葉市）。画面はこの配列を回す。 */
export const ASSET_CITY_GROUPS: ReadonlyArray<AssetCityGroup> = [
  { cityLabel: '福岡市', wards: ASSET_WARDS, destination: FUKUOKA_DESTINATION },
  { cityLabel: '北九州市', wards: KITAKYUSHU_WARDS, destination: KITAKYUSHU_DESTINATION },
  { cityLabel: '仙台市', wards: SENDAI_WARDS, destination: SENDAI_DESTINATION },
  { cityLabel: 'さいたま市', wards: SAITAMA_WARDS, destination: SAITAMA_DESTINATION },
  { cityLabel: '千葉市', wards: CHIBA_WARDS, destination: CHIBA_DESTINATION },
];

/** 6桁の文字列（全国地方公共団体コード）と完全一致する対応5市の区のみ。それ以外はnull（未対応）。 */
export function lookupAssetSubmissionDestination(code: unknown): AssetSubmissionDestination | null {
  if (typeof code !== 'string') return null;
  for (const g of ASSET_CITY_GROUPS) {
    const w = g.wards.find((x) => x.code === code);
    if (w) return { jisCode: w.code, wardLabel: w.label, ...g.destination };
  }
  return null;
}
