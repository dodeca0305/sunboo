-- ============================================================
-- SUNBOO経営ナビ — National Submission Directory Phase2（福岡県パイロット）
-- ============================================================
-- 設計: docs/NATIONAL_SUBMISSION_DIRECTORY.md（D1〜D11 決定事項を反映、docs/ADR_NATIONAL_SUBMISSION_DIRECTORY.md参照）
-- 対象: submission_offices / office_sources / submission_jurisdictions / procedure_submission_rules の新規4テーブル
--
-- 既存の organization_types / organizations / organization_offices / jurisdictions /
-- Rule Engine（rules/rule_conditions/rule_actions）/ Procedure Master（procedures等）は
-- 一切変更しない。旧 organizations 系テーブルは凍結し、本4テーブルをPhase2以降の正本として扱う（D5）。
--
-- Supabase ダッシュボード → SQL Editor で実行してください。
-- 再実行しても安全（IF NOT EXISTS / ON CONFLICT / 部分UNIQUEインデックスのconflict targetを使用）。
--
-- 今回投入するのは福岡県の代表ケース検証に必要な最小限のデータのみ（全国データ投入は対象外）。
-- 住所・電話・URLは既存 supabase/migration_organizations.sql（Phase1.5、2026-07-03投入・
-- 公式ページ確認済み）からそのまま転記し、新たな調査・推測データの投入は行っていない。
-- ============================================================

-- ============================================================
-- 1. スキーマ定義
-- ============================================================

CREATE TABLE IF NOT EXISTS submission_offices (
  id                       SERIAL      PRIMARY KEY,
  office_category          TEXT        NOT NULL REFERENCES organization_types(code),
  organization_name        TEXT,
  name                     TEXT        NOT NULL,
  postal_code              TEXT,
  address                  TEXT,
  phone                    TEXT,
  fax                      TEXT,
  email                    TEXT,
  website_url              TEXT,
  official_url             TEXT,
  e_filing_url             TEXT,
  download_page_url        TEXT,
  map_url                  TEXT,
  business_hours           TEXT,
  notes                    TEXT,
  official_url_status      TEXT        NOT NULL DEFAULT 'unchecked'
                             CHECK (official_url_status IN ('ok','broken','redirected','unchecked')),
  official_url_checked_at  TIMESTAMPTZ,
  fallback_url             TEXT,
  data_version             INT         NOT NULL DEFAULT 1,
  last_verified_at         DATE,
  verification_due_at      DATE,
  update_frequency         TEXT        NOT NULL DEFAULT 'annual'
                             CHECK (update_frequency IN ('monthly','quarterly','annual','on_change','unknown')),
  is_active                BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (office_category, name)
);

CREATE INDEX IF NOT EXISTS idx_submission_offices_category ON submission_offices(office_category);
CREATE INDEX IF NOT EXISTS idx_submission_offices_active   ON submission_offices(is_active);

-- office_sources: 情報源・検証履歴（D6: statusで撤回を区別、物理削除しない）
CREATE TABLE IF NOT EXISTS office_sources (
  id                   SERIAL      PRIMARY KEY,
  office_id            INT         NOT NULL REFERENCES submission_offices(id) ON DELETE CASCADE,
  source_type          TEXT        NOT NULL
                         CHECK (source_type IN ('nta','moj','nenkin','mhlw','pref_government','municipal_government','other')),
  publisher_name       TEXT        NOT NULL,
  source_url           TEXT,
  retrieved_at         DATE        NOT NULL,
  verification_method  TEXT        NOT NULL
                         CHECK (verification_method IN ('official_page_check','phone_confirmation','pdf_document','csv_import','other')),
  verified_by          TEXT,
  status               TEXT        NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active','superseded','retracted')),
  is_current           BOOLEAN     NOT NULL DEFAULT TRUE,
  snapshot             JSONB,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_office_sources_office ON office_sources(office_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_office_sources_current
  ON office_sources (office_id) WHERE is_current = true;

-- submission_jurisdictions: 管轄解決（D9: scope_codeのポリモーフィズムを解消し2列+CHECKにする）
CREATE TABLE IF NOT EXISTS submission_jurisdictions (
  id                     SERIAL      PRIMARY KEY,
  office_id              INT         NOT NULL REFERENCES submission_offices(id) ON DELETE CASCADE,
  office_category        TEXT        NOT NULL REFERENCES organization_types(code),
  scope_type             TEXT        NOT NULL CHECK (scope_type IN ('municipality','prefecture','national')),
  municipality_scope_id  INT         REFERENCES municipalities(id),
  prefecture_scope_id    INT         REFERENCES prefectures(id),
  is_primary             BOOLEAN     NOT NULL DEFAULT TRUE,
  priority               INT         NOT NULL DEFAULT 0,
  effective_from         DATE        NOT NULL DEFAULT CURRENT_DATE,
  effective_to           DATE,
  notes                  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (scope_type = 'municipality' AND municipality_scope_id IS NOT NULL AND prefecture_scope_id IS NULL)
    OR (scope_type = 'prefecture' AND prefecture_scope_id IS NOT NULL AND municipality_scope_id IS NULL)
    OR (scope_type = 'national' AND municipality_scope_id IS NULL AND prefecture_scope_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_submission_jurisdictions_office ON submission_jurisdictions(office_id);
CREATE INDEX IF NOT EXISTS idx_submission_jurisdictions_muni
  ON submission_jurisdictions(municipality_scope_id, office_category);
CREATE INDEX IF NOT EXISTS idx_submission_jurisdictions_pref
  ON submission_jurisdictions(prefecture_scope_id, office_category);

-- 「現在有効な既定の解決先」は各スコープ階層内で常に1件に確定させる（is_primary=true & effective_to IS NULL）
CREATE UNIQUE INDEX IF NOT EXISTS ux_submission_jurisdictions_muni_primary
  ON submission_jurisdictions(municipality_scope_id, office_category)
  WHERE scope_type = 'municipality' AND is_primary = true AND effective_to IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_submission_jurisdictions_pref_primary
  ON submission_jurisdictions(prefecture_scope_id, office_category)
  WHERE scope_type = 'prefecture' AND is_primary = true AND effective_to IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_submission_jurisdictions_national_primary
  ON submission_jurisdictions(office_category)
  WHERE scope_type = 'national' AND is_primary = true AND effective_to IS NULL;

-- procedure_submission_rules: 手続き別の提出先判定ルール（D10: JSONB配列のまま。子テーブル化しない）
CREATE TABLE IF NOT EXISTS procedure_submission_rules (
  id               SERIAL      PRIMARY KEY,
  procedure_id     INT         NOT NULL REFERENCES procedures(id) ON DELETE CASCADE,
  office_category  TEXT        NOT NULL REFERENCES organization_types(code),
  conditions       JSONB       NOT NULL DEFAULT '[]'::jsonb,
  recipient_scope  TEXT        NOT NULL DEFAULT 'company'
                     CHECK (recipient_scope IN ('company','each_employee','other')),
  priority         INT         NOT NULL DEFAULT 0,
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (procedure_id, office_category, priority)
);

CREATE INDEX IF NOT EXISTS idx_procedure_submission_rules_procedure
  ON procedure_submission_rules(procedure_id);

-- ============================================================
-- 2. GRANT / RLS（既存 migration_organizations_permissions.sql と同じパターン）
-- ============================================================

GRANT SELECT ON submission_offices          TO anon;
GRANT SELECT ON office_sources              TO anon;
GRANT SELECT ON submission_jurisdictions    TO anon;
GRANT SELECT ON procedure_submission_rules  TO anon;

ALTER TABLE submission_offices          ENABLE ROW LEVEL SECURITY;
ALTER TABLE office_sources              ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_jurisdictions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE procedure_submission_rules  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read" ON submission_offices;
DROP POLICY IF EXISTS "public_read" ON office_sources;
DROP POLICY IF EXISTS "public_read" ON submission_jurisdictions;
DROP POLICY IF EXISTS "public_read" ON procedure_submission_rules;

CREATE POLICY "public_read" ON submission_offices          FOR SELECT USING (true);
CREATE POLICY "public_read" ON office_sources              FOR SELECT USING (true);
CREATE POLICY "public_read" ON submission_jurisdictions    FOR SELECT USING (true);
CREATE POLICY "public_read" ON procedure_submission_rules  FOR SELECT USING (true);

-- 管理画面からの書き込み権限（authenticated ロール、admin_users 登録者のみ）
-- admin_schema.sql が未実行（admin_users テーブルが無い）場合はこのセクションをスキップする。
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_users') THEN

    GRANT INSERT, UPDATE, DELETE ON submission_offices          TO authenticated;
    GRANT INSERT, UPDATE, DELETE ON office_sources              TO authenticated;
    GRANT INSERT, UPDATE, DELETE ON submission_jurisdictions    TO authenticated;
    GRANT INSERT, UPDATE, DELETE ON procedure_submission_rules  TO authenticated;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

    DECLARE
      t TEXT;
    BEGIN
      FOREACH t IN ARRAY ARRAY[
        'submission_offices', 'office_sources',
        'submission_jurisdictions', 'procedure_submission_rules'
      ]
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS "admin_insert" ON %I', t);
        EXECUTE format(
          'CREATE POLICY "admin_insert" ON %I FOR INSERT
             WITH CHECK (auth.email() IN (SELECT email FROM admin_users))', t
        );

        EXECUTE format('DROP POLICY IF EXISTS "admin_update" ON %I', t);
        EXECUTE format(
          'CREATE POLICY "admin_update" ON %I FOR UPDATE
             USING (auth.email() IN (SELECT email FROM admin_users))
             WITH CHECK (auth.email() IN (SELECT email FROM admin_users))', t
        );

        EXECUTE format('DROP POLICY IF EXISTS "admin_delete" ON %I', t);
        EXECUTE format(
          'CREATE POLICY "admin_delete" ON %I FOR DELETE
             USING (auth.email() IN (SELECT email FROM admin_users))', t
        );
      END LOOP;
    END;

    RAISE NOTICE '管理者書き込みポリシーを設定しました。';
  ELSE
    RAISE NOTICE 'admin_users テーブルが存在しないため、管理者書き込みポリシーの設定をスキップしました（admin_schema.sql を先に実行してください）。';
  END IF;
END $$;

-- ============================================================
-- 3. 依存データの存在確認（Migration Validationで追加）
-- ============================================================
-- 本Migrationは既存 organization_types / municipalities / procedures の値を前提にしている。
-- FK制約は「参照先のテーブル・列が存在すること」は保証するが「特定のコード値の行が存在すること」は
-- CREATE TABLE時点では検証できない（INSERT時に初めてチェックされる）。前提が満たされない場合、
-- 該当する4節のINSERTが「エラーなく0件のまま」になる（WHERE句が単に何も一致しないだけのため）
-- 可能性があるため、事前に警告を出す。CREATE TABLE自体の成否には影響しない（WARNINGのみ、処理は継続する）。

DO $$
DECLARE
  missing_muni INT;
  missing_org_type INT;
  missing_procedure INT;
BEGIN
  SELECT COUNT(*) INTO missing_muni FROM (VALUES ('401331'), ('401315')) AS v(code)
  WHERE NOT EXISTS (SELECT 1 FROM municipalities m WHERE m.code = v.code);
  IF missing_muni > 0 THEN
    RAISE WARNING 'National Submission Directory: municipalities.code に 401331（福岡市中央区）/401315（福岡市東区）の一部が見つかりません。該当する submission_jurisdictions 行は投入されずに0件のまま成功します。';
  END IF;

  SELECT COUNT(*) INTO missing_org_type
  FROM (VALUES ('tax_office'), ('legal_affairs_bureau'), ('pension_office'), ('labor_standards')) AS v(code)
  WHERE NOT EXISTS (SELECT 1 FROM organization_types ot WHERE ot.code = v.code);
  IF missing_org_type > 0 THEN
    RAISE WARNING 'National Submission Directory: organization_types.code に想定した機関種別（tax_office/legal_affairs_bureau/pension_office/labor_standards）の一部が見つかりません。4節のINSERTがFK制約違反でエラーになる可能性があります。';
  END IF;

  SELECT COUNT(*) INTO missing_procedure
  FROM (VALUES ('SALARY_PAYMENT_REPORT'), ('RESIDENT_TAX_WITHHOLDING')) AS v(code)
  WHERE NOT EXISTS (SELECT 1 FROM procedures p WHERE p.code = v.code);
  IF missing_procedure > 0 THEN
    RAISE WARNING 'National Submission Directory: procedures.code に SALARY_PAYMENT_REPORT/RESIDENT_TAX_WITHHOLDING の一部が見つかりません。該当する procedure_submission_rules 行は投入されずに0件のまま成功します。';
  END IF;
END $$;

-- ============================================================
-- 4. 福岡県パイロットデータ（最小限）
-- ============================================================
-- 代表4ケース（福岡市中央区 401331）＋ 分割管轄の実例（福岡市東区 401315、香椎/博多税務署）のみ投入する。
-- 全国データ・福岡県全72市区町村分は対象外（Phase3で扱う）。
--
-- 住所・電話・official_urlは既存 supabase/migration_organizations.sql の該当行から転記（新規調査なし）。
-- official_url_status は Phase1.5投入時点の実際の値（'unchecked'、_sunboo_upsert_office ヘルパーが
-- 全件に設定した値）をそのまま引き継ぐ。今回の作業で新たにURLを再確認して 'ok' に格上げすることはしない
-- （推測で補完しない。実際に再確認していない状態を 'ok' と偽らない）。
--
-- office_sources.retrieved_at は、この住所・電話データが実際にSUNBOOへ投入された日
-- （supabase/migration_organizations.sql のコミット日: 2026-07-03、`git log`で確認可能）を用いる。
-- source_url は migration_organizations.sql 内のコメント・INSERT文に実在する公式ページURLをそのまま使う。

-- ── 3-1. 福岡税務署（tax_office） ─────────────────────────────
WITH office AS (
  INSERT INTO submission_offices (
    office_category, organization_name, name, postal_code, address, phone,
    website_url, official_url, official_url_status, map_url, fallback_url,
    update_frequency, last_verified_at
  )
  VALUES (
    'tax_office', '福岡税務署', '福岡税務署', '810-8689', '福岡市中央区天神4丁目8番28号', '092-771-1151',
    'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka/fukuoka/index.htm',
    'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka/fukuoka/index.htm', 'unchecked',
    'https://maps.google.com/?q=福岡税務署',
    'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka.htm',
    'annual', '2026-07-03'
  )
  ON CONFLICT (office_category, name) DO UPDATE SET
    address = EXCLUDED.address, phone = EXCLUDED.phone, official_url = EXCLUDED.official_url
  RETURNING id
)
INSERT INTO office_sources (office_id, source_type, publisher_name, source_url, retrieved_at, verification_method, status, is_current, notes)
SELECT office.id, 'nta', '国税庁',
  'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka.htm',
  '2026-07-03', 'official_page_check', 'active', true,
  'Phase1.5（migration_organizations.sql）投入データを転記。National Submission Directory側での再確認は未実施'
FROM office
ON CONFLICT (office_id) WHERE is_current = true DO UPDATE SET
  source_url = EXCLUDED.source_url, retrieved_at = EXCLUDED.retrieved_at, notes = EXCLUDED.notes;

INSERT INTO submission_jurisdictions (office_id, office_category, scope_type, municipality_scope_id, is_primary, priority, notes)
SELECT o.id, 'tax_office', 'municipality', m.id, true, 0, NULL
FROM submission_offices o, municipalities m
WHERE o.office_category = 'tax_office' AND o.name = '福岡税務署' AND m.code = '401331'
ON CONFLICT (municipality_scope_id, office_category) WHERE scope_type = 'municipality' AND is_primary = true AND effective_to IS NULL
DO UPDATE SET office_id = EXCLUDED.office_id;

-- ── 3-2. 福岡法務局（legal_affairs_bureau） ────────────────────
WITH office AS (
  INSERT INTO submission_offices (
    office_category, organization_name, name, postal_code, address, phone,
    website_url, official_url, official_url_status, map_url, fallback_url,
    update_frequency, last_verified_at
  )
  VALUES (
    'legal_affairs_bureau', '福岡法務局', '福岡法務局', '810-8513', '福岡市中央区舞鶴3丁目5番25号', '092-721-4570',
    'https://houmukyoku.moj.go.jp/fukuoka/table/shikyokutou/all/honkyoku.html',
    'https://houmukyoku.moj.go.jp/fukuoka/table/shikyokutou/all/honkyoku.html', 'unchecked',
    'https://maps.google.com/?q=福岡法務局',
    'https://houmukyoku.moj.go.jp/fukuoka/table/shikyokutou/all00.html',
    'annual', '2026-07-03'
  )
  ON CONFLICT (office_category, name) DO UPDATE SET
    address = EXCLUDED.address, phone = EXCLUDED.phone, official_url = EXCLUDED.official_url
  RETURNING id
)
INSERT INTO office_sources (office_id, source_type, publisher_name, source_url, retrieved_at, verification_method, status, is_current, notes)
SELECT office.id, 'moj', '法務省',
  'https://houmukyoku.moj.go.jp/fukuoka/table/shikyokutou/all/honkyoku.html',
  '2026-07-03', 'official_page_check', 'active', true,
  'Phase1.5（migration_organizations.sql）投入データを転記。National Submission Directory側での再確認は未実施'
FROM office
ON CONFLICT (office_id) WHERE is_current = true DO UPDATE SET
  source_url = EXCLUDED.source_url, retrieved_at = EXCLUDED.retrieved_at, notes = EXCLUDED.notes;

INSERT INTO submission_jurisdictions (office_id, office_category, scope_type, municipality_scope_id, is_primary, priority, notes)
SELECT o.id, 'legal_affairs_bureau', 'municipality', m.id, true, 0, NULL
FROM submission_offices o, municipalities m
WHERE o.office_category = 'legal_affairs_bureau' AND o.name = '福岡法務局' AND m.code = '401331'
ON CONFLICT (municipality_scope_id, office_category) WHERE scope_type = 'municipality' AND is_primary = true AND effective_to IS NULL
DO UPDATE SET office_id = EXCLUDED.office_id;

-- ── 3-3. 中福岡年金事務所（pension_office） ────────────────────
WITH office AS (
  INSERT INTO submission_offices (
    office_category, organization_name, name, postal_code, address, phone,
    website_url, official_url, official_url_status, map_url, fallback_url,
    update_frequency, last_verified_at
  )
  VALUES (
    'pension_office', '日本年金機構', '中福岡年金事務所', '810-8668', '福岡市中央区大手門2-8-25', '092-751-1232',
    'https://www.nenkin.go.jp/section/soudan/fukuoka/nakafukuoka.html',
    'https://www.nenkin.go.jp/section/soudan/fukuoka/nakafukuoka.html', 'unchecked',
    'https://maps.google.com/?q=中福岡年金事務所',
    'https://www.nenkin.go.jp/section/soudan/fukuoka/index.html',
    'annual', '2026-07-03'
  )
  ON CONFLICT (office_category, name) DO UPDATE SET
    address = EXCLUDED.address, phone = EXCLUDED.phone, official_url = EXCLUDED.official_url
  RETURNING id
)
INSERT INTO office_sources (office_id, source_type, publisher_name, source_url, retrieved_at, verification_method, status, is_current, notes)
SELECT office.id, 'nenkin', '日本年金機構',
  'https://www.nenkin.go.jp/section/soudan/fukuoka/nakafukuoka.html',
  '2026-07-03', 'official_page_check', 'active', true,
  'Phase1.5（migration_organizations.sql）投入データを転記。National Submission Directory側での再確認は未実施'
FROM office
ON CONFLICT (office_id) WHERE is_current = true DO UPDATE SET
  source_url = EXCLUDED.source_url, retrieved_at = EXCLUDED.retrieved_at, notes = EXCLUDED.notes;

INSERT INTO submission_jurisdictions (office_id, office_category, scope_type, municipality_scope_id, is_primary, priority, notes)
SELECT o.id, 'pension_office', 'municipality', m.id, true, 0, NULL
FROM submission_offices o, municipalities m
WHERE o.office_category = 'pension_office' AND o.name = '中福岡年金事務所' AND m.code = '401331'
ON CONFLICT (municipality_scope_id, office_category) WHERE scope_type = 'municipality' AND is_primary = true AND effective_to IS NULL
DO UPDATE SET office_id = EXCLUDED.office_id;

-- ── 3-4. 福岡中央労働基準監督署（labor_standards） ─────────────
WITH office AS (
  INSERT INTO submission_offices (
    office_category, organization_name, name, postal_code, address, phone,
    website_url, official_url, official_url_status, map_url, fallback_url,
    update_frequency, last_verified_at
  )
  VALUES (
    'labor_standards', '福岡労働局', '福岡中央労働基準監督署', '810-8605', '福岡市中央区長浜2-1-1', '092-761-5607',
    'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/_00636.html',
    'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/_00636.html', 'unchecked',
    'https://maps.google.com/?q=福岡中央労働基準監督署',
    'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/',
    'annual', '2026-07-03'
  )
  ON CONFLICT (office_category, name) DO UPDATE SET
    address = EXCLUDED.address, phone = EXCLUDED.phone, official_url = EXCLUDED.official_url
  RETURNING id
)
INSERT INTO office_sources (office_id, source_type, publisher_name, source_url, retrieved_at, verification_method, status, is_current, notes)
SELECT office.id, 'mhlw', '福岡労働局（厚生労働省）',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/_00636.html',
  '2026-07-03', 'official_page_check', 'active', true,
  'Phase1.5（migration_organizations.sql）投入データを転記。National Submission Directory側での再確認は未実施'
FROM office
ON CONFLICT (office_id) WHERE is_current = true DO UPDATE SET
  source_url = EXCLUDED.source_url, retrieved_at = EXCLUDED.retrieved_at, notes = EXCLUDED.notes;

INSERT INTO submission_jurisdictions (office_id, office_category, scope_type, municipality_scope_id, is_primary, priority, notes)
SELECT o.id, 'labor_standards', 'municipality', m.id, true, 0, NULL
FROM submission_offices o, municipalities m
WHERE o.office_category = 'labor_standards' AND o.name = '福岡中央労働基準監督署' AND m.code = '401331'
ON CONFLICT (municipality_scope_id, office_category) WHERE scope_type = 'municipality' AND is_primary = true AND effective_to IS NULL
DO UPDATE SET office_id = EXCLUDED.office_id;

-- ── 3-5. 分割管轄の実例（multiple_candidates検証用）: 福岡市東区（401315）の税務署 ──
-- 既存 migration_organizations.sql の実データ・実注記をそのまま転記する。
-- 「香椎税務署」が主管轄（is_primary=true）、「博多税務署」が同区の一部を管轄する場合がある代替候補
-- （is_primary=false）。国税庁の公式ページ上、町名・丁目単位の詳細な境界は非公開のため、
-- SUNBOOはこれを「複数候補あり」として正直に扱う（どちらか一方に推測で確定させない）。

WITH office AS (
  INSERT INTO submission_offices (
    office_category, organization_name, name, postal_code, address, phone,
    website_url, official_url, official_url_status, map_url, fallback_url,
    update_frequency, last_verified_at, notes
  )
  VALUES (
    'tax_office', '香椎税務署', '香椎税務署', '813-8681', '福岡市東区千早6丁目2番1号', '092-661-1031',
    'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka/kashii/index.htm',
    'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka/kashii/index.htm', 'unchecked',
    'https://maps.google.com/?q=香椎税務署',
    'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka.htm',
    'annual', '2026-07-03',
    '福岡市東区の一部は博多税務署が管轄する場合がある（国税庁公式ページに詳細な境界の記載なし）。正確な管轄は国税庁の管轄税務署検索で確認が必要'
  )
  ON CONFLICT (office_category, name) DO UPDATE SET
    address = EXCLUDED.address, phone = EXCLUDED.phone, official_url = EXCLUDED.official_url
  RETURNING id
)
INSERT INTO office_sources (office_id, source_type, publisher_name, source_url, retrieved_at, verification_method, status, is_current, notes)
SELECT office.id, 'nta', '国税庁',
  'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka.htm',
  '2026-07-03', 'official_page_check', 'active', true,
  'Phase1.5（migration_organizations.sql）投入データを転記。National Submission Directory側での再確認は未実施'
FROM office
ON CONFLICT (office_id) WHERE is_current = true DO UPDATE SET
  source_url = EXCLUDED.source_url, retrieved_at = EXCLUDED.retrieved_at, notes = EXCLUDED.notes;

WITH office AS (
  INSERT INTO submission_offices (
    office_category, organization_name, name, postal_code, address, phone,
    website_url, official_url, official_url_status, map_url, fallback_url,
    update_frequency, last_verified_at, notes
  )
  VALUES (
    'tax_office', '博多税務署', '博多税務署', '812-8706', '福岡市東区馬出1丁目8番1号', '092-641-8131',
    'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka/hakata/index.htm',
    'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka/hakata/index.htm', 'unchecked',
    'https://maps.google.com/?q=博多税務署',
    'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka.htm',
    'annual', '2026-07-03',
    '福岡市東区の一部を管轄する場合がある（東区の主管轄は香椎税務署として登録）。正確な管轄は国税庁の管轄税務署検索で確認が必要'
  )
  ON CONFLICT (office_category, name) DO UPDATE SET
    address = EXCLUDED.address, phone = EXCLUDED.phone, official_url = EXCLUDED.official_url
  RETURNING id
)
INSERT INTO office_sources (office_id, source_type, publisher_name, source_url, retrieved_at, verification_method, status, is_current, notes)
SELECT office.id, 'nta', '国税庁',
  'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka.htm',
  '2026-07-03', 'official_page_check', 'active', true,
  'Phase1.5（migration_organizations.sql）投入データを転記。National Submission Directory側での再確認は未実施'
FROM office
ON CONFLICT (office_id) WHERE is_current = true DO UPDATE SET
  source_url = EXCLUDED.source_url, retrieved_at = EXCLUDED.retrieved_at, notes = EXCLUDED.notes;

-- 香椎税務署 = 主候補（is_primary=true）
INSERT INTO submission_jurisdictions (office_id, office_category, scope_type, municipality_scope_id, is_primary, priority, notes)
SELECT o.id, 'tax_office', 'municipality', m.id, true, 0,
  '福岡市東区の主管轄。町名・丁目により博多税務署が管轄する場合がある'
FROM submission_offices o, municipalities m
WHERE o.office_category = 'tax_office' AND o.name = '香椎税務署' AND m.code = '401315'
ON CONFLICT (municipality_scope_id, office_category) WHERE scope_type = 'municipality' AND is_primary = true AND effective_to IS NULL
DO UPDATE SET office_id = EXCLUDED.office_id, notes = EXCLUDED.notes;

-- 博多税務署 = 代替候補（is_primary=false）。部分UNIQUEインデックスの対象外のため、
-- 重複投入防止は notes・office_id の組み合わせ確認で運用する（is_primary=falseの行はUNIQUE制約なし、想定通り）。
INSERT INTO submission_jurisdictions (office_id, office_category, scope_type, municipality_scope_id, is_primary, priority, notes)
SELECT o.id, 'tax_office', 'municipality', m.id, false, 1,
  '福岡市東区の一部を管轄する場合がある代替候補（詳細境界は国税庁公式ページに非公開）'
FROM submission_offices o, municipalities m
WHERE o.office_category = 'tax_office' AND o.name = '博多税務署' AND m.code = '401315'
  AND NOT EXISTS (
    SELECT 1 FROM submission_jurisdictions sj
    WHERE sj.office_id = o.id AND sj.municipality_scope_id = m.id AND sj.is_primary = false
  );

-- ============================================================
-- 5. procedure_submission_rules（従業員住所依存手続きのフラグ付け、D2）
-- ============================================================
-- SALARY_PAYMENT_REPORT（給与支払報告書）・RESIDENT_TAX_WITHHOLDING（特別徴収税額の納付）は、
-- 提出先が会社所在地ではなく従業員個々の住所地市区町村になるため、recipient_scope='each_employee'を
-- 無条件（conditions=[]）で適用する。office_categoryはprocedures.office_type（municipal_tax）から
-- 変更しない（提出先カテゴリ自体は変わらず、「誰の住所で判定するか」だけを上書きする）。

INSERT INTO procedure_submission_rules (procedure_id, office_category, conditions, recipient_scope, priority, notes)
SELECT p.id, p.office_type, '[]'::jsonb, 'each_employee', 0,
  '提出先は会社所在地ではなく各従業員の1月1日時点の住所地市区町村。会社所在地の窓口を代替表示しない（docs/COMPANY_ADDRESS_OFFICE_RESOLUTION_DESIGN.md 4節）'
FROM procedures p
WHERE p.code = 'SALARY_PAYMENT_REPORT'
ON CONFLICT (procedure_id, office_category, priority) DO UPDATE SET
  recipient_scope = EXCLUDED.recipient_scope, notes = EXCLUDED.notes;

INSERT INTO procedure_submission_rules (procedure_id, office_category, conditions, recipient_scope, priority, notes)
SELECT p.id, p.office_type, '[]'::jsonb, 'each_employee', 0,
  '特別徴収は各従業員の住所地市区町村への納付。会社所在地の窓口を代替表示しない（docs/COMPANY_ADDRESS_OFFICE_RESOLUTION_DESIGN.md 4節）'
FROM procedures p
WHERE p.code = 'RESIDENT_TAX_WITHHOLDING'
ON CONFLICT (procedure_id, office_category, priority) DO UPDATE SET
  recipient_scope = EXCLUDED.recipient_scope, notes = EXCLUDED.notes;

-- ============================================================
-- 6. 確認クエリ
-- ============================================================

SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('submission_offices','office_sources','submission_jurisdictions','procedure_submission_rules');

SELECT o.name AS 窓口名, o.office_category, sj.scope_type, m.name AS 市区町村, sj.is_primary, sj.priority
FROM submission_jurisdictions sj
JOIN submission_offices o ON o.id = sj.office_id
LEFT JOIN municipalities m ON m.id = sj.municipality_scope_id
ORDER BY m.code, sj.office_category, sj.priority;

SELECT p.code, p.name, psr.office_category, psr.recipient_scope, psr.conditions
FROM procedure_submission_rules psr
JOIN procedures p ON p.id = psr.procedure_id
ORDER BY p.code;
