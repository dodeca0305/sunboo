-- ============================================================
-- SUNBOO経営ナビ — National Submission Directory Phase3A
-- 「Existing Office Data Migration」福岡県72市区町村・既存5分類の移植
-- ============================================================
-- 目的: 既にPhase1.5で調査済みの5分類（tax_office / legal_affairs_bureau / pension_office /
-- labor_standards / hello_work）を、旧スキーマ（organizations/organization_offices/jurisdictions）
-- から新スキーマ（submission_offices/submission_jurisdictions/office_sources）へ移植する。
--
-- 【新規調査は行わない】住所・電話・URL・管轄はすべて既存 supabase/migration_organizations.sql の
-- 投入データをそのまま転記する。official_url_status等の確認状態もそのまま引き継ぐ（'ok'を
-- 推測で付与しない）。
--
-- 【対象外】prefectural_tax・municipal_tax（Category B、Phase3Bで新規調査）、全国データ、
-- UI/PDF/Share/通知への接続。
--
-- 【変更しないもの】organization_types / organizations / organization_offices / jurisdictions /
-- Rule Engine / Procedure Master。本ファイルはこれらから SELECT するのみで、一切書き込まない。
--
-- 前提: supabase/migration_national_submission_directory.sql（Phase2、4テーブル定義＋
-- 福岡市中央区・東区の代表ケース）が適用済みであること。
--
-- Supabase ダッシュボード → SQL Editor で実行してください。
-- 再実行しても安全（ON CONFLICT / NOT EXISTS ガードを使用。Phase2で投入済みの6窓口・
-- 2市区町村分と重複しても、同じ値で上書きされるだけで重複行は作られない）。
-- ============================================================

-- ============================================================
-- 0. 依存データの存在確認
-- ============================================================
-- 旧スキーマに福岡県（prefectures.code='40'）の対象5分類データが実在することを事前確認する。
-- 0件ならこの後のINSERTは静かに0行のまま成功するため、事前に警告する。

DO $$
DECLARE
  fukuoka_office_count INT;
BEGIN
  SELECT COUNT(*) INTO fukuoka_office_count
  FROM jurisdictions j
  JOIN organization_types ot ON ot.id = j.organization_type_id
  JOIN municipalities m ON m.id = j.municipality_id
  JOIN prefectures p ON p.id = m.prefecture_id
  WHERE p.code = '40'
    AND ot.code IN ('tax_office', 'legal_affairs_bureau', 'pension_office', 'labor_standards', 'hello_work');

  IF fukuoka_office_count = 0 THEN
    RAISE WARNING 'Phase3A: 旧スキーマ（jurisdictions）に福岡県（prefectures.code=40）×対象5分類のデータが見つかりません。migration_organizations.sqlが適用済みか確認してください。以降のINSERTは0件のまま成功します。';
  ELSIF fukuoka_office_count <> 72 * 5 THEN
    RAISE WARNING 'Phase3A: 旧スキーマの福岡県×対象5分類のjurisdictions件数が%件で、想定の360件（72市区町村×5分類）と一致しません。データが部分的にしか投入されていない可能性があります。', fukuoka_office_count;
  ELSE
    RAISE NOTICE 'Phase3A: 旧スキーマの福岡県×対象5分類のjurisdictionsは%件（想定通り360件）。', fukuoka_office_count;
  END IF;
END $$;

-- ============================================================
-- 1. 窓口本体の移植（submission_offices）＋ 情報源（office_sources）
-- ============================================================
-- 福岡県（prefectures.code='40'）の管轄を1件以上持つ、対象5分類のorganization_officesのみを対象にする
-- （東京都渋谷区分は対象外。全国展開はPhase3以降の別スコープ）。

WITH source_data AS (
  SELECT DISTINCT
    ot.code AS office_category,
    o.name AS organization_name,
    oo.id AS old_office_id,
    oo.name,
    oo.postal_code,
    oo.address,
    oo.phone,
    oo.fax,
    oo.email,
    oo.website_url,
    oo.official_url,
    oo.e_filing_url,
    oo.download_page_url,
    oo.map_url,
    oo.business_hours,
    oo.notes,
    oo.official_url_status,
    oo.official_url_checked_at,
    oo.fallback_url
  FROM organization_offices oo
  JOIN organizations o ON o.id = oo.organization_id
  JOIN organization_types ot ON ot.id = o.organization_type_id
  WHERE ot.code IN ('tax_office', 'legal_affairs_bureau', 'pension_office', 'labor_standards', 'hello_work')
    AND EXISTS (
      SELECT 1
      FROM jurisdictions j
      JOIN municipalities m ON m.id = j.municipality_id
      JOIN prefectures p ON p.id = m.prefecture_id
      WHERE j.organization_office_id = oo.id AND p.code = '40'
    )
),
ported_offices AS (
  INSERT INTO submission_offices (
    office_category, organization_name, name, postal_code, address, phone, fax, email,
    website_url, official_url, e_filing_url, download_page_url, map_url, business_hours, notes,
    official_url_status, official_url_checked_at, fallback_url, update_frequency
  )
  SELECT
    office_category, organization_name, name, postal_code, address, phone, fax, email,
    website_url, official_url, e_filing_url, download_page_url, map_url, business_hours, notes,
    COALESCE(official_url_status, 'unchecked'), official_url_checked_at, fallback_url, 'annual'
  FROM source_data
  ON CONFLICT (office_category, name) DO UPDATE SET
    organization_name = EXCLUDED.organization_name,
    postal_code = EXCLUDED.postal_code,
    address = EXCLUDED.address,
    phone = EXCLUDED.phone,
    fax = EXCLUDED.fax,
    email = EXCLUDED.email,
    website_url = EXCLUDED.website_url,
    official_url = EXCLUDED.official_url,
    e_filing_url = EXCLUDED.e_filing_url,
    download_page_url = EXCLUDED.download_page_url,
    map_url = EXCLUDED.map_url,
    business_hours = EXCLUDED.business_hours,
    notes = EXCLUDED.notes,
    official_url_status = EXCLUDED.official_url_status,
    official_url_checked_at = EXCLUDED.official_url_checked_at,
    fallback_url = EXCLUDED.fallback_url,
    updated_at = NOW()
  RETURNING id, office_category, name
)
INSERT INTO office_sources (
  office_id, source_type, publisher_name, source_url, retrieved_at, verification_method, status, is_current, notes
)
SELECT
  po.id,
  CASE po.office_category
    WHEN 'tax_office' THEN 'nta'
    WHEN 'legal_affairs_bureau' THEN 'moj'
    WHEN 'pension_office' THEN 'nenkin'
    WHEN 'labor_standards' THEN 'mhlw'
    WHEN 'hello_work' THEN 'mhlw'
  END,
  CASE po.office_category
    WHEN 'tax_office' THEN '国税庁'
    WHEN 'legal_affairs_bureau' THEN '法務省'
    WHEN 'pension_office' THEN '日本年金機構'
    WHEN 'labor_standards' THEN '福岡労働局（厚生労働省）'
    WHEN 'hello_work' THEN '福岡労働局（厚生労働省）'
  END,
  sd.official_url,
  '2026-07-03',
  'official_page_check',
  'active',
  true,
  'Phase1.5（migration_organizations.sql）投入データをPhase3Aで移植。National Submission Directory側での再確認は未実施'
FROM ported_offices po
JOIN source_data sd ON sd.office_category = po.office_category AND sd.name = po.name
ON CONFLICT (office_id) WHERE is_current = true DO UPDATE SET
  source_url = EXCLUDED.source_url,
  retrieved_at = EXCLUDED.retrieved_at,
  notes = EXCLUDED.notes;

-- ============================================================
-- 2. 管轄の移植（submission_jurisdictions、1市区町村=1窓口の基本形）
-- ============================================================
-- 旧スキーマの jurisdictions（UNIQUE(municipality_id, organization_type_id)により、
-- 1市区町村1窓口が確定済み）を、そのまま is_primary=true の行としてコピーする。

INSERT INTO submission_jurisdictions (office_id, office_category, scope_type, municipality_scope_id, is_primary, priority, notes)
SELECT
  so.id,
  ot.code,
  'municipality',
  m.id,
  true,
  0,
  NULL
FROM jurisdictions j
JOIN organization_types ot ON ot.id = j.organization_type_id
JOIN organization_offices oo ON oo.id = j.organization_office_id
JOIN municipalities m ON m.id = j.municipality_id
JOIN prefectures p ON p.id = m.prefecture_id
JOIN submission_offices so ON so.office_category = ot.code AND so.name = oo.name
WHERE ot.code IN ('tax_office', 'legal_affairs_bureau', 'pension_office', 'labor_standards', 'hello_work')
  AND p.code = '40'
ON CONFLICT (municipality_scope_id, office_category) WHERE scope_type = 'municipality' AND is_primary = true AND effective_to IS NULL
DO UPDATE SET office_id = EXCLUDED.office_id, updated_at = NOW();

-- ============================================================
-- 3. 分割管轄の構造化（pension_office、既存notesに基づく。新規調査ではない）
-- ============================================================
-- migration_organizations.sql の実データ・実注記（東福岡年金事務所/博多年金事務所の共同管轄）を
-- 構造化する。旧スキーマは1市区町村=1行しか持てないため、この共同管轄は自由記述の notes に
-- しか残っていなかった（博多区(401323)以外の10町村＋東区の計11市区町村が対象）。
-- 「複数候補を勝手に一意化しない」という要件に従い、東福岡年金事務所を主候補（is_primary=true、
-- 2節で既に投入済み）、博多年金事務所を代替候補（is_primary=false）として明示的に追加する。

INSERT INTO submission_jurisdictions (office_id, office_category, scope_type, municipality_scope_id, is_primary, priority, notes)
SELECT
  so.id,
  'pension_office',
  'municipality',
  m.id,
  false,
  1,
  '健康保険・厚生年金保険について東福岡年金事務所と共同管轄の地域（migration_organizations.sql既存notesより、博多区以外の10町村＋東区）'
FROM submission_offices so, municipalities m
WHERE so.office_category = 'pension_office' AND so.name = '博多年金事務所'
  AND m.code IN ('401315', '402206', '402231', '402249', '403415', '403423', '403431', '403440', '403458', '403482', '403491')
  AND NOT EXISTS (
    SELECT 1 FROM submission_jurisdictions sj
    WHERE sj.office_id = so.id AND sj.municipality_scope_id = m.id AND sj.is_primary = false
  );

-- ============================================================
-- 4. 検証SQL
-- ============================================================

-- 4-1. 分類別窓口数（期待値: legal_affairs_bureau=2, tax_office=18, pension_office=11,
--      labor_standards=12, hello_work=17）
SELECT office_category, COUNT(*) AS office_count
FROM submission_offices
WHERE office_category IN ('tax_office', 'legal_affairs_bureau', 'pension_office', 'labor_standards', 'hello_work')
GROUP BY office_category
ORDER BY office_category;

-- 4-2. 重複確認（(office_category, name) はUNIQUE制約があるため理論上0件のはずだが、
--      念のため件数とDISTINCT件数を突合）
SELECT office_category, COUNT(*) AS total_rows, COUNT(DISTINCT name) AS distinct_names
FROM submission_offices
WHERE office_category IN ('tax_office', 'legal_affairs_bureau', 'pension_office', 'labor_standards', 'hello_work')
GROUP BY office_category
HAVING COUNT(*) <> COUNT(DISTINCT name);
-- ↑ 0行が正常（1行でも出たら重複あり）

-- 4-3. 未紐付け窓口（submission_jurisdictionsから一度も参照されていないsubmission_offices）
SELECT so.id, so.office_category, so.name
FROM submission_offices so
WHERE so.office_category IN ('tax_office', 'legal_affairs_bureau', 'pension_office', 'labor_standards', 'hello_work')
  AND NOT EXISTS (SELECT 1 FROM submission_jurisdictions sj WHERE sj.office_id = so.id);
-- ↑ 0行が正常

-- 4-4. 72市区町村×5分類、is_primary=true 行が過不足なく存在するかの網羅チェック
--      （期待値: 0行＝欠落なし）
SELECT m.code AS municipality_code, m.name AS municipality_name, ot.code AS office_category
FROM municipalities m
JOIN prefectures p ON p.id = m.prefecture_id
CROSS JOIN (
  SELECT unnest(ARRAY['tax_office','legal_affairs_bureau','pension_office','labor_standards','hello_work']) AS code
) ot(code)
WHERE p.code = '40'
  AND NOT EXISTS (
    SELECT 1 FROM submission_jurisdictions sj
    WHERE sj.municipality_scope_id = m.id AND sj.office_category = ot.code
      AND sj.is_primary = true AND sj.effective_to IS NULL
  )
ORDER BY m.code, ot.code;
-- ↑ 0行が正常（1行でも出たら、その市区町村×分類が未紐付け）

-- 4-5. 分割管轄（is_primary=false）の件数確認（期待値: tax_office=1行(東区)、pension_office=11行）
SELECT office_category, COUNT(*) AS alternative_count
FROM submission_jurisdictions
WHERE is_primary = false
GROUP BY office_category
ORDER BY office_category;

-- 4-6. RLS/権限の健全性（Phase2.6と同じ確認。anonロールで実行した場合のみ意味を持つ）
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('submission_offices','office_sources','submission_jurisdictions','procedure_submission_rules');

-- 4-7. 旧スキーマとの内容一致確認（名称・住所・電話・URL）。期待値: 0行（1行でも出たら値の不一致）
SELECT so.office_category, so.name,
  so.address AS new_address, oo.address AS old_address,
  so.phone AS new_phone, oo.phone AS old_phone,
  so.official_url AS new_official_url, oo.official_url AS old_official_url
FROM submission_offices so
JOIN organization_offices oo ON oo.name = so.name
JOIN organizations o ON o.id = oo.organization_id
JOIN organization_types ot ON ot.id = o.organization_type_id AND ot.code = so.office_category
WHERE so.office_category IN ('tax_office', 'legal_affairs_bureau', 'pension_office', 'labor_standards', 'hello_work')
  AND (
    COALESCE(so.address, '') <> COALESCE(oo.address, '')
    OR COALESCE(so.phone, '') <> COALESCE(oo.phone, '')
    OR COALESCE(so.official_url, '') <> COALESCE(oo.official_url, '')
  );
