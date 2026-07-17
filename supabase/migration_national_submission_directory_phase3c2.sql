-- ============================================================
-- SUNBOO経営ナビ — National Submission Directory Phase3C-2
-- 「Fukuoka City Pilot」ADR D13（office_category細分化）が実際に成立するかの実証
-- ============================================================
-- 目的: 福岡市（7判定単位）のみを対象に、法人市民税申告と償却資産申告の提出先が
-- 同一 municipal_tax カテゴリ内で物理的に異なる部署である、という
-- docs/PHASE3C_MUNICIPAL_TAX_DISCOVERY.md 6-2節の実例を、
-- docs/ADR_MUNICIPAL_TAX_OFFICE_CATEGORY_SPLIT.md 選択肢A（office_category分割）で
-- 実際に解決できることをデータ投入のみで検証する。
--
-- 【手続きコードについての注記】
-- 依頼では「CORPORATE_RESIDENT_TAX_RETURN（法人市民税）」とされていたが、Procedure Masterに
-- 該当コードは存在しない（機械的に確認済み）。実際に存在するのは
-- procedures.code = 'MUNICIPAL_RESIDENT_TAX_RETURN'（法人市民税申告、id=65）のみであり、
-- 「Procedure Master変更禁止」の制約上、新規コードは作成せずこの既存コードを対象として扱う。
--
-- 【前提（本Migrationでは変更しない、依存データ）】
--   - supabase/migration_national_submission_directory_phase3c1.sql が適用済みであること
--     （organization_types.code='municipal_asset_tax'、
--      procedure_submission_rules: DEPRECIABLE_ASSET_TAX_RETURN → municipal_asset_tax の無条件ルール）
--   - 上記2点は本番投入済みであることをREST（anonキー、読み取りのみ）で確認済み
--     （organization_types.id=27 = municipal_asset_tax、procedure_submission_rules.id=3）
--   - 本Migrationはこれらを再定義しない（Phase3C-1のMigrationファイルを正本とする、二重管理を避ける）
--
-- 【対象】福岡市7判定単位のみ（401315東区/401323博多区/401331中央区/401340南区/
-- 401358西区/401366城南区/401374早良区）。北九州市・その他自治体・全国データは対象外。
--
-- 【変更しないもの】
--   - src/lib/submissionDirectory/resolve.ts / dataAccess.ts / stateModel.ts / explain.ts（無変更）
--   - procedures テーブル本体（Procedure Master）
--   - organization_types（新規追加なし。Phase3C-1で追加済みのmunicipal_asset_taxをそのまま参照）
--   - procedure_submission_rules（新規追加なし。Phase3C-1の全国一律ルールをそのまま利用）
--
-- 【データ品質についての注記】
--   財政局資産課税課（償却資産申告の提出先）は、docs/PHASE3C_MUNICIPAL_TAX_DISCOVERY.md 1-3節で
--   「検索結果からの二次情報、直接ページ未フェッチ、要再確認」と明記されている。本Migrationでは
--   official_url_status='unchecked'・official_url=NULLのまま正直に投入し、'ok'と断定しない。
--
-- Supabase ダッシュボード → SQL Editor で実行してください。
-- 再実行しても安全（ON CONFLICT / NOT EXISTS ガードを使用）。
-- ============================================================

-- ============================================================
-- 0. 依存データの存在確認
-- ============================================================

DO $$
DECLARE
  fukuoka_city_count INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM organization_types WHERE code = 'municipal_asset_tax') THEN
    RAISE WARNING 'Phase3C-2: organization_types.code=municipal_asset_tax が見つかりません。Phase3C-1（migration_national_submission_directory_phase3c1.sql）が未適用の可能性があります。3節のINSERTがFK制約違反になります。';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM procedures WHERE code = 'MUNICIPAL_RESIDENT_TAX_RETURN') THEN
    RAISE WARNING 'Phase3C-2: procedures.code=MUNICIPAL_RESIDENT_TAX_RETURN が見つかりません。';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM procedures WHERE code = 'DEPRECIABLE_ASSET_TAX_RETURN') THEN
    RAISE WARNING 'Phase3C-2: procedures.code=DEPRECIABLE_ASSET_TAX_RETURN が見つかりません。';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM procedure_submission_rules psr
    JOIN procedures p ON p.id = psr.procedure_id
    WHERE p.code = 'DEPRECIABLE_ASSET_TAX_RETURN' AND psr.office_category = 'municipal_asset_tax' AND psr.is_active = true
  ) THEN
    RAISE WARNING 'Phase3C-2: DEPRECIABLE_ASSET_TAX_RETURN → municipal_asset_tax のprocedure_submission_rulesが見つかりません。償却資産申告の提出先が municipal_tax（法人市民税と同じカテゴリ）のまま解決されてしまいます。';
  END IF;

  SELECT COUNT(*) INTO fukuoka_city_count
  FROM municipalities WHERE code IN ('401315','401323','401331','401340','401358','401366','401374');
  IF fukuoka_city_count <> 7 THEN
    RAISE WARNING 'Phase3C-2: 福岡市7判定単位のうち%件しかmunicipalitiesに見つかりません。3節の投入が一部欠落する可能性があります。', fukuoka_city_count;
  ELSE
    RAISE NOTICE 'Phase3C-2: 福岡市7判定単位は全件存在（想定通り）。';
  END IF;
END $$;

-- ============================================================
-- 1. submission_offices（2件: 法人市民税係 / 資産課税課）
-- ============================================================
-- 情報源: docs/PHASE3C_MUNICIPAL_TAX_DISCOVERY.md 1-3節（福岡市公式サイト直接確認）。
-- 電話番号は情報源間で不一致がある（1-2節の一覧ページ=092-292-3259（法人税務課代表）に対し、
-- 1-3節の個別ページ=092-292-3249（法人市民税係直通））。より具体的な係直通番号（1-3節）を採用し、
-- 代表番号との相違をnotesに記録する（prefectural_taxで踏襲した情報源間不一致の扱いと同じ方針）。

INSERT INTO submission_offices (
  office_category, organization_name, name, postal_code, address, phone, fax, email,
  website_url, official_url, e_filing_url, download_page_url, map_url, business_hours, notes,
  official_url_status, official_url_checked_at, fallback_url, update_frequency
)
VALUES
  (
    'municipal_tax', '福岡市', '財政局法人税務課法人市民税係', '812-8512',
    '福岡市博多区博多駅前2-8-1（博多区役所9階）', '092-292-3249', NULL, NULL,
    'https://www.city.fukuoka.lg.jp/zaisei/zeisei/life/034.html',
    'https://www.city.fukuoka.lg.jp/zaisei/zeisei/life/034.html',
    NULL, NULL, NULL, NULL,
    '一覧ページ（60自治体一覧、docs/PHASE3C_MUNICIPAL_TAX_DISCOVERY.md 1-2節）記載の代表番号092-292-3259とは別に、係直通092-292-3249を個別ページ（1-3節）で確認。個別ページの係直通番号を採用。',
    'unchecked', NULL, NULL, 'annual'
  ),
  (
    'municipal_asset_tax', '福岡市', '財政局資産課税課', NULL,
    '福岡市博多区博多駅前2-8-1（博多区役所9階）', '092-292-2479', NULL, NULL,
    NULL, NULL,
    NULL, NULL, NULL, NULL,
    '【要再確認】検索結果からの二次情報のみで、公式ページの直接フェッチによる一次確認ができていない（docs/PHASE3C_MUNICIPAL_TAX_DISCOVERY.md 1-3節・10-5節）。official_urlは未確認のためNULLのまま。実装（本番反映）前に公式ページでの一次確認を推奨する。',
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

INSERT INTO office_sources (
  office_id, source_type, publisher_name, source_url, retrieved_at, verification_method, status, is_current, notes
)
SELECT
  so.id,
  'municipal_government',
  '福岡市',
  'https://www.city.fukuoka.lg.jp/zaisei/zeisei/life/034.html',
  '2026-07-17',
  'official_page_check',
  'active',
  true,
  '公式ページを直接フェッチして確認済み（docs/PHASE3C_MUNICIPAL_TAX_DISCOVERY.md 1-3節）。電話番号は60自治体一覧ページ（1-2節）記載の代表番号092-292-3259とは別値。'
FROM submission_offices so
WHERE so.office_category = 'municipal_tax' AND so.name = '財政局法人税務課法人市民税係'
ON CONFLICT (office_id) WHERE is_current = true DO UPDATE SET
  source_url = EXCLUDED.source_url, retrieved_at = EXCLUDED.retrieved_at, notes = EXCLUDED.notes;

INSERT INTO office_sources (
  office_id, source_type, publisher_name, source_url, retrieved_at, verification_method, status, is_current, notes
)
SELECT
  so.id,
  'municipal_government',
  '福岡市',
  NULL,
  '2026-07-17',
  'other',
  'active',
  true,
  '【要再確認】公式ページの直接フェッチができておらず、検索結果からの二次情報のみに基づく（docs/PHASE3C_MUNICIPAL_TAX_DISCOVERY.md 1-3節）。verification_methodを official_page_check ではなく other とし、未検証であることを構造化して残す。'
FROM submission_offices so
WHERE so.office_category = 'municipal_asset_tax' AND so.name = '財政局資産課税課'
ON CONFLICT (office_id) WHERE is_current = true DO UPDATE SET
  retrieved_at = EXCLUDED.retrieved_at, notes = EXCLUDED.notes;

-- ============================================================
-- 3. submission_jurisdictions（14件: 7判定単位 × 2カテゴリ）
-- ============================================================
-- 福岡市7判定単位はいずれも「区ごとではなく市に1箇所へ集約」されるため
-- （docs/PHASE3C_MUNICIPAL_TAX_DISCOVERY.md 4節・5節）、7行すべてが同一のoffice_idを参照する。
-- tax_office（福岡法務局）・pension_office等、既存分類が複数市区町村を1窓口に集約するのと
-- 全く同じ構造・同じ投入パターンであり、Resolver側の新しい分岐は不要。

WITH fukuoka_city_wards(municipality_code) AS (
  VALUES ('401315'), ('401323'), ('401331'), ('401340'), ('401358'), ('401366'), ('401374')
)
INSERT INTO submission_jurisdictions (office_id, office_category, scope_type, municipality_scope_id, is_primary, priority, notes)
SELECT so.id, 'municipal_tax', 'municipality', m.id, true, 0, NULL
FROM fukuoka_city_wards fcw
JOIN municipalities m ON m.code = fcw.municipality_code
CROSS JOIN (SELECT id FROM submission_offices WHERE office_category = 'municipal_tax' AND name = '財政局法人税務課法人市民税係') so
ON CONFLICT (municipality_scope_id, office_category) WHERE scope_type = 'municipality' AND is_primary = true AND effective_to IS NULL
DO UPDATE SET office_id = EXCLUDED.office_id, updated_at = NOW();

WITH fukuoka_city_wards(municipality_code) AS (
  VALUES ('401315'), ('401323'), ('401331'), ('401340'), ('401358'), ('401366'), ('401374')
)
INSERT INTO submission_jurisdictions (office_id, office_category, scope_type, municipality_scope_id, is_primary, priority, notes)
SELECT so.id, 'municipal_asset_tax', 'municipality', m.id, true, 0, NULL
FROM fukuoka_city_wards fcw
JOIN municipalities m ON m.code = fcw.municipality_code
CROSS JOIN (SELECT id FROM submission_offices WHERE office_category = 'municipal_asset_tax' AND name = '財政局資産課税課') so
ON CONFLICT (municipality_scope_id, office_category) WHERE scope_type = 'municipality' AND is_primary = true AND effective_to IS NULL
DO UPDATE SET office_id = EXCLUDED.office_id, updated_at = NOW();

-- ============================================================
-- 4. 検証SQL
-- ============================================================

-- 4-1. 窓口数（期待値: municipal_tax=1, municipal_asset_tax=1）
SELECT office_category, COUNT(*) AS office_count
FROM submission_offices
WHERE office_category IN ('municipal_tax', 'municipal_asset_tax')
GROUP BY office_category;

-- 4-2. 【最重要】福岡市7判定単位が、各カテゴリで同一の1窓口に収束していることの確認
--      期待値: municipal_tax → distinct_offices=1, jurisdiction_rows=7
--             municipal_asset_tax → distinct_offices=1, jurisdiction_rows=7
SELECT sj.office_category, COUNT(DISTINCT sj.office_id) AS distinct_offices, COUNT(*) AS jurisdiction_rows
FROM submission_jurisdictions sj
JOIN municipalities m ON m.id = sj.municipality_scope_id
WHERE sj.office_category IN ('municipal_tax', 'municipal_asset_tax')
  AND m.code IN ('401315','401323','401331','401340','401358','401366','401374')
  AND sj.is_primary = true AND sj.effective_to IS NULL
GROUP BY sj.office_category;

-- 4-3. 福岡市7判定単位の網羅チェック（期待値: 0行＝欠落なし）
SELECT m.code, m.name, ot.code AS office_category
FROM municipalities m
CROSS JOIN (SELECT unnest(ARRAY['municipal_tax','municipal_asset_tax']) AS code) ot(code)
WHERE m.code IN ('401315','401323','401331','401340','401358','401366','401374')
  AND NOT EXISTS (
    SELECT 1 FROM submission_jurisdictions sj
    WHERE sj.municipality_scope_id = m.id AND sj.office_category = ot.code
      AND sj.is_primary = true AND sj.effective_to IS NULL
  );

-- 4-4. ガードレール①: 北九州市（禁止対象）にmunicipal_tax/municipal_asset_taxが投入されていないこと
--      （期待値: 0行）
SELECT sj.office_category, m.code, m.name
FROM submission_jurisdictions sj
JOIN municipalities m ON m.id = sj.municipality_scope_id
WHERE sj.office_category IN ('municipal_tax', 'municipal_asset_tax')
  AND m.code IN ('401013','401030','401056','401064','401072','401081','401099');

-- 4-5. ガードレール②: 福岡市7判定単位以外に投入されていないこと（期待値: 0行）
SELECT sj.office_category, m.code, m.name
FROM submission_jurisdictions sj
JOIN municipalities m ON m.id = sj.municipality_scope_id
WHERE sj.office_category IN ('municipal_tax', 'municipal_asset_tax')
  AND m.code NOT IN ('401315','401323','401331','401340','401358','401366','401374');

-- 4-6. ガードレール③: organization_types が新規追加されていないこと（期待値: 14件のまま）
SELECT COUNT(*) AS organization_types_count FROM organization_types;

-- 4-7. ガードレール④: procedure_submission_rules が新規追加されていないこと（期待値: 3件のまま）
SELECT COUNT(*) AS procedure_submission_rules_count FROM procedure_submission_rules;

-- 4-8. RLS健全性
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('submission_offices', 'office_sources', 'submission_jurisdictions');
