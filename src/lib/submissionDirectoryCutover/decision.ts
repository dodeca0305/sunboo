import type { LinkStatus } from '@/lib/types';
import type { ScheduleProcedure } from '@/lib/scheduleProcedure';
import type { PublicOfficeView, ResolutionStatus, VerificationStatus } from '@/lib/submissionDirectory';

// ── Submission Directory Cutover — 判定ロジック（DBアクセスなし、純粋関数のみ）───────
// 設計: docs/PHASE5_UI_CUTOVER_PLAN.md Part C。
//
// このファイルは意図的に「値」のimportを一切持たない（すべて import type のみ）。
// Node 24のネイティブTypeScript実行では型のみimportは実行時に消去されるため、DBアクセスを伴う
// src/lib/submissionDirectory/ を実際に読み込まずに単体テストできる（`node --test
// src/lib/submissionDirectoryCutover/index.test.ts` で直接実行可能）。
// 対象データ（旧targets.ts相当）もこのファイルへ統合してある。相対importを1つでも持つと、
// 本ファイルを拡張子なしで書く限りNode ESM解決で失敗し（既存resolve.test.tsと同じ既知の問題）、
// かといって拡張子を付けると`npm run build`がTS5097（`allowImportingTsExtensions`未設定）で
// 失敗する。相対importそのものを無くすことで両方を満たす（テストのためだけに本番仕様を歪めない、
// tsconfig.jsonも変更しない）。
// applyCutoverToProcedure等のDBアクセスを伴うオーケストレーションは index.ts 側に置く。

// ── 対象定義（旧 targets.ts） ────────────────────────────────────────────

export type CutoverTarget = {
  cityLabel: string;
  municipalityCodes: readonly string[];
  procedureIds: readonly number[];
};

// 札幌市10区（Phase4「Sapporo City Pilot」で投入済み）
const SAPPORO_WARD_CODES = [
  '011011', '011029', '011037', '011045', '011053',
  '011061', '011070', '011088', '011096', '011100',
] as const;

// 福岡市7区（Phase3C-2「Fukuoka City Pilot」で投入済み）
const FUKUOKA_CITY_WARD_CODES = [
  '401315', '401323', '401331', '401340', '401358', '401366', '401374',
] as const;

// 北九州市7区（Phase3C-3「Kitakyushu City Pilot」で投入済み）
const KITAKYUSHU_CITY_WARD_CODES = [
  '401013', '401030', '401056', '401064', '401072', '401081', '401099',
] as const;

// procedures.id（本番DBの実値、Phase3〜4のMigration・Resolver検証で一貫して使用）
const MUNICIPAL_RESIDENT_TAX_RETURN_ID = 65; // 法人市民税申告
const DEPRECIABLE_ASSET_TAX_RETURN_ID = 66; // 償却資産申告

// docs/PHASE5_UI_CUTOVER_PLAN.md C-3・C-4節の通り:
//   札幌市: 法人市民税・償却資産の両方が対象
//   福岡市: 法人市民税のみが対象
//   北九州市: 法人市民税のみが対象（償却資産は資産税担当データ未投入のため対象外）
export const PHASE5_2_CUTOVER_TARGETS: readonly CutoverTarget[] = [
  {
    cityLabel: '札幌市',
    municipalityCodes: SAPPORO_WARD_CODES,
    procedureIds: [MUNICIPAL_RESIDENT_TAX_RETURN_ID, DEPRECIABLE_ASSET_TAX_RETURN_ID],
  },
  {
    cityLabel: '福岡市',
    municipalityCodes: FUKUOKA_CITY_WARD_CODES,
    procedureIds: [MUNICIPAL_RESIDENT_TAX_RETURN_ID],
  },
  {
    cityLabel: '北九州市',
    municipalityCodes: KITAKYUSHU_CITY_WARD_CODES,
    procedureIds: [MUNICIPAL_RESIDENT_TAX_RETURN_ID],
  },
];

// (municipalityCode, procedureId) の組がPhase5-2初期対象かどうかを判定する。
// municipalityCodeがnull・未知の場合は必ずfalse（安全側に倒す、Unknown is better than Wrong）。
export function isPhase5_2Target(municipalityCode: string | null, procedureId: number): boolean {
  if (!municipalityCode) return false;
  return PHASE5_2_CUTOVER_TARGETS.some(
    (target) =>
      target.municipalityCodes.includes(municipalityCode) && target.procedureIds.includes(procedureId),
  );
}

// ── 切り替え判定 ────────────────────────────────────────────────────────

// Phase5-2の中核判定: 対象(municipalityCode, procedureId)であり、かつ新Resolverの結果が
// resolvedである場合にのみ新結果を採用してよい。この2条件のANDのみが「採用してよい」の根拠であり、
// どちらか一方でも欠ければ必ずfalse（旧結果維持）を返す。
export function shouldUseCutoverResult(params: {
  municipalityCode: string | null;
  procedureId: number;
  status: ResolutionStatus;
}): boolean {
  if (!isPhase5_2Target(params.municipalityCode, params.procedureId)) return false;
  return params.status === 'resolved';
}

// verificationStatus（新方式、2値）を、既存UIが読むofficial_url_status（LinkStatus、4値）へ
// 変換する。既存の表示コンポーネント（OfficialSiteLink・buildRoadmapSubmissionInfo）を
// 一切変更せずに新データを流し込むための橋渡し。'broken'/'redirected'に相当する状態は
// 新方式にまだ存在しないため生成しない（無い情報を捏造しない）。
function toLinkStatus(verificationStatus: VerificationStatus | null): LinkStatus | undefined {
  if (verificationStatus === 'unverified') return 'unchecked';
  if (verificationStatus === 'verified') return 'ok';
  return undefined;
}

// 新Resolverの窓口情報（PublicOfficeView）を、旧ScheduleProcedure.officeへ「重ね合わせる」。
// 新Resolverに値が無いフィールド（null）は旧値をそのまま残し、消さない
// （official_url/website_url/map_url/fallback_urlはいずれもnull許容のため、フィールドごとに
// 「新の値があれば新、無ければ旧を維持」という非破壊的マージにする）。officeNameは
// resolved時は必ず非nullであることが保証されているため常に新値を採用する。
// notesはScheduleProcedure.office型に元々存在しないフィールドのため引き継ぎ対象がない。
export function mergeOfficeOverlay(
  oldOffice: ScheduleProcedure['office'],
  newOffice: PublicOfficeView,
  verificationStatus: VerificationStatus | null,
): NonNullable<ScheduleProcedure['office']> {
  const newLinkStatus = toLinkStatus(verificationStatus);
  return {
    name: newOffice.name,
    official_url: newOffice.officialUrl ?? oldOffice?.official_url ?? null,
    website_url: newOffice.websiteUrl ?? oldOffice?.website_url ?? null,
    map_url: newOffice.mapUrl ?? oldOffice?.map_url ?? null,
    fallback_url: newOffice.fallbackUrl ?? oldOffice?.fallback_url ?? null,
    official_url_status: newLinkStatus ?? oldOffice?.official_url_status,
  };
}
