-- ============================================================
-- SUNBOO経営ナビ — Tax Intelligence TI-0.3
-- TaxRule / TaxControl schema
-- ============================================================
-- Design:
--   docs/TAX_INTELLIGENCE_ARCHITECTURE.md
--   docs/TAX_RULE_CONTROL_SCHEMA_DESIGN.md
--
-- Scope:
--   tax_rules
--   tax_rule_source_versions
--   tax_controls
--   tax_control_rules
--
-- Principles:
--   ・既存の汎用 rules / rule_conditions / rule_actions は変更しない
--   ・TaxRule は TaxSourceVersion まで根拠追跡できる
--   ・TaxControl は任意SQLではなく evaluator_key でGit管理Evaluatorを参照する
--   ・AI提案は draft まで。approved には人間の承認情報が必要
--   ・approved後の意味内容はUPDATEで書き換えず、新Versionを作る
--   ・anon / PUBLIC へ公開しない
--   ・通常アプリケーションからDELETEしない
-- ============================================================

-- ============================================================
-- 1. Schema
-- ============================================================

CREATE TABLE IF NOT EXISTS tax_rules (
  id                  SERIAL      PRIMARY KEY,
  rule_code           TEXT        NOT NULL,
  version_no          INT         NOT NULL,
  tax_type            TEXT,
  title               TEXT        NOT NULL,
  rule_statement      TEXT        NOT NULL,
  applicability_note  TEXT,

  effective_from      DATE,
  effective_to        DATE,

  status              TEXT        NOT NULL DEFAULT 'draft',
  supersedes_rule_id  INT         REFERENCES tax_rules(id),

  proposed_by_kind    TEXT        NOT NULL DEFAULT 'human',
  approved_by         TEXT,
  approved_at         TIMESTAMPTZ,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_tax_rules_code_version
    UNIQUE (rule_code, version_no),

  CONSTRAINT chk_tax_rules_version_positive
    CHECK (version_no > 0),

  CONSTRAINT chk_tax_rules_effective_range
    CHECK (
      effective_to IS NULL
      OR effective_from IS NULL
      OR effective_to >= effective_from
    ),

  CONSTRAINT chk_tax_rules_status
    CHECK (status IN ('draft', 'approved', 'retired')),

  CONSTRAINT chk_tax_rules_proposed_by_kind
    CHECK (proposed_by_kind IN ('human', 'ai', 'system')),

  CONSTRAINT chk_tax_rules_approval_metadata
    CHECK (
      status = 'draft'
      OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
    ),

  CONSTRAINT chk_tax_rules_not_self_supersede
    CHECK (
      supersedes_rule_id IS NULL
      OR supersedes_rule_id <> id
    )
);

CREATE TABLE IF NOT EXISTS tax_rule_source_versions (
  tax_rule_id            INT         NOT NULL REFERENCES tax_rules(id),
  tax_source_version_id  INT         NOT NULL REFERENCES tax_source_versions(id),
  authority_role         TEXT        NOT NULL DEFAULT 'primary',
  citation_note          TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT pk_tax_rule_source_versions
    PRIMARY KEY (tax_rule_id, tax_source_version_id),

  CONSTRAINT chk_tax_rule_source_versions_authority_role
    CHECK (authority_role IN ('primary', 'supporting', 'exception'))
);

CREATE TABLE IF NOT EXISTS tax_controls (
  id                     SERIAL      PRIMARY KEY,
  control_code           TEXT        NOT NULL,
  version_no             INT         NOT NULL,
  control_kind           TEXT        NOT NULL,
  title                  TEXT        NOT NULL,
  description            TEXT,

  evaluator_key          TEXT        NOT NULL,
  parameters             JSONB       NOT NULL DEFAULT '{}'::jsonb,
  required_inputs        JSONB       NOT NULL DEFAULT '[]'::jsonb,

  default_severity       TEXT        NOT NULL DEFAULT 'warning',

  effective_from         DATE,
  effective_to           DATE,

  status                 TEXT        NOT NULL DEFAULT 'draft',
  is_enabled             BOOLEAN     NOT NULL DEFAULT TRUE,
  supersedes_control_id  INT         REFERENCES tax_controls(id),

  proposed_by_kind       TEXT        NOT NULL DEFAULT 'human',
  approved_by            TEXT,
  approved_at            TIMESTAMPTZ,

  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_tax_controls_code_version
    UNIQUE (control_code, version_no),

  CONSTRAINT chk_tax_controls_version_positive
    CHECK (version_no > 0),

  CONSTRAINT chk_tax_controls_kind
    CHECK (control_kind IN ('data_quality', 'state_consistency', 'tax_rule')),

  CONSTRAINT chk_tax_controls_severity
    CHECK (default_severity IN ('info', 'warning', 'error', 'critical')),

  CONSTRAINT chk_tax_controls_effective_range
    CHECK (
      effective_to IS NULL
      OR effective_from IS NULL
      OR effective_to >= effective_from
    ),

  CONSTRAINT chk_tax_controls_status
    CHECK (status IN ('draft', 'approved', 'retired')),

  CONSTRAINT chk_tax_controls_proposed_by_kind
    CHECK (proposed_by_kind IN ('human', 'ai', 'system')),

  CONSTRAINT chk_tax_controls_approval_metadata
    CHECK (
      status = 'draft'
      OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
    ),

  CONSTRAINT chk_tax_controls_not_self_supersede
    CHECK (
      supersedes_control_id IS NULL
      OR supersedes_control_id <> id
    ),

  CONSTRAINT chk_tax_controls_parameters_object
    CHECK (jsonb_typeof(parameters) = 'object'),

  CONSTRAINT chk_tax_controls_required_inputs_array
    CHECK (jsonb_typeof(required_inputs) = 'array')
);

CREATE TABLE IF NOT EXISTS tax_control_rules (
  tax_control_id  INT         NOT NULL REFERENCES tax_controls(id),
  tax_rule_id     INT         NOT NULL REFERENCES tax_rules(id),
  rule_role       TEXT        NOT NULL DEFAULT 'primary',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT pk_tax_control_rules
    PRIMARY KEY (tax_control_id, tax_rule_id),

  CONSTRAINT chk_tax_control_rules_role
    CHECK (rule_role IN ('primary', 'supporting', 'exception'))
);

-- ============================================================
-- 2. Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_tax_rules_rule_code
  ON tax_rules(rule_code);

CREATE INDEX IF NOT EXISTS idx_tax_rules_status
  ON tax_rules(status);

CREATE INDEX IF NOT EXISTS idx_tax_rules_tax_type
  ON tax_rules(tax_type);

CREATE INDEX IF NOT EXISTS idx_tax_rules_effective_from
  ON tax_rules(effective_from);

CREATE INDEX IF NOT EXISTS idx_tax_rules_effective_to
  ON tax_rules(effective_to);

CREATE INDEX IF NOT EXISTS idx_tax_rules_supersedes
  ON tax_rules(supersedes_rule_id);

CREATE INDEX IF NOT EXISTS idx_tax_rule_source_versions_source_version
  ON tax_rule_source_versions(tax_source_version_id);

CREATE INDEX IF NOT EXISTS idx_tax_controls_control_code
  ON tax_controls(control_code);

CREATE INDEX IF NOT EXISTS idx_tax_controls_kind
  ON tax_controls(control_kind);

CREATE INDEX IF NOT EXISTS idx_tax_controls_status
  ON tax_controls(status);

CREATE INDEX IF NOT EXISTS idx_tax_controls_enabled
  ON tax_controls(is_enabled);

CREATE INDEX IF NOT EXISTS idx_tax_controls_effective_from
  ON tax_controls(effective_from);

CREATE INDEX IF NOT EXISTS idx_tax_controls_effective_to
  ON tax_controls(effective_to);

CREATE INDEX IF NOT EXISTS idx_tax_controls_evaluator_key
  ON tax_controls(evaluator_key);

CREATE INDEX IF NOT EXISTS idx_tax_controls_supersedes
  ON tax_controls(supersedes_control_id);

CREATE INDEX IF NOT EXISTS idx_tax_control_rules_rule
  ON tax_control_rules(tax_rule_id);

-- ============================================================
-- 3. updated_at triggers
-- ============================================================
-- Existing schema function update_updated_at() is reused when available.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'update_updated_at'
  ) THEN
    DROP TRIGGER IF EXISTS trg_tax_rules_updated_at ON tax_rules;
    CREATE TRIGGER trg_tax_rules_updated_at
      BEFORE UPDATE ON tax_rules
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();

    DROP TRIGGER IF EXISTS trg_tax_controls_updated_at ON tax_controls;
    CREATE TRIGGER trg_tax_controls_updated_at
      BEFORE UPDATE ON tax_controls
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();

    RAISE NOTICE 'tax_rules / tax_controls の updated_at trigger を設定しました。';
  ELSE
    RAISE NOTICE 'update_updated_at() が存在しないため updated_at trigger をスキップしました。';
  END IF;
END $$;

-- ============================================================
-- 4. Approved-version immutability
-- ============================================================

CREATE OR REPLACE FUNCTION protect_approved_tax_rule_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'approved' THEN
    IF NEW.status NOT IN ('approved', 'retired') THEN
      RAISE EXCEPTION
        'approved tax_rule % cannot transition to status %',
        OLD.id, NEW.status;
    END IF;

    IF NEW.rule_code IS DISTINCT FROM OLD.rule_code
       OR NEW.version_no IS DISTINCT FROM OLD.version_no
       OR NEW.tax_type IS DISTINCT FROM OLD.tax_type
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.rule_statement IS DISTINCT FROM OLD.rule_statement
       OR NEW.applicability_note IS DISTINCT FROM OLD.applicability_note
       OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
       OR NEW.effective_to IS DISTINCT FROM OLD.effective_to
       OR NEW.supersedes_rule_id IS DISTINCT FROM OLD.supersedes_rule_id
       OR NEW.proposed_by_kind IS DISTINCT FROM OLD.proposed_by_kind
       OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
    THEN
      RAISE EXCEPTION
        'approved tax_rule % is immutable; create a new version instead',
        OLD.id;
    END IF;
  ELSIF OLD.status = 'retired' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.rule_code IS DISTINCT FROM OLD.rule_code
       OR NEW.version_no IS DISTINCT FROM OLD.version_no
       OR NEW.tax_type IS DISTINCT FROM OLD.tax_type
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.rule_statement IS DISTINCT FROM OLD.rule_statement
       OR NEW.applicability_note IS DISTINCT FROM OLD.applicability_note
       OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
       OR NEW.effective_to IS DISTINCT FROM OLD.effective_to
       OR NEW.supersedes_rule_id IS DISTINCT FROM OLD.supersedes_rule_id
       OR NEW.proposed_by_kind IS DISTINCT FROM OLD.proposed_by_kind
       OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
    THEN
      RAISE EXCEPTION
        'retired tax_rule % is immutable',
        OLD.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_approved_tax_rule_update ON tax_rules;
CREATE TRIGGER trg_protect_approved_tax_rule_update
  BEFORE UPDATE ON tax_rules
  FOR EACH ROW EXECUTE FUNCTION protect_approved_tax_rule_update();

CREATE OR REPLACE FUNCTION protect_approved_tax_control_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'approved' THEN
    IF NEW.status NOT IN ('approved', 'retired') THEN
      RAISE EXCEPTION
        'approved tax_control % cannot transition to status %',
        OLD.id, NEW.status;
    END IF;

    IF NEW.control_code IS DISTINCT FROM OLD.control_code
       OR NEW.version_no IS DISTINCT FROM OLD.version_no
       OR NEW.control_kind IS DISTINCT FROM OLD.control_kind
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.evaluator_key IS DISTINCT FROM OLD.evaluator_key
       OR NEW.parameters IS DISTINCT FROM OLD.parameters
       OR NEW.required_inputs IS DISTINCT FROM OLD.required_inputs
       OR NEW.default_severity IS DISTINCT FROM OLD.default_severity
       OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
       OR NEW.effective_to IS DISTINCT FROM OLD.effective_to
       OR NEW.supersedes_control_id IS DISTINCT FROM OLD.supersedes_control_id
       OR NEW.proposed_by_kind IS DISTINCT FROM OLD.proposed_by_kind
       OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
    THEN
      RAISE EXCEPTION
        'approved tax_control % is immutable; create a new version instead',
        OLD.id;
    END IF;
  ELSIF OLD.status = 'retired' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.control_code IS DISTINCT FROM OLD.control_code
       OR NEW.version_no IS DISTINCT FROM OLD.version_no
       OR NEW.control_kind IS DISTINCT FROM OLD.control_kind
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.evaluator_key IS DISTINCT FROM OLD.evaluator_key
       OR NEW.parameters IS DISTINCT FROM OLD.parameters
       OR NEW.required_inputs IS DISTINCT FROM OLD.required_inputs
       OR NEW.default_severity IS DISTINCT FROM OLD.default_severity
       OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
       OR NEW.effective_to IS DISTINCT FROM OLD.effective_to
       OR NEW.supersedes_control_id IS DISTINCT FROM OLD.supersedes_control_id
       OR NEW.proposed_by_kind IS DISTINCT FROM OLD.proposed_by_kind
       OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
    THEN
      RAISE EXCEPTION
        'retired tax_control % is immutable',
        OLD.id;
    END IF;
  END IF;

  -- is_enabled is intentionally operational and may change after approval.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_approved_tax_control_update ON tax_controls;
CREATE TRIGGER trg_protect_approved_tax_control_update
  BEFORE UPDATE ON tax_controls
  FOR EACH ROW EXECUTE FUNCTION protect_approved_tax_control_update();

-- Protect provenance links once their parent Rule/Control is approved or retired.

CREATE OR REPLACE FUNCTION protect_tax_rule_source_version_link()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  parent_rule_id INT;
  parent_status TEXT;
BEGIN
  parent_rule_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.tax_rule_id ELSE NEW.tax_rule_id END;

  SELECT status
    INTO parent_status
  FROM tax_rules
  WHERE id = parent_rule_id;

  IF parent_status IN ('approved', 'retired') THEN
    RAISE EXCEPTION
      'source links for tax_rule % are immutable after approval',
      parent_rule_id;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.tax_rule_id IS DISTINCT FROM NEW.tax_rule_id THEN
    SELECT status
      INTO parent_status
    FROM tax_rules
    WHERE id = OLD.tax_rule_id;

    IF parent_status IN ('approved', 'retired') THEN
      RAISE EXCEPTION
        'source links for tax_rule % are immutable after approval',
        OLD.tax_rule_id;
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_tax_rule_source_version_link
  ON tax_rule_source_versions;

CREATE TRIGGER trg_protect_tax_rule_source_version_link
  BEFORE INSERT OR UPDATE OR DELETE ON tax_rule_source_versions
  FOR EACH ROW EXECUTE FUNCTION protect_tax_rule_source_version_link();

CREATE OR REPLACE FUNCTION protect_tax_control_rule_link()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  parent_control_id INT;
  parent_status TEXT;
BEGIN
  parent_control_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.tax_control_id ELSE NEW.tax_control_id END;

  SELECT status
    INTO parent_status
  FROM tax_controls
  WHERE id = parent_control_id;

  IF parent_status IN ('approved', 'retired') THEN
    RAISE EXCEPTION
      'rule links for tax_control % are immutable after approval',
      parent_control_id;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.tax_control_id IS DISTINCT FROM NEW.tax_control_id THEN
    SELECT status
      INTO parent_status
    FROM tax_controls
    WHERE id = OLD.tax_control_id;

    IF parent_status IN ('approved', 'retired') THEN
      RAISE EXCEPTION
        'rule links for tax_control % are immutable after approval',
        OLD.tax_control_id;
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_tax_control_rule_link
  ON tax_control_rules;

CREATE TRIGGER trg_protect_tax_control_rule_link
  BEFORE INSERT OR UPDATE OR DELETE ON tax_control_rules
  FOR EACH ROW EXECUTE FUNCTION protect_tax_control_rule_link();

-- ============================================================
-- 5. RLS / GRANT
-- ============================================================

ALTER TABLE tax_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_rule_source_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_control_rules ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON tax_rules FROM anon;
REVOKE ALL ON tax_rule_source_versions FROM anon;
REVOKE ALL ON tax_controls FROM anon;
REVOKE ALL ON tax_control_rules FROM anon;

REVOKE ALL ON tax_rules FROM PUBLIC;
REVOKE ALL ON tax_rule_source_versions FROM PUBLIC;
REVOKE ALL ON tax_controls FROM PUBLIC;
REVOKE ALL ON tax_control_rules FROM PUBLIC;

REVOKE ALL ON SEQUENCE tax_rules_id_seq FROM anon;
REVOKE ALL ON SEQUENCE tax_controls_id_seq FROM anon;
REVOKE ALL ON SEQUENCE tax_rules_id_seq FROM PUBLIC;
REVOKE ALL ON SEQUENCE tax_controls_id_seq FROM PUBLIC;

REVOKE DELETE ON tax_rules FROM authenticated;
REVOKE DELETE ON tax_rule_source_versions FROM authenticated;
REVOKE DELETE ON tax_controls FROM authenticated;
REVOKE DELETE ON tax_control_rules FROM authenticated;

DROP POLICY IF EXISTS "public_read" ON tax_rules;
DROP POLICY IF EXISTS "public_read" ON tax_rule_source_versions;
DROP POLICY IF EXISTS "public_read" ON tax_controls;
DROP POLICY IF EXISTS "public_read" ON tax_control_rules;

DROP POLICY IF EXISTS "admin_select" ON tax_rules;
DROP POLICY IF EXISTS "admin_insert" ON tax_rules;
DROP POLICY IF EXISTS "admin_update" ON tax_rules;
DROP POLICY IF EXISTS "admin_delete" ON tax_rules;

DROP POLICY IF EXISTS "admin_select" ON tax_rule_source_versions;
DROP POLICY IF EXISTS "admin_insert" ON tax_rule_source_versions;
DROP POLICY IF EXISTS "admin_update" ON tax_rule_source_versions;
DROP POLICY IF EXISTS "admin_delete" ON tax_rule_source_versions;

DROP POLICY IF EXISTS "admin_select" ON tax_controls;
DROP POLICY IF EXISTS "admin_insert" ON tax_controls;
DROP POLICY IF EXISTS "admin_update" ON tax_controls;
DROP POLICY IF EXISTS "admin_delete" ON tax_controls;

DROP POLICY IF EXISTS "admin_select" ON tax_control_rules;
DROP POLICY IF EXISTS "admin_insert" ON tax_control_rules;
DROP POLICY IF EXISTS "admin_update" ON tax_control_rules;
DROP POLICY IF EXISTS "admin_delete" ON tax_control_rules;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'admin_users'
  ) THEN
    GRANT SELECT, INSERT, UPDATE ON tax_rules TO authenticated;
    GRANT SELECT, INSERT, UPDATE ON tax_rule_source_versions TO authenticated;
    GRANT SELECT, INSERT, UPDATE ON tax_controls TO authenticated;
    GRANT SELECT, INSERT, UPDATE ON tax_control_rules TO authenticated;

    GRANT USAGE, SELECT ON SEQUENCE tax_rules_id_seq TO authenticated;
    GRANT USAGE, SELECT ON SEQUENCE tax_controls_id_seq TO authenticated;

    CREATE POLICY "admin_select" ON tax_rules
      FOR SELECT
      USING (auth.email() IN (SELECT email FROM admin_users));

    CREATE POLICY "admin_insert" ON tax_rules
      FOR INSERT
      WITH CHECK (auth.email() IN (SELECT email FROM admin_users));

    CREATE POLICY "admin_update" ON tax_rules
      FOR UPDATE
      USING (auth.email() IN (SELECT email FROM admin_users))
      WITH CHECK (auth.email() IN (SELECT email FROM admin_users));

    CREATE POLICY "admin_select" ON tax_rule_source_versions
      FOR SELECT
      USING (auth.email() IN (SELECT email FROM admin_users));

    CREATE POLICY "admin_insert" ON tax_rule_source_versions
      FOR INSERT
      WITH CHECK (auth.email() IN (SELECT email FROM admin_users));

    CREATE POLICY "admin_update" ON tax_rule_source_versions
      FOR UPDATE
      USING (auth.email() IN (SELECT email FROM admin_users))
      WITH CHECK (auth.email() IN (SELECT email FROM admin_users));

    CREATE POLICY "admin_select" ON tax_controls
      FOR SELECT
      USING (auth.email() IN (SELECT email FROM admin_users));

    CREATE POLICY "admin_insert" ON tax_controls
      FOR INSERT
      WITH CHECK (auth.email() IN (SELECT email FROM admin_users));

    CREATE POLICY "admin_update" ON tax_controls
      FOR UPDATE
      USING (auth.email() IN (SELECT email FROM admin_users))
      WITH CHECK (auth.email() IN (SELECT email FROM admin_users));

    CREATE POLICY "admin_select" ON tax_control_rules
      FOR SELECT
      USING (auth.email() IN (SELECT email FROM admin_users));

    CREATE POLICY "admin_insert" ON tax_control_rules
      FOR INSERT
      WITH CHECK (auth.email() IN (SELECT email FROM admin_users));

    CREATE POLICY "admin_update" ON tax_control_rules
      FOR UPDATE
      USING (auth.email() IN (SELECT email FROM admin_users))
      WITH CHECK (auth.email() IN (SELECT email FROM admin_users));

    RAISE NOTICE 'TaxRule / TaxControl admin RLS policies を設定しました。';
  ELSE
    RAISE NOTICE 'admin_users が存在しないため authenticated grants / admin policies をスキップしました。';
  END IF;
END $$;

-- ============================================================
-- 6. Validation queries
-- ============================================================

-- 6-1. table / RLS
SELECT
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'tax_rules',
    'tax_rule_source_versions',
    'tax_controls',
    'tax_control_rules'
  )
ORDER BY tablename;

-- 6-2. policies
SELECT
  tablename,
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'tax_rules',
    'tax_rule_source_versions',
    'tax_controls',
    'tax_control_rules'
  )
ORDER BY tablename, cmd, policyname;

-- 6-3. authenticated / anon privileges
SELECT
  table_name,
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN (
    'tax_rules',
    'tax_rule_source_versions',
    'tax_controls',
    'tax_control_rules'
  )
  AND grantee IN ('anon', 'authenticated')
ORDER BY table_name, grantee, privilege_type;

-- 6-4. constraints
SELECT
  conrelid::regclass::text AS table_name,
  conname,
  contype
FROM pg_constraint
WHERE conrelid IN (
  'public.tax_rules'::regclass,
  'public.tax_rule_source_versions'::regclass,
  'public.tax_controls'::regclass,
  'public.tax_control_rules'::regclass
)
ORDER BY table_name, conname;

-- 6-5. indexes
SELECT
  tablename,
  indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'tax_rules',
    'tax_rule_source_versions',
    'tax_controls',
    'tax_control_rules'
  )
ORDER BY tablename, indexname;

-- 6-6. protection triggers
SELECT
  event_object_table AS table_name,
  trigger_name,
  event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table IN (
    'tax_rules',
    'tax_rule_source_versions',
    'tax_controls',
    'tax_control_rules'
  )
ORDER BY table_name, trigger_name, event_manipulation;
