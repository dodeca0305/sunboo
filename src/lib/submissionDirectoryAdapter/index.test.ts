import test from 'node:test';
import assert from 'node:assert/strict';

import { toPreviewView } from './index.ts';
import type { SubmissionOfficeResolution } from '../submissionDirectory/index.ts';

// ── toPreviewView のユニットテスト（Phase5-1 補強作業2）───────────────────
// Supabaseに一切依存しない。SubmissionOfficeResolution と同じ形の固定データ（フィクスチャ）を
// 使い、src/lib/submissionDirectoryAdapter/index.ts の純粋関数のみを検証する。
// 実行: `node --test src/lib/submissionDirectoryAdapter/index.test.ts`
// （既存 resolve.test.ts と同じ運用、Node 24のネイティブTypeScript実行、追加パッケージ不要）。

function baseResolution(overrides: Partial<SubmissionOfficeResolution>): SubmissionOfficeResolution {
  return {
    status: 'not_supported',
    primaryOffice: null,
    alternativeOffices: [],
    reason: '',
    source: null,
    verificationStatus: null,
    lastVerifiedAt: null,
    publicVerificationLabel: null,
    requiredAction: null,
    metadata: {},
    ...overrides,
  };
}

test('resolved / matchedRuleId=null: 既定提出先が使われた場合、office名・verificationStatusを保持し、matchedRuleIdはnullのまま返す', () => {
  const resolution = baseResolution({
    status: 'resolved',
    primaryOffice: {
      officeCategory: 'municipal_tax',
      name: '中央市税事務所諸税課法人市民税係',
      organizationName: '札幌市',
      address: '札幌市中央区南3条西11丁目',
      phone: '011-596-6796',
      officialUrl: 'https://www.city.sapporo.jp/citytax/syurui/shiminzei/hojin.html',
      websiteUrl: 'https://www.city.sapporo.jp/citytax/syurui/shiminzei/hojin.html',
      mapUrl: null,
      fallbackUrl: null,
    },
    reason: '札幌市中央区の管轄として中央市税事務所諸税課法人市民税係が確定しました',
    verificationStatus: 'unverified',
    publicVerificationLabel: '（未確認）',
    metadata: { officeCategory: 'municipal_tax', matchedRuleId: null },
  });

  const view = toPreviewView(resolution);

  assert.equal(view.status, 'resolved');
  assert.equal(view.officeName, '中央市税事務所諸税課法人市民税係');
  assert.equal(view.verificationStatus, 'unverified');
  assert.equal(view.matchedRuleId, null);
});

test('resolved / matchedRuleIdあり: procedure_submission_rulesが適用された場合、office名とmatchedRuleIdの数値を保持する', () => {
  const resolution = baseResolution({
    status: 'resolved',
    primaryOffice: {
      officeCategory: 'municipal_asset_tax',
      name: '中央市税事務所固定資産税課償却資産担当',
      organizationName: '札幌市',
      address: '札幌市中央区南3条西11丁目',
      phone: '011-596-7303',
      officialUrl: 'https://www.city.sapporo.jp/citytax/syurui/kotei_toshi/shokyaku.html',
      websiteUrl: 'https://www.city.sapporo.jp/citytax/syurui/kotei_toshi/shokyaku.html',
      mapUrl: null,
      fallbackUrl: null,
    },
    reason: '札幌市中央区の管轄として中央市税事務所固定資産税課償却資産担当が確定しました（手続き別の判定ルールを適用）',
    verificationStatus: 'unverified',
    publicVerificationLabel: '（未確認）',
    metadata: { officeCategory: 'municipal_asset_tax', matchedRuleId: 3 },
  });

  const view = toPreviewView(resolution);

  assert.equal(view.officeName, '中央市税事務所固定資産税課償却資産担当');
  assert.equal(view.matchedRuleId, 3);
});

test('not_supported: primaryOfficeが無い状態を安全に扱い、存在しないoffice名を捏造しない', () => {
  const resolution = baseResolution({
    status: 'not_supported',
    primaryOffice: null,
    reason: '北九州市門司区はまだ対応エリア外のため、提出先情報がありません。',
    verificationStatus: null,
    publicVerificationLabel: null,
    metadata: { officeCategory: 'municipal_asset_tax' },
  });

  const view = toPreviewView(resolution);

  assert.equal(view.status, 'not_supported');
  assert.equal(view.officeName, null);
  assert.equal(view.address, null);
  assert.equal(view.phone, null);
});

test('requires_employee_address: office名を生成せず、reasonをそのまま保持する', () => {
  const resolution = baseResolution({
    status: 'requires_employee_address',
    primaryOffice: null,
    reason: 'この手続きは会社所在地ではなく、従業員ごとの1月1日時点の住所地市区町村が提出先になります。',
    verificationStatus: null,
    publicVerificationLabel: null,
    metadata: { officeCategory: 'municipal_tax' },
  });

  const view = toPreviewView(resolution);

  assert.equal(view.status, 'requires_employee_address');
  assert.equal(view.officeName, null);
  assert.equal(
    view.reason,
    'この手続きは会社所在地ではなく、従業員ごとの1月1日時点の住所地市区町村が提出先になります。',
  );
});

test('insufficient_profile（型上存在するが上記4ケースでは扱っていないstatus）: office名を生成せず、reasonを安全に扱う', () => {
  const resolution = baseResolution({
    status: 'insufficient_profile',
    primaryOffice: null,
    reason: '会社情報の入力が完了すると提出先が表示されます。',
    verificationStatus: null,
    publicVerificationLabel: null,
    metadata: { officeCategory: null },
  });

  const view = toPreviewView(resolution);

  assert.equal(view.status, 'insufficient_profile');
  assert.equal(view.officeName, null);
  assert.equal(view.reason, '会社情報の入力が完了すると提出先が表示されます。');
});
