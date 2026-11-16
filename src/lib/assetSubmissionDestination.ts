// 償却資産の提出先案内（資産の所在地を明示選択したときだけ）。純粋な参照のみ。
// 会社所在地・チャットからの自動選択はしない。対応範囲：福岡市の7区。
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
}

export const ASSET_WARDS = [
  { code: '401315', label: '東区' },
  { code: '401323', label: '博多区' },
  { code: '401331', label: '中央区' },
  { code: '401340', label: '南区' },
  { code: '401358', label: '城南区' },
  { code: '401366', label: '早良区' },
  { code: '401374', label: '西区' },
] as const;

export const OTHER_REGION_VALUE = 'other';
export const ASSET_DESTINATION_COVERAGE = '福岡市（7区）';
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

/** 6桁の文字列（全国地方公共団体コード）と完全一致する福岡市7区のみ。それ以外はnull（未対応）。 */
export function lookupAssetSubmissionDestination(code: unknown): AssetSubmissionDestination | null {
  if (typeof code !== 'string') return null;
  const ward = ASSET_WARDS.find((w) => w.code === code);
  if (!ward) return null;
  return { jisCode: ward.code, wardLabel: ward.label, ...FUKUOKA_DESTINATION };
}
