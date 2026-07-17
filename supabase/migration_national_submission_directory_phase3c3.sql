-- ============================================================
-- SUNBOO経営ナビ — National Submission Directory Phase3C-3
-- 「Kitakyushu City Pilot」ADR D13（office_category細分化）の汎用性検証（第2都市）
-- ============================================================
-- 目的: 福岡市（Phase3C-2）に続き、北九州市7判定単位を対象に、municipal_tax/municipal_asset_tax
-- の2カテゴリだけで提出先を表現できるかを検証する。
--
-- 【重要: 北九州市は福岡市と異なり、償却資産申告(DEPRECIABLE_ASSET_TAX_RETURN)の提出先部署が
-- 一次情報で確認できていない】
-- docs/PHASE3C_MUNICIPAL_TAX_DISCOVERY.md は北九州市について以下のみを確認済み:
--   - 法人市民税申告 → 財政・変革局税務部課税第一課（1-3節、公式ページを直接フェッチ済み）
--   - 特別徴収（RESIDENT_TAX_WITHHOLDING、対象手続き外）→ 課税第二課（1-2節、一覧ページのみ）
--   - 課税第一課と課税第二課が同一部署の別名か別業務かは未確認（8節-4）
-- 償却資産申告を担当する部署（資産課税課相当）は、福岡市のように別部署なのか課税第一課に
-- 統合されているのか、一次情報・二次情報ともに一切存在しない。
-- 【推測で埋めない】。本Migrationは municipal_tax（法人市民税、課税第一課）のみを投入し、
-- municipal_asset_tax（償却資産）は北九州市分のsubmission_offices/submission_jurisdictionsを
-- 投入しない。これにより DEPRECIABLE_ASSET_TAX_RETURN × 北九州市 は本Migration適用後も
-- not_supported のまま — データ未確認を正直に表す、意図した結果である。
--
-- 【前提（本Migrationでは変更しない、依存データ）】
--   - supabase/migration_national_submission_directory_phase3c1.sql が適用済みであること
--     （organization_types.code='municipal_asset_tax'、procedure_submission_rulesの無条件ルール）
--     → REST（anonキー、読み取りのみ）で本番適用済みを確認済み
--   - supabase/migration_national_submission_directory_phase3c2.sql（福岡市Pilot）との依存関係は無い
--     （対象municipality_codeが完全に別のため独立して適用可能）。ただし本Migration作成時点で
--     REST確認したところ、Phase3C-2のsubmission_offices/submission_jurisdictions
--     （municipal_tax/municipal_asset_tax）は0件のままであり、【Phase3C-2はまだ本番未反映】と
--     見られる。事実として報告する（本Migrationの動作自体には影響しない）。
--
-- 【対象】北九州市7判定単位のみ（401013門司区/401030若松区/401056戸畑区/401064小倉北区/
-- 401072小倉南区/401081八幡東区/401099八幡西区）。福岡市・その他自治体・全国データは対象外。
--
-- 【変更しないもの】
--   - src/lib/submissionDirectory/resolve.ts / dataAccess.ts / stateModel.ts / explain.ts（無変更）
--   - procedures テーブル本体（Procedure Master）
--   - organization_types（新規追加なし。Phase3C-1のmunicipal_asset_taxをそのまま参照）
--   - procedure_submission_rules（新規追加なし。Phase3C-1の全国一律ルールをそのまま利用）
--
-- Supabase ダッシュボード → SQL Editor で実行してください。
-- 再実行しても安全（ON CONFLICT / NOT EXISTS ガードを使用）。
-- ============================================================

-- ============================================================
-- 0. 依存データの存在確認
-- ============================================================

DO $$
DECLARE
  kitakyushu_count INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM organization_types WHERE code = 'municipal_asset_tax') THEN
    RAISE WARNING 'Phase3C-3: organization_types.code=municipal_asset_tax が見つかりません。Phase3C-1が未適用の可能性があります。';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM procedures WHERE code = 'MUNICIPAL_RESIDENT_TAX_RETURN') THEN
    RAISE WARNING 'Phase3C-3: procedures.code=MUNICIPAL_RESIDENT_TAX_RETURN が見つかりません。';
  END IF;

  SELECT COUNT(*) INTO kitakyushu_count
  FROM municipalities WHERE code IN ('401013','401030','401056','401064','401072','401081','401099');
  IF kitakyushu_count <> 7 THEN
    RAISE WARNING 'Phase3C-3: 北九州市7判定単位のうち%件しかmunicipalitiesに見つかりません。3節の投入が一部欠落する可能性があります。', kitakyushu_count;
  ELSE
    RAISE NOTICE 'Phase3C-3: 北九州市7判定単位は全件存在（想定通り）。';
  END IF;

  RAISE NOTICE 'Phase3C-3: municipal_asset_tax（償却資産申告の提出先）は北九州市分を投入しない。一次情報が存在しないため（docs/PHASE3C_MUNICIPAL_TAX_DISCOVERY.md、北九州市の資産課税担当は未調査）。DEPRECIABLE_ASSET_TAX_RETURN×北九州市は引き続き not_supported が正しい結果。';
END $$;

-- ============================================================
-- 1. submission_offices（1件: municipal_tax のみ。municipal_asset_taxは投入しない）
-- ============================================================
-- 情報源: docs/PHASE3C_MUNICIPAL_TAX_DISCOVERY.md 1-3節（北九州市公式サイトを直接フェッチ済み）。
-- 電話番号は個別ページに記載が無く未取得（同節「―（未取得）」）。一覧ページ（1-2節）の
-- 093-967-6951は別部署（課税第二課、特別徴収担当）の番号であり、課税第一課の番号として
-- 転用しない（部署が違えば電話も違う可能性が高く、断定を避ける）。

INSERT INTO submission_offices (
  office_category, organization_name, name, postal_code, address, phone, fax, email,
  website_url, official_url, e_filing_url, download_page_url, map_url, business_hours, notes,
  official_url_status, official_url_checked_at, fallback_url, update_frequency
)
VALUES (
  'municipal_tax', '北九州市', '財政・変革局税務部課税第一課', '803-8501',
  '北九州市小倉北区城内1-1', NULL, NULL, NULL,
  'https://www.city.kitakyushu.lg.jp/kurashi/menu01_00224.html',
  'https://www.city.kitakyushu.lg.jp/kurashi/menu01_00224.html',
  NULL, NULL, NULL, NULL,
  '電話番号は個別ページに記載が無く未取得（docs/PHASE3C_MUNICIPAL_TAX_DISCOVERY.md 1-3節）。一覧ページ記載の093-967-6951は課税第二課（特別徴収担当）の番号であり、部署が異なるため課税第一課の番号として転用しない。課税第一課と課税第二課の関係（同一部署の別名か別業務か）も未確認（同8節-4）。償却資産申告（DEPRECIABLE_ASSET_TAX_RETURN）の担当部署は未調査のため、この窓口をmunicipal_asset_taxとしても登録しない。',
  'unchecked', NULL, NULL, 'annual'
)
ON CONFLICT (office_category, name) DO UPDATE SET
  organization_name = EXCLUDED.organization_name,
  postal_code = EXCLUDED.postal_code,
  address = EXCLUDED.address,
  website_url = EXCLUDED.website_url,
  official_url = EXCLUDED.official_url,
  notes = EXCLUDED.notes,
  official_url_status = EXCLUDED.official_url_status,
  updated_at = NOW();

-- ============================================================
-- 2. office_sources（1件）
-- ============================================================

INSERT INTO office_sources (
  office_id, source_type, publisher_name, source_url, retrieved_at, verification_method, status, is_current, notes
)
SELECT
  so.id,
  'municipal_government',
  '北九州市',
  'https://www.city.kitakyushu.lg.jp/kurashi/menu01_00224.html',
  '2026-07-17',
  'official_page_check',
  'active',
  true,
  '公式ページを直接フェッチして確認済み（docs/PHASE3C_MUNICIPAL_TAX_DISCOVERY.md 1-3節）。電話番号は同ページに記載が無い。償却資産申告の担当部署は未調査。'
FROM submission_offices so
WHERE so.office_category = 'municipal_tax' AND so.name = '財政・変革局税務部課税第一課'
ON CONFLICT (office_id) WHERE is_current = true DO UPDATE SET
  retrieved_at = EXCLUDED.retrieved_at, notes = EXCLUDED.notes;

-- ============================================================
-- 3. submission_jurisdictions（7件: municipal_tax のみ。municipal_asset_taxは0件のまま）
-- ============================================================
-- 北九州市7区も福岡市と同じく「区ごとではなく市に1箇所へ集約」される
-- （docs/PHASE3C_MUNICIPAL_TAX_DISCOVERY.md 4節）。7行すべてが同一office_idを参照する。

WITH kitakyushu_wards(municipality_code) AS (
  VALUES ('401013'), ('401030'), ('401056'), ('401064'), ('401072'), ('401081'), ('401099')
)
INSERT INTO submission_jurisdictions (office_id, office_category, scope_type, municipality_scope_id, is_primary, priority, notes)
SELECT so.id, 'municipal_tax', 'municipality', m.id, true, 0, NULL
FROM kitakyushu_wards kw
JOIN municipalities m ON m.code = kw.municipality_code
CROSS JOIN (SELECT id FROM submission_offices WHERE office_category = 'municipal_tax' AND name = '財政・変革局税務部課税第一課') so
ON CONFLICT (municipality_scope_id, office_category) WHERE scope_type = 'municipality' AND is_primary = true AND effective_to IS NULL
DO UPDATE SET office_id = EXCLUDED.office_id, updated_at = NOW();

-- municipal_asset_tax（北九州市分）は意図的に投入しない（0件のまま）。理由は本ファイル冒頭コメント参照。

-- ============================================================
-- 4. 検証SQL
-- ============================================================

-- 4-1. 窓口数（期待値: municipal_tax=1、北九州市分の municipal_asset_tax=0）
SELECT so.office_category, COUNT(*) AS office_count
FROM submission_offices so
WHERE so.office_category IN ('municipal_tax', 'municipal_asset_tax')
  AND so.name = '財政・変革局税務部課税第一課'
GROUP BY so.office_category;

-- 4-2. 北九州市7判定単位の収束確認（期待値: municipal_tax → distinct_offices=1, rows=7）
SELECT sj.office_category, COUNT(DISTINCT sj.office_id) AS distinct_offices, COUNT(*) AS jurisdiction_rows
FROM submission_jurisdictions sj
JOIN municipalities m ON m.id = sj.municipality_scope_id
WHERE m.code IN ('401013','401030','401056','401064','401072','401081','401099')
  AND sj.is_primary = true AND sj.effective_to IS NULL
GROUP BY sj.office_category;

-- 4-3. 【意図した空】北九州市に municipal_asset_tax の管轄が無いことの確認（期待値: 0行、正常）
SELECT sj.*
FROM submission_jurisdictions sj
JOIN municipalities m ON m.id = sj.municipality_scope_id
WHERE m.code IN ('401013','401030','401056','401064','401072','401081','401099')
  AND sj.office_category = 'municipal_asset_tax';

-- 4-4. 北九州市7判定単位のmunicipal_tax網羅チェック（期待値: 0行＝欠落なし）
SELECT m.code, m.name
FROM municipalities m
WHERE m.code IN ('401013','401030','401056','401064','401072','401081','401099')
  AND NOT EXISTS (
    SELECT 1 FROM submission_jurisdictions sj
    WHERE sj.municipality_scope_id = m.id AND sj.office_category = 'municipal_tax'
      AND sj.is_primary = true AND sj.effective_to IS NULL
  );

-- 4-5. ガードレール①: 福岡市（Phase3C-2対象）に本Migrationが影響していないこと（期待値: 変更前と同じ件数、本Migrationでは0行のINSERT/UPDATEも発生しない）
SELECT sj.office_category, COUNT(*) AS rows_touching_fukuoka
FROM submission_jurisdictions sj
JOIN municipalities m ON m.id = sj.municipality_scope_id
WHERE m.code IN ('401315','401323','401331','401340','401358','401366','401374')
  AND sj.office_category IN ('municipal_tax', 'municipal_asset_tax');
-- ↑ Phase3C-2適用済みなら7/7、未適用なら0/0。本Migration自体はこの行に一切書き込まない。

-- 4-6. ガードレール②: 福岡市・北九州市14判定単位以外にmunicipal_tax/municipal_asset_taxが
--      投入されていないこと（期待値: 0行、全国展開していないことの確認）
SELECT sj.office_category, m.code, m.name
FROM submission_jurisdictions sj
JOIN municipalities m ON m.id = sj.municipality_scope_id
WHERE sj.office_category IN ('municipal_tax', 'municipal_asset_tax')
  AND m.code NOT IN (
    '401315','401323','401331','401340','401358','401366','401374',
    '401013','401030','401056','401064','401072','401081','401099'
  );

-- 4-7. ガードレール③: organization_types / procedure_submission_rules が新規追加されていないこと
SELECT COUNT(*) AS organization_types_count FROM organization_types;
SELECT COUNT(*) AS procedure_submission_rules_count FROM procedure_submission_rules;

-- 4-8. RLS健全性
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('submission_offices', 'office_sources', 'submission_jurisdictions');
