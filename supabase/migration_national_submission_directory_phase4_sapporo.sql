-- ============================================================
-- SUNBOO経営ナビ — National Submission Directory Phase4「Sapporo City」
-- 「札幌市 提出先データ投入」（municipal_tax / municipal_asset_tax）
-- ============================================================
-- 目的: 札幌市10区を対象に、法人市民税申告（MUNICIPAL_RESIDENT_TAX_RETURN）・
-- 償却資産申告（DEPRECIABLE_ASSET_TAX_RETURN）の提出先を投入する。
-- 根拠: docs/MUNICIPAL_DISCOVERY/sapporo.md（承認済みDiscovery）
--       docs/ADR_MUNICIPAL_TAX_OFFICE_CATEGORY_SPLIT.md（D13、office_category分割の採用根拠）
--       docs/MUNICIPAL_DISCOVERY_CHECKLIST.md（本Migrationが従う実装手順）
--
-- 【前提（本Migrationでは変更しない、依存データ）】
--   - migration_designated_cities_geography.sql が適用済みであること
--     （prefectures=47、municipalities=230、札幌市10区の municipality_code が存在すること）
--     → 本Migration作成時にREST（anonキー、読み取りのみ）で本番適用済みを確認済み
--   - migration_national_submission_directory_phase3c1.sql が適用済みであること
--     （organization_types.code='municipal_asset_tax'（id=27）、
--      procedure_submission_rules: DEPRECIABLE_ASSET_TAX_RETURN → municipal_asset_tax の
--      無条件ルール（id=3））→ 同様に確認済み
--
-- 【部署構造: 分割型（docs/MUNICIPAL_DISCOVERY/sapporo.md「部署構造」節）】
-- 福岡市と同型のパターン。同一の中央市税事務所内で、法人市民税と償却資産（固定資産税）を
-- 別の課が担当する。両部署とも公式ページを直接フェッチして確認済み（一次情報、
-- Fukuoka Cityの資産課税課とは異なり二次情報での補完は無い）。
--   - 法人市民税: 中央市税事務所諸税課法人市民税係
--   - 償却資産: 中央市税事務所固定資産税課償却資産担当
--
-- 【重要: 5つの「市税事務所」による区分割の外側に、法人市民税・償却資産の一括担当特例がある】
-- 札幌市は住民税等の一般業務では中央・北部・東部・南部・西部の5市税事務所が区を分担するが、
-- 法人市民税・固定資産税（償却資産分）に限っては、公式ページ原文
-- 「次の税目の申告・申請・課税内容の確認などは、市内全区を一括として中央市税事務所が
-- 担当しています。・法人市民税・固定資産税（償却資産分）」（情報源:
-- https://www.city.sapporo.jp/citytax/shizei_jimusho/index.html）の通り、
-- 中央市税事務所が市内10区すべてを一括担当する。区ごとに異なる市税事務所を提出先として
-- 誤登録しないこと（MUNICIPAL_DISCOVERY_CHECKLIST.md 4節Step4「政令指定都市の追加確認事項」）。
--
-- 【対象】札幌市10区のみ（011011中央区/011029北区/011037東区/011045白石区/011053豊平区/
-- 011061南区/011070西区/011088厚別区/011096手稲区/011100清田区）。他都市・全国データは対象外。
--
-- 【変更しないもの】
--   - src/lib/submissionDirectory/resolve.ts / dataAccess.ts / stateModel.ts / explain.ts（無変更）
--   - procedures テーブル本体（Procedure Master）
--   - organization_types（新規追加なし。Phase3C-1のmunicipal_asset_taxをそのまま参照）
--   - procedure_submission_rules（新規追加なし。Phase3C-1の全国一律ルールをそのまま利用）
--   - 他都市（福岡市・北九州市）・地理マスタ（prefectures/municipalities）は本Migrationでは
--     一切書き込まない（SELECT/JOINのみで参照する）
--
-- Supabase ダッシュボード → SQL Editor で実行してください。
-- 再実行しても安全（ON CONFLICT / NOT EXISTS ガードを使用）。
-- 複数ステートメントを一度に実行すると検証SQLは最後の1件しか結果グリッドに表示されないため、
-- セクションごとに分けて実行することを推奨する。
-- ============================================================

-- ============================================================
-- 0. 依存データの存在確認
-- ============================================================

DO $$
DECLARE
  sapporo_ward_count INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM organization_types WHERE code = 'municipal_asset_tax') THEN
    RAISE WARNING 'Sapporo: organization_types.code=municipal_asset_tax が見つかりません。Phase3C-1が未適用の可能性があります。';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM procedures WHERE code = 'MUNICIPAL_RESIDENT_TAX_RETURN') THEN
    RAISE WARNING 'Sapporo: procedures.code=MUNICIPAL_RESIDENT_TAX_RETURN が見つかりません。';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM procedure_submission_rules psr
    JOIN procedures p ON p.id = psr.procedure_id
    WHERE p.code = 'DEPRECIABLE_ASSET_TAX_RETURN' AND psr.office_category = 'municipal_asset_tax' AND psr.is_active = true
  ) THEN
    RAISE WARNING 'Sapporo: DEPRECIABLE_ASSET_TAX_RETURN → municipal_asset_tax のprocedure_submission_rulesが見つかりません。';
  END IF;

  SELECT COUNT(*) INTO sapporo_ward_count
  FROM municipalities WHERE code IN ('011011','011029','011037','011045','011053','011061','011070','011088','011096','011100');
  IF sapporo_ward_count <> 10 THEN
    RAISE WARNING 'Sapporo: 札幌市10区のうち%件しかmunicipalitiesに見つかりません。migration_designated_cities_geography.sqlが未適用の可能性があります。3節の投入が一部欠落します。', sapporo_ward_count;
  ELSE
    RAISE NOTICE 'Sapporo: 札幌市10区は全件存在（想定通り）。';
  END IF;
END $$;

-- ============================================================
-- 1. submission_offices（2件: municipal_tax / municipal_asset_tax）
-- ============================================================
-- 情報源: docs/MUNICIPAL_DISCOVERY/sapporo.md（公式ページを直接フェッチして確認済み、一次情報）。

INSERT INTO submission_offices (
  office_category, organization_name, name, postal_code, address, phone, fax, email,
  website_url, official_url, e_filing_url, download_page_url, map_url, business_hours, notes,
  official_url_status, official_url_checked_at, fallback_url, update_frequency
)
VALUES
  (
    'municipal_tax', '札幌市', '中央市税事務所諸税課法人市民税係', '060-8649',
    '札幌市中央区南3条西11丁目', '011-596-6796', NULL, NULL,
    'https://www.city.sapporo.jp/citytax/syurui/shiminzei/hojin.html',
    'https://www.city.sapporo.jp/citytax/syurui/shiminzei/hojin.html',
    NULL, NULL, NULL, NULL,
    '札幌市は一般業務では中央・北部・東部・南部・西部の5市税事務所が区を分担するが、法人市民税に限りこの分担の外側で中央市税事務所が市内10区すべてを一括担当する（公式ページ原文「次の税目の申告・申請・課税内容の確認などは、市内全区を一括として中央市税事務所が担当しています。・法人市民税」、情報源: https://www.city.sapporo.jp/citytax/shizei_jimusho/index.html）。区ごとに異なる市税事務所を提出先として誤登録しないこと。',
    'unchecked', NULL, NULL, 'annual'
  ),
  (
    'municipal_asset_tax', '札幌市', '中央市税事務所固定資産税課償却資産担当', '060-8572',
    '札幌市中央区南3条西11丁目', '011-596-7303', NULL, NULL,
    'https://www.city.sapporo.jp/citytax/syurui/kotei_toshi/shokyaku.html',
    'https://www.city.sapporo.jp/citytax/syurui/kotei_toshi/shokyaku.html',
    NULL, NULL, NULL, NULL,
    '法人市民税係（諸税課）とは別課。同じ中央市税事務所内だが郵便番号も別（060-8572）。固定資産税（償却資産分）についても市内10区すべてを中央市税事務所が一括担当する（公式ページ原文は法人市民税係と同一ページに記載、情報源: https://www.city.sapporo.jp/citytax/shizei_jimusho/index.html）。',
    'unchecked', NULL, NULL, 'annual'
  )
ON CONFLICT (office_category, name) DO UPDATE SET
  organization_name = EXCLUDED.organization_name,
  postal_code = EXCLUDED.postal_code,
  address = EXCLUDED.address,
  phone = EXCLUDED.phone,
  website_url = EXCLUDED.website_url,
  official_url = EXCLUDED.official_url,
  notes = EXCLUDED.notes,
  official_url_status = EXCLUDED.official_url_status,
  updated_at = NOW();

-- ============================================================
-- 2. office_sources（2件、窓口ごとに1件）
-- ============================================================
-- いずれも公式ページを直接フェッチして確認済み（一次情報、verification_method='official_page_check'）。

INSERT INTO office_sources (
  office_id, source_type, publisher_name, source_url, retrieved_at, verification_method, status, is_current, notes
)
SELECT
  so.id, 'municipal_government', '札幌市',
  'https://www.city.sapporo.jp/citytax/syurui/shiminzei/hojin.html',
  '2026-07-17', 'official_page_check', 'active', true,
  '公式ページを直接フェッチして確認済み（docs/MUNICIPAL_DISCOVERY/sapporo.md）。市内10区一括担当の根拠は市税事務所一覧ページ（https://www.city.sapporo.jp/citytax/shizei_jimusho/index.html）で別途確認済み。'
FROM submission_offices so
WHERE so.office_category = 'municipal_tax' AND so.name = '中央市税事務所諸税課法人市民税係'
ON CONFLICT (office_id) WHERE is_current = true DO UPDATE SET
  retrieved_at = EXCLUDED.retrieved_at, notes = EXCLUDED.notes;

INSERT INTO office_sources (
  office_id, source_type, publisher_name, source_url, retrieved_at, verification_method, status, is_current, notes
)
SELECT
  so.id, 'municipal_government', '札幌市',
  'https://www.city.sapporo.jp/citytax/syurui/kotei_toshi/shokyaku.html',
  '2026-07-17', 'official_page_check', 'active', true,
  '公式ページを直接フェッチして確認済み（docs/MUNICIPAL_DISCOVERY/sapporo.md）。Fukuoka Cityの資産課税課とは異なり、二次情報での補完は無い（一次情報のみで確定）。'
FROM submission_offices so
WHERE so.office_category = 'municipal_asset_tax' AND so.name = '中央市税事務所固定資産税課償却資産担当'
ON CONFLICT (office_id) WHERE is_current = true DO UPDATE SET
  retrieved_at = EXCLUDED.retrieved_at, notes = EXCLUDED.notes;

-- ============================================================
-- 3. submission_jurisdictions（20件: 10区 × 2カテゴリ）
-- ============================================================
-- 札幌市10区すべてが「区ごとではなく市に1箇所へ集約」される（sapporo.md 4節）。
-- 各カテゴリとも10行すべてが同一office_idを参照する。

WITH sapporo_wards(municipality_code) AS (
  VALUES ('011011'), ('011029'), ('011037'), ('011045'), ('011053'),
         ('011061'), ('011070'), ('011088'), ('011096'), ('011100')
)
INSERT INTO submission_jurisdictions (office_id, office_category, scope_type, municipality_scope_id, is_primary, priority, notes)
SELECT so.id, 'municipal_tax', 'municipality', m.id, true, 0, NULL
FROM sapporo_wards sw
JOIN municipalities m ON m.code = sw.municipality_code
CROSS JOIN (SELECT id FROM submission_offices WHERE office_category = 'municipal_tax' AND name = '中央市税事務所諸税課法人市民税係') so
ON CONFLICT (municipality_scope_id, office_category) WHERE scope_type = 'municipality' AND is_primary = true AND effective_to IS NULL
DO UPDATE SET office_id = EXCLUDED.office_id, updated_at = NOW();

WITH sapporo_wards(municipality_code) AS (
  VALUES ('011011'), ('011029'), ('011037'), ('011045'), ('011053'),
         ('011061'), ('011070'), ('011088'), ('011096'), ('011100')
)
INSERT INTO submission_jurisdictions (office_id, office_category, scope_type, municipality_scope_id, is_primary, priority, notes)
SELECT so.id, 'municipal_asset_tax', 'municipality', m.id, true, 0, NULL
FROM sapporo_wards sw
JOIN municipalities m ON m.code = sw.municipality_code
CROSS JOIN (SELECT id FROM submission_offices WHERE office_category = 'municipal_asset_tax' AND name = '中央市税事務所固定資産税課償却資産担当') so
ON CONFLICT (municipality_scope_id, office_category) WHERE scope_type = 'municipality' AND is_primary = true AND effective_to IS NULL
DO UPDATE SET office_id = EXCLUDED.office_id, updated_at = NOW();

-- ============================================================
-- 4. 検証SQL（Validation）
-- ============================================================

-- 4-1. 窓口数（期待値: municipal_tax=1, municipal_asset_tax=1）
SELECT office_category, COUNT(*) AS office_count
FROM submission_offices
WHERE office_category IN ('municipal_tax', 'municipal_asset_tax')
  AND name LIKE '中央市税事務所%'
GROUP BY office_category;

-- 4-2. 【最重要】札幌市10区が、各カテゴリで同一の1窓口に収束していることの確認
--      期待値: municipal_tax → distinct_offices=1, jurisdiction_rows=10
--             municipal_asset_tax → distinct_offices=1, jurisdiction_rows=10
SELECT sj.office_category, COUNT(DISTINCT sj.office_id) AS distinct_offices, COUNT(*) AS jurisdiction_rows
FROM submission_jurisdictions sj
JOIN municipalities m ON m.id = sj.municipality_scope_id
WHERE m.code IN ('011011','011029','011037','011045','011053','011061','011070','011088','011096','011100')
  AND sj.is_primary = true AND sj.effective_to IS NULL
GROUP BY sj.office_category;

-- 4-3. 札幌市10区の網羅チェック（期待値: 0行＝欠落なし）
SELECT m.code, m.name, ot.code AS office_category
FROM municipalities m
CROSS JOIN (SELECT unnest(ARRAY['municipal_tax','municipal_asset_tax']) AS code) ot(code)
WHERE m.code IN ('011011','011029','011037','011045','011053','011061','011070','011088','011096','011100')
  AND NOT EXISTS (
    SELECT 1 FROM submission_jurisdictions sj
    WHERE sj.municipality_scope_id = m.id AND sj.office_category = ot.code
      AND sj.is_primary = true AND sj.effective_to IS NULL
  );

-- 4-4. ガードレール①: 既存都市（福岡市・北九州市）に本Migrationが影響していないこと
--      （期待値: 適用前と同じ件数のまま。本Migrationはこれらの行に一切書き込まない）
SELECT sj.office_category, COUNT(*) AS rows_touching_other_cities
FROM submission_jurisdictions sj
JOIN municipalities m ON m.id = sj.municipality_scope_id
WHERE m.code IN (
  '401315','401323','401331','401340','401358','401366','401374',
  '401013','401030','401056','401064','401072','401081','401099'
)
AND sj.office_category IN ('municipal_tax', 'municipal_asset_tax')
GROUP BY sj.office_category;

-- 4-5. ガードレール②: 札幌市10区以外に本Migrationのoffice_idが投入されていないこと（期待値: 0行）
SELECT sj.office_category, m.code, m.name
FROM submission_jurisdictions sj
JOIN municipalities m ON m.id = sj.municipality_scope_id
JOIN submission_offices so ON so.id = sj.office_id
WHERE so.name LIKE '中央市税事務所%'
  AND m.code NOT IN ('011011','011029','011037','011045','011053','011061','011070','011088','011096','011100');

-- 4-6. ガードレール③: organization_types / procedure_submission_rules が
--      新規追加されていないこと（期待値: 適用前と同じ件数のまま）
SELECT COUNT(*) AS organization_types_count FROM organization_types;
SELECT COUNT(*) AS procedure_submission_rules_count FROM procedure_submission_rules;

-- 4-7. office_sources の紐付け確認（期待値: 2件、is_current=trueが各1件ずつ）
SELECT COUNT(*) AS source_count
FROM office_sources os
JOIN submission_offices so ON so.id = os.office_id
WHERE so.name LIKE '中央市税事務所%' AND os.is_current = true;

-- 4-8. RLS健全性
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('submission_offices', 'office_sources', 'submission_jurisdictions');

-- ============================================================
-- 5. Rollback（本Migrationを取り消す場合）
-- ============================================================
-- 全て新規行のみのため、既存データ（福岡市・北九州市・地理マスタ）に影響を与えずに取り消せる。
-- 実行順序が重要（FK依存の逆順）。

-- DELETE FROM office_sources WHERE office_id IN (
--   SELECT id FROM submission_offices WHERE name IN (
--     '中央市税事務所諸税課法人市民税係', '中央市税事務所固定資産税課償却資産担当'
--   )
-- );
-- DELETE FROM submission_jurisdictions
--   WHERE office_category IN ('municipal_tax', 'municipal_asset_tax')
--   AND municipality_scope_id IN (
--     SELECT id FROM municipalities WHERE code IN (
--       '011011','011029','011037','011045','011053','011061','011070','011088','011096','011100'
--     )
--   );
-- DELETE FROM submission_offices WHERE name IN (
--   '中央市税事務所諸税課法人市民税係', '中央市税事務所固定資産税課償却資産担当'
-- );
--
-- organization_types.code='municipal_asset_tax' と procedure_submission_rules の
-- 無条件ルール（DEPRECIABLE_ASSET_TAX_RETURN → municipal_asset_tax）は、福岡市・北九州市を含む
-- 全国共通データのため、本Rollbackでは絶対に削除しない
-- （MUNICIPAL_DISCOVERY_CHECKLIST.md 9節「国レベル共有データの取り扱い注意」）。
