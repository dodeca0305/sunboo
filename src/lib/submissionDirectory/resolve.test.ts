import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPublicVerificationLabel, buildReason, buildRequiredAction } from './explain';
import { matchSubmissionOfficeCandidate } from './resolve';
import { decideStatus, decideVerification } from './stateModel';
import type {
  OfficeSource,
  ProcedureSubmissionRule,
  ResolveCandidateData,
  SubmissionJurisdiction,
  SubmissionOffice,
} from './types';

// ── 判定ロジックのユニットテスト（Phase2: 福岡県パイロット）─────────────
// Supabaseに一切依存しない。福岡県パイロットデータ（supabase/migration_national_submission_directory.sql）
// と同じ形の固定データ（フィクスチャ）を使い、resolve.ts / stateModel.ts / explain.ts の純粋関数のみを検証する。
// 実行: `node --test src/lib/submissionDirectory/resolve.test.ts`（Node 24のネイティブTypeScript実行、
// 追加パッケージ不要）。

const CHUO_KU_ID = 1001; // 福岡市中央区（municipalities.code = 401331 相当）
const HIGASHI_KU_ID = 1002; // 福岡市東区（municipalities.code = 401315 相当）

function office(partial: Partial<SubmissionOffice> & Pick<SubmissionOffice, 'id' | 'officeCategory' | 'name'>): SubmissionOffice {
  return {
    organizationName: null,
    postalCode: null,
    address: null,
    phone: null,
    fax: null,
    email: null,
    websiteUrl: null,
    officialUrl: null,
    eFilingUrl: null,
    downloadPageUrl: null,
    mapUrl: null,
    businessHours: null,
    notes: null,
    officialUrlStatus: 'unchecked',
    officialUrlCheckedAt: null,
    fallbackUrl: null,
    dataVersion: 1,
    lastVerifiedAt: '2026-07-03',
    verificationDueAt: null,
    updateFrequency: 'annual',
    isActive: true,
    ...partial,
  };
}

function jurisdiction(
  partial: Partial<SubmissionJurisdiction> & Pick<SubmissionJurisdiction, 'id' | 'officeId' | 'officeCategory' | 'scopeType'>,
): SubmissionJurisdiction {
  return {
    municipalityScopeId: null,
    prefectureScopeId: null,
    isPrimary: true,
    priority: 0,
    effectiveFrom: '2026-07-03',
    effectiveTo: null,
    notes: null,
    ...partial,
  };
}

// ── フィクスチャ: 福岡県パイロットの代表4件 + 分割管轄1件 ──────────────

const FUKUOKA_TAX_OFFICE = office({ id: 1, officeCategory: 'tax_office', name: '福岡税務署' });
const FUKUOKA_LEGAL_BUREAU = office({ id: 2, officeCategory: 'legal_affairs_bureau', name: '福岡法務局' });
const NAKA_FUKUOKA_PENSION = office({ id: 3, officeCategory: 'pension_office', name: '中福岡年金事務所' });
const FUKUOKA_CHUO_LABOR = office({ id: 4, officeCategory: 'labor_standards', name: '福岡中央労働基準監督署' });
const KASHII_TAX_OFFICE = office({ id: 5, officeCategory: 'tax_office', name: '香椎税務署' });
const HAKATA_TAX_OFFICE = office({ id: 6, officeCategory: 'tax_office', name: '博多税務署' });

const OFFICES_BY_ID = new Map<number, SubmissionOffice>(
  [FUKUOKA_TAX_OFFICE, FUKUOKA_LEGAL_BUREAU, NAKA_FUKUOKA_PENSION, FUKUOKA_CHUO_LABOR, KASHII_TAX_OFFICE, HAKATA_TAX_OFFICE].map(
    (o) => [o.id, o],
  ),
);

const JURISDICTIONS: SubmissionJurisdiction[] = [
  jurisdiction({ id: 1, officeId: 1, officeCategory: 'tax_office', scopeType: 'municipality', municipalityScopeId: CHUO_KU_ID }),
  jurisdiction({ id: 2, officeId: 2, officeCategory: 'legal_affairs_bureau', scopeType: 'municipality', municipalityScopeId: CHUO_KU_ID }),
  jurisdiction({ id: 3, officeId: 3, officeCategory: 'pension_office', scopeType: 'municipality', municipalityScopeId: CHUO_KU_ID }),
  jurisdiction({ id: 4, officeId: 4, officeCategory: 'labor_standards', scopeType: 'municipality', municipalityScopeId: CHUO_KU_ID }),
  jurisdiction({
    id: 5,
    officeId: 5,
    officeCategory: 'tax_office',
    scopeType: 'municipality',
    municipalityScopeId: HIGASHI_KU_ID,
    isPrimary: true,
    priority: 0,
  }),
  jurisdiction({
    id: 6,
    officeId: 6,
    officeCategory: 'tax_office',
    scopeType: 'municipality',
    municipalityScopeId: HIGASHI_KU_ID,
    isPrimary: false,
    priority: 1,
  }),
];

const EACH_EMPLOYEE_RULE: ProcedureSubmissionRule = {
  id: 1,
  procedureId: 200,
  officeCategory: 'municipal_tax',
  conditions: [],
  recipientScope: 'each_employee',
  priority: 0,
  isActive: true,
  notes: null,
};

const CURRENT_SOURCES = new Map<number, OfficeSource>(); // Phase2フィクスチャでは検証対象外（officialUrlStatusのみで判定）

function baseData(overrides: Partial<ResolveCandidateData> = {}): ResolveCandidateData {
  return {
    rules: [],
    jurisdictions: JURISDICTIONS,
    officesById: OFFICES_BY_ID,
    currentSourceByOfficeId: CURRENT_SOURCES,
    ...overrides,
  };
}

// ── 1. 福岡市中央区 × 法人税 → resolved ──────────────────────────
test('福岡市中央区 × 法人税確定申告(tax_office) → resolved、福岡税務署が確定', () => {
  const match = matchSubmissionOfficeCandidate(
    {
      procedureId: 101,
      procedureOfficeType: 'tax_office',
      location: { municipalityId: CHUO_KU_ID, prefectureId: null },
      context: {},
    },
    baseData(),
  );
  assert.equal(decideStatus(match), 'resolved');
  assert.equal(match.kind, 'found');
  if (match.kind === 'found') {
    assert.equal(match.primary.officeId, FUKUOKA_TAX_OFFICE.id);
    assert.equal(match.alternatives.length, 0);
    assert.equal(match.scopeTier, 'municipality');
  }
});

// ── 2. 福岡市中央区 × 役員変更登記 → resolved ────────────────────
test('福岡市中央区 × 役員変更登記(legal_affairs_bureau) → resolved、福岡法務局が確定', () => {
  const match = matchSubmissionOfficeCandidate(
    {
      procedureId: 102,
      procedureOfficeType: 'legal_affairs_bureau',
      location: { municipalityId: CHUO_KU_ID, prefectureId: null },
      context: {},
    },
    baseData(),
  );
  assert.equal(decideStatus(match), 'resolved');
  if (match.kind === 'found') assert.equal(match.primary.officeId, FUKUOKA_LEGAL_BUREAU.id);
});

// ── 3. 福岡市中央区 × 社会保険 → resolved ────────────────────────
test('福岡市中央区 × 社会保険新規適用届(pension_office) → resolved、中福岡年金事務所が確定', () => {
  const match = matchSubmissionOfficeCandidate(
    {
      procedureId: 103,
      procedureOfficeType: 'pension_office',
      location: { municipalityId: CHUO_KU_ID, prefectureId: null },
      context: {},
    },
    baseData(),
  );
  assert.equal(decideStatus(match), 'resolved');
  if (match.kind === 'found') assert.equal(match.primary.officeId, NAKA_FUKUOKA_PENSION.id);
});

// ── 4. 福岡市中央区 × 労働保険年度更新 → resolved ────────────────
test('福岡市中央区 × 労働保険年度更新(labor_standards) → resolved、福岡中央労働基準監督署が確定', () => {
  const match = matchSubmissionOfficeCandidate(
    {
      procedureId: 104,
      procedureOfficeType: 'labor_standards',
      location: { municipalityId: CHUO_KU_ID, prefectureId: null },
      context: {},
    },
    baseData(),
  );
  assert.equal(decideStatus(match), 'resolved');
  if (match.kind === 'found') assert.equal(match.primary.officeId, FUKUOKA_CHUO_LABOR.id);
});

// ── 5. 従業員住所依存手続き → requires_employee_address ──────────
test('給与支払報告書相当（recipient_scope=each_employee） → requires_employee_address、窓口を断定しない', () => {
  const match = matchSubmissionOfficeCandidate(
    {
      procedureId: 200,
      procedureOfficeType: 'municipal_tax',
      location: { municipalityId: CHUO_KU_ID, prefectureId: null },
      context: {},
    },
    baseData({ rules: [EACH_EMPLOYEE_RULE] }),
  );
  assert.equal(decideStatus(match), 'requires_employee_address');
  assert.equal(match.kind, 'requires_employee_address');
  // 会社所在地の窓口を代替表示しないことを確認（primary/alternativeに相当する情報を一切持たない）
  assert.ok(!('primary' in match));
});

// ── 6. プロフィール不足 → insufficient_profile ───────────────────
test('municipality未確定（会社プロフィール不足） → insufficient_profile', () => {
  const match = matchSubmissionOfficeCandidate(
    {
      procedureId: 101,
      procedureOfficeType: 'tax_office',
      location: { municipalityId: null, prefectureId: null },
      context: {},
    },
    baseData(),
  );
  assert.equal(decideStatus(match), 'insufficient_profile');
});

// ── 7. 未対応手続き → not_supported ──────────────────────────────
test('hello_work（Phase2未投入のカテゴリ） → not_supported', () => {
  const match = matchSubmissionOfficeCandidate(
    {
      procedureId: 105,
      procedureOfficeType: 'hello_work',
      location: { municipalityId: CHUO_KU_ID, prefectureId: null },
      context: {},
    },
    baseData(),
  );
  assert.equal(decideStatus(match), 'not_supported');
});

// ── 8. 複数候補 → multiple_candidates ────────────────────────────
test('福岡市東区 × 税務署（香椎/博多の分割管轄） → multiple_candidates、主候補は香椎税務署', () => {
  const match = matchSubmissionOfficeCandidate(
    {
      procedureId: 101,
      procedureOfficeType: 'tax_office',
      location: { municipalityId: HIGASHI_KU_ID, prefectureId: null },
      context: {},
    },
    baseData(),
  );
  assert.equal(decideStatus(match), 'multiple_candidates');
  if (match.kind === 'found') {
    assert.equal(match.primary.officeId, KASHII_TAX_OFFICE.id);
    assert.equal(match.alternatives.length, 1);
    assert.equal(match.alternatives[0].officeId, HAKATA_TAX_OFFICE.id);
  }
});

// ── 9. 情報源未確認 → resolved/multiple_candidates + unverified（副次フラグ） ──
test('official_url_status=unchecked のため、resolvedでもverificationStatus=unverifiedになる', () => {
  const match = matchSubmissionOfficeCandidate(
    {
      procedureId: 101,
      procedureOfficeType: 'tax_office',
      location: { municipalityId: CHUO_KU_ID, prefectureId: null },
      context: {},
    },
    baseData(),
  );
  assert.equal(decideStatus(match), 'resolved');
  assert.equal(FUKUOKA_TAX_OFFICE.officialUrlStatus, 'unchecked');
  const verification = decideVerification(FUKUOKA_TAX_OFFICE, undefined);
  assert.equal(verification, 'unverified');
  assert.equal(buildPublicVerificationLabel(verification), '（未確認）');
});

test('multiple_candidatesでもunverifiedは独立した副次フラグとして共存できる', () => {
  const match = matchSubmissionOfficeCandidate(
    {
      procedureId: 101,
      procedureOfficeType: 'tax_office',
      location: { municipalityId: HIGASHI_KU_ID, prefectureId: null },
      context: {},
    },
    baseData(),
  );
  assert.equal(decideStatus(match), 'multiple_candidates');
  const verification = decideVerification(KASHII_TAX_OFFICE, undefined);
  assert.equal(verification, 'unverified');
});

test('officialUrlStatusが ok かつ再検証期限内なら verified になる', () => {
  const verifiedOffice = office({
    id: 99,
    officeCategory: 'tax_office',
    name: 'テスト検証済み税務署',
    officialUrlStatus: 'ok',
    verificationDueAt: '2099-01-01',
  });
  assert.equal(decideVerification(verifiedOffice, undefined, new Date('2026-07-16')), 'verified');
  assert.equal(buildPublicVerificationLabel('verified'), null);
});

test('verification_due_at超過ならofficial_url_status=okでもunverifiedになる', () => {
  const overdueOffice = office({
    id: 98,
    officeCategory: 'tax_office',
    name: 'テスト期限切れ税務署',
    officialUrlStatus: 'ok',
    verificationDueAt: '2020-01-01',
  });
  assert.equal(decideVerification(overdueOffice, undefined, new Date('2026-07-16')), 'unverified');
});

// ── requiredAction / reason の組み立て ───────────────────────────
test('requiredActionは状態ごとに固定のアクション定数を返す', () => {
  assert.equal(buildRequiredAction('insufficient_profile', null), 'complete_company_profile');
  assert.equal(buildRequiredAction('requires_employee_address', null), 'check_each_employee_address');
  assert.equal(buildRequiredAction('multiple_candidates', 'verified'), 'review_alternative_offices');
  assert.equal(buildRequiredAction('not_supported', null), 'contact_support_or_wait_for_coverage');
  assert.equal(buildRequiredAction('resolved', 'verified'), null);
  assert.equal(buildRequiredAction('resolved', 'unverified'), 'confirm_with_official_source');
});

test('reasonは会社所在地を断定せず従業員住所依存を明示する文言になる', () => {
  const reason = buildReason({
    status: 'requires_employee_address',
    scopeTier: null,
    locationLabel: '福岡市中央区',
    prefectureLabel: '福岡県',
    officeName: null,
    ruleApplied: true,
    hasAlternatives: false,
    verificationStatus: null,
  });
  assert.match(reason, /従業員ごと/);
  assert.doesNotMatch(reason, /福岡市中央区/); // 会社所在地の窓口を代替表示しない（誤案内防止）
});

test('multiple_candidatesのreasonには代替候補がある旨の注記が含まれる', () => {
  const reason = buildReason({
    status: 'multiple_candidates',
    scopeTier: 'municipality',
    locationLabel: '福岡市東区',
    prefectureLabel: '福岡県',
    officeName: '香椎税務署',
    ruleApplied: false,
    hasAlternatives: true,
    verificationStatus: 'unverified',
  });
  assert.match(reason, /香椎税務署/);
  assert.match(reason, /別の窓口が対象になる場合があります/);
});
