import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldUseCutoverResult, mergeOfficeOverlay } from './decision.ts';
import type { PublicOfficeView, ResolutionStatus } from '../submissionDirectory/index.ts';

// ── Submission Directory Cutover のユニットテスト（Phase5-2）───────────────
// DBに一切接続しない。shouldUseCutoverResult（対象判定＋resolved判定）・mergeOfficeOverlay
// （非破壊的な重ね合わせ）という2つの純粋関数のみを検証する。
// 実行: `node --test src/lib/submissionDirectoryCutover/index.test.ts`
// （既存 resolve.test.ts / submissionDirectoryAdapter/index.test.ts と同じ運用、
// Node 24のネイティブTypeScript実行、追加パッケージ不要）。

const MUNICIPAL_RESIDENT_TAX_RETURN_ID = 65;
const DEPRECIABLE_ASSET_TAX_RETURN_ID = 66;
const SALARY_PAYMENT_REPORT_ID = 67;

function shouldUse(municipalityCode: string | null, procedureId: number, status: ResolutionStatus): boolean {
  return shouldUseCutoverResult({ municipalityCode, procedureId, status });
}

test('1. 札幌市中央区 × 法人市民税申告 + resolved → 新結果採用', () => {
  assert.equal(shouldUse('011011', MUNICIPAL_RESIDENT_TAX_RETURN_ID, 'resolved'), true);
});

test('2. 札幌市清田区 × 償却資産申告 + resolved → 新結果採用', () => {
  assert.equal(shouldUse('011100', DEPRECIABLE_ASSET_TAX_RETURN_ID, 'resolved'), true);
});

test('3. 福岡市中央区 × 法人市民税申告 + resolved → 新結果採用', () => {
  assert.equal(shouldUse('401331', MUNICIPAL_RESIDENT_TAX_RETURN_ID, 'resolved'), true);
});

test('4. 北九州市門司区 × 法人市民税申告 + resolved → 新結果採用', () => {
  assert.equal(shouldUse('401013', MUNICIPAL_RESIDENT_TAX_RETURN_ID, 'resolved'), true);
});

test('5. 北九州市門司区 × 償却資産申告 + not_supported → 旧結果維持（対象外の組み合わせ、かつresolvedでもない）', () => {
  assert.equal(shouldUse('401013', DEPRECIABLE_ASSET_TAX_RETURN_ID, 'not_supported'), false);
});

test('6. 給与支払報告書 + requires_employee_address → 旧結果維持（procedureId自体が対象外）', () => {
  assert.equal(shouldUse('011011', SALARY_PAYMENT_REPORT_ID, 'requires_employee_address'), false);
});

test('7. 未対応自治体 + resolved相当入力でも対象外 → 旧結果維持（municipalityCode自体が対象外、statusがresolvedでも採用しない）', () => {
  assert.equal(shouldUse('999999', MUNICIPAL_RESIDENT_TAX_RETURN_ID, 'resolved'), false);
});

test('8. 対象自治体 × 対象手続き + insufficient_profile → 旧結果維持（対象だがresolvedではない）', () => {
  assert.equal(shouldUse('011011', MUNICIPAL_RESIDENT_TAX_RETURN_ID, 'insufficient_profile'), false);
});

// municipalityCode が null（会社プロフィール未確定）の場合も必ずfalse
test('9. municipalityCode=null + resolved相当入力でも対象外 → 旧結果維持', () => {
  assert.equal(shouldUse(null, MUNICIPAL_RESIDENT_TAX_RETURN_ID, 'resolved'), false);
});

// ── mergeOfficeOverlay: 非破壊的な重ね合わせ ──────────────────────────────

function office(partial: Partial<PublicOfficeView> & Pick<PublicOfficeView, 'name'>): PublicOfficeView {
  return {
    officeCategory: 'municipal_tax',
    organizationName: null,
    address: null,
    phone: null,
    officialUrl: null,
    websiteUrl: null,
    mapUrl: null,
    fallbackUrl: null,
    ...partial,
  };
}

test('mergeOfficeOverlay: 新Resolverの値が揃っている場合、officialUrl等はすべて新値を採用する', () => {
  const oldOffice = {
    name: '旧窓口名',
    official_url: 'https://old.example.com',
    website_url: 'https://old-website.example.com',
    map_url: 'https://old-map.example.com',
    fallback_url: 'https://old-fallback.example.com',
    official_url_status: 'ok' as const,
  };
  const newOffice = office({
    name: '新窓口名',
    officialUrl: 'https://new.example.com',
    websiteUrl: 'https://new-website.example.com',
    mapUrl: 'https://new-map.example.com',
    fallbackUrl: 'https://new-fallback.example.com',
  });

  const merged = mergeOfficeOverlay(oldOffice, newOffice, 'verified');

  assert.equal(merged.name, '新窓口名');
  assert.equal(merged.official_url, 'https://new.example.com');
  assert.equal(merged.website_url, 'https://new-website.example.com');
  assert.equal(merged.map_url, 'https://new-map.example.com');
  assert.equal(merged.fallback_url, 'https://new-fallback.example.com');
  assert.equal(merged.official_url_status, 'ok');
});

test('mergeOfficeOverlay: 新Resolverにofficial_url等が無い場合、旧値を消さずに維持する', () => {
  const oldOffice = {
    name: '旧窓口名',
    official_url: 'https://old.example.com',
    website_url: 'https://old-website.example.com',
    map_url: null,
    fallback_url: 'https://old-fallback.example.com',
    official_url_status: 'ok' as const,
  };
  const newOffice = office({ name: '新窓口名' }); // officialUrl等はすべてnull

  const merged = mergeOfficeOverlay(oldOffice, newOffice, null);

  assert.equal(merged.name, '新窓口名'); // 窓口名は常に新値
  assert.equal(merged.official_url, 'https://old.example.com'); // 旧値を維持
  assert.equal(merged.website_url, 'https://old-website.example.com'); // 旧値を維持
  assert.equal(merged.map_url, null);
  assert.equal(merged.fallback_url, 'https://old-fallback.example.com'); // 旧値を維持
  assert.equal(merged.official_url_status, 'ok'); // verificationStatusがnullのため旧値を維持
});

test('mergeOfficeOverlay: verificationStatus=unverifiedはofficial_url_status=uncheckedへ変換される', () => {
  const merged = mergeOfficeOverlay(null, office({ name: '窓口' }), 'unverified');
  assert.equal(merged.official_url_status, 'unchecked');
});
