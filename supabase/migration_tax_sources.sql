-- ============================================================
-- SUNBOO経営ナビ — Tax Intelligence TI-0.2
-- TaxSource / TaxSourceVersion
-- ============================================================
-- 設計:
--   docs/TAX_INTELLIGENCE_ARCHITECTURE.md
--   docs/TAX_SOURCE_SCHEMA_DESIGN.md
--
-- 対象:
--   tax_sources
--   tax_source_versions
--
-- 方針:
--   ・会社単位ではなくSUNBOO全体で共有する内部税務知識マスタ
--   ・anonには公開しない
--   ・authenticatedのうちadmin_users登録者だけがSELECT/INSERT/UPDATE可能
--   ・通常アプリケーションからDELETEしない
--   ・TaxSourceVersionは原則append-only
--   ・現在Versionをis_currentで保存せず、effective timeから導出する
--
-- Supabase Dashboard → SQL Editor で実行する。
-- 再実行しても安全な形を維持する。
-- ============================================================

-- ============================================================
-- 1. Schema
-- ============================================================

CREATE TABLE IF NOT EXISTS tax_sources (
  id                 SERIAL      PRIMARY KEY,
  provider           TEXT        NOT NULL,
  source_type        TEXT        NOT NULL,
  tax_type           TEXT,
  title              TEXT        NOT NULL,
  canonical_locator  TEXT        NOT NULL,
  jurisdiction       TEXT        NOT NULL DEFAULT 'JP',
  is_active          BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_tax_sources_source_type
    CHECK (
      source_type IN (
        'law',
        'cabinet_order',
        'ministerial_ordinance',
        'nta_notice',
        'interpretive_circular',
        'administrative_guideline',
        'written_response',
        'q_and_a',
        'tribunal_decision',
        'other_official'
      )
    ),

  CONSTRAINT uq_tax_sources_provider_locator
    UNIQUE (provider, canonical_locator)
);

CREATE TABLE IF NOT EXISTS tax_source_versions (
  id                     SERIAL      PRIMARY KEY,
  tax_source_id          INT         NOT NULL REFERENCES tax_sources(id),
  version_label          TEXT,
  content_hash           TEXT        NOT NULL,

  published_at           DATE,
  effective_from         DATE,
  effective_to           DATE,

  observed_at            TIMESTAMPTZ NOT NULL,
  retrieved_at           TIMESTAMPTZ NOT NULL,

  supersedes_version_id  INT         REFERENCES tax_source_versions(id),

  raw_reference          TEXT,
  normalized_text        TEXT        NOT NULL,

  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_tax_source_versions_effective_range
    CHECK (
      effective_to IS NULL
      OR effective_from IS NULL
      OR effective_to >= effective_from
    ),

  CONSTRAINT uq_tax_source_versions_source_hash
    UNIQUE (tax_source_id, content_hash)
);

-- ============================================================
-- 2. Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_tax_sources_source_type
  ON tax_sources(source_type);

CREATE INDEX IF NOT EXISTS idx_tax_sources_tax_type
  ON tax_sources(tax_type);

CREATE INDEX IF NOT EXISTS idx_tax_sources_active
  ON tax_sources(is_active);

CREATE INDEX IF NOT EXISTS idx_tax_source_versions_source
  ON tax_source_versions(tax_source_id);

CREATE INDEX IF NOT EXISTS idx_tax_source_versions_source_retrieved
  ON tax_source_versions(tax_source_id, retrieved_at DESC);

CREATE INDEX IF NOT EXISTS idx_tax_source_versions_effective_from
  ON tax_source_versions(effective_from);

CREATE INDEX IF NOT EXISTS idx_tax_source_versions_content_hash
  ON tax_source_versions(content_hash);

-- ============================================================
-- 3. updated_at trigger
-- ============================================================
-- schema.sql が定義する update_updated_at() を再利用する。
-- 関数が存在しない環境ではmigration自体を失敗させず、
-- trigger設定だけをスキップする既存Workspace migrationのパターンに合わせる。

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'update_updated_at'
  ) THEN
    DROP TRIGGER IF EXISTS trg_tax_sources_updated_at ON tax_sources;

    CREATE TRIGGER trg_tax_sources_updated_at
      BEFORE UPDATE ON tax_sources
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();

    RAISE NOTICE 'tax_sources の updated_at 自動更新トリガーを設定しました。';
  ELSE
    RAISE NOTICE 'update_updated_at() 関数が存在しないため、tax_sources の trigger 設定をスキップしました。';
  END IF;
END $$;

-- ============================================================
-- 4. RLS / GRANT
-- ============================================================

ALTER TABLE tax_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_source_versions ENABLE ROW LEVEL SECURITY;

-- 内部知識マスタのためanonへ公開しない。
REVOKE ALL ON tax_sources FROM anon;
REVOKE ALL ON tax_source_versions FROM anon;

-- PUBLICへの意図しない権限も明示的に除去する。
REVOKE ALL ON tax_sources FROM PUBLIC;
REVOKE ALL ON tax_source_versions FROM PUBLIC;

-- 過去に同名policyが存在した場合も安全側へ戻す。
DROP POLICY IF EXISTS "public_read" ON tax_sources;
DROP POLICY IF EXISTS "public_read" ON tax_source_versions;

DROP POLICY IF EXISTS "admin_select" ON tax_sources;
DROP POLICY IF EXISTS "admin_insert" ON tax_sources;
DROP POLICY IF EXISTS "admin_update" ON tax_sources;
DROP POLICY IF EXISTS "admin_delete" ON tax_sources;

DROP POLICY IF EXISTS "admin_select" ON tax_source_versions;
DROP POLICY IF EXISTS "admin_insert" ON tax_source_versions;
DROP POLICY IF EXISTS "admin_update" ON tax_source_versions;
DROP POLICY IF EXISTS "admin_delete" ON tax_source_versions;

-- DELETEは通常アプリケーションから許可しない。
REVOKE DELETE ON tax_sources FROM authenticated;
REVOKE DELETE ON tax_source_versions FROM authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'admin_users'
  ) THEN
    GRANT SELECT, INSERT, UPDATE ON tax_sources TO authenticated;
    GRANT SELECT, INSERT, UPDATE ON tax_source_versions TO authenticated;

    -- SERIAL sequence。全schemaではなく今回の2 sequenceだけを許可する。
    GRANT USAGE, SELECT ON SEQUENCE tax_sources_id_seq TO authenticated;
    GRANT USAGE, SELECT ON SEQUENCE tax_source_versions_id_seq TO authenticated;

    CREATE POLICY "admin_select" ON tax_sources
      FOR SELECT
      USING (auth.email() IN (SELECT email FROM admin_users));

    CREATE POLICY "admin_insert" ON tax_sources
      FOR INSERT
      WITH CHECK (auth.email() IN (SELECT email FROM admin_users));

    CREATE POLICY "admin_update" ON tax_sources
      FOR UPDATE
      USING (auth.email() IN (SELECT email FROM admin_users))
      WITH CHECK (auth.email() IN (SELECT email FROM admin_users));

    CREATE POLICY "admin_select" ON tax_source_versions
      FOR SELECT
      USING (auth.email() IN (SELECT email FROM admin_users));

    CREATE POLICY "admin_insert" ON tax_source_versions
      FOR INSERT
      WITH CHECK (auth.email() IN (SELECT email FROM admin_users));

    CREATE POLICY "admin_update" ON tax_source_versions
      FOR UPDATE
      USING (auth.email() IN (SELECT email FROM admin_users))
      WITH CHECK (auth.email() IN (SELECT email FROM admin_users));

    RAISE NOTICE 'Tax Intelligence Source tables のadmin RLS policyを設定しました。';
  ELSE
    RAISE NOTICE 'admin_users テーブルが存在しないため、authenticated権限・admin policy設定をスキップしました。';
  END IF;
END $$;

-- ============================================================
-- 5. Validation queries
-- ============================================================

-- 5-1. table / RLS
SELECT
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('tax_sources', 'tax_source_versions')
ORDER BY tablename;

-- 5-2. policies
SELECT
  tablename,
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('tax_sources', 'tax_source_versions')
ORDER BY tablename, cmd, policyname;

-- 5-3. privileges
SELECT
  table_name,
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('tax_sources', 'tax_source_versions')
  AND grantee IN ('anon', 'authenticated')
ORDER BY table_name, grantee, privilege_type;

-- 5-4. constraints
SELECT
  conrelid::regclass::text AS table_name,
  conname,
  contype
FROM pg_constraint
WHERE conrelid IN (
  'public.tax_sources'::regclass,
  'public.tax_source_versions'::regclass
)
ORDER BY table_name, conname;

-- 5-5. indexes
SELECT
  tablename,
  indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('tax_sources', 'tax_source_versions')
ORDER BY tablename, indexname;
