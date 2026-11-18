// 償却資産の提出先案内（資産の所在地を明示選択したときだけ）。純粋な参照のみ。
// 会社所在地・チャットからの自動選択はしない。対応範囲：福岡市7区と北九州市7区のみ（全国対応ではない）。
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
  /** 様式の公開状況の案内（北九州市のみ）。 */
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
export const ASSET_DESTINATION_COVERAGE = '福岡市（7区）・北九州市（7区）';
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

/** 6桁の文字列（全国地方公共団体コード）と完全一致する福岡市7区・北九州市7区のみ。それ以外はnull（未対応）。 */
export function lookupAssetSubmissionDestination(code: unknown): AssetSubmissionDestination | null {
  if (typeof code !== 'string') return null;
  const f = ASSET_WARDS.find((w) => w.code === code);
  if (f) return { jisCode: f.code, wardLabel: f.label, ...FUKUOKA_DESTINATION };
  const k = KITAKYUSHU_WARDS.find((w) => w.code === code);
  if (k) return { jisCode: k.code, wardLabel: k.label, ...KITAKYUSHU_DESTINATION };
  return null;
}
