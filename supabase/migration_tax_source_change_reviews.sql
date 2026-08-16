-- ============================================================
-- SUNBOO Tax Intelligence
-- TaxSource change review persistence
-- ============================================================
--
-- 全社共通TaxSourceVersionの変更レビューを保存する。
-- Workspace単位のworkspace_tax_review_casesとは分離する。
--
-- Lifecycle:
--   open -> resolved
--   open -> dismissed
--
-- Closed cases are immutable. DELETE is not allowed.
-- ============================================================

CREATE TABLE IF NOT EXISTS tax_source_change_reviews (
  id                             SERIAL      PRIMARY KEY,
  tax_source_version_id          INTEGER     NOT NULL
    REFERENCES tax_source_versions(id),
  tax_source_id                  INTEGER     NOT NULL
    REFERENCES tax_sources(id),
  supersedes_source_version_id   INTEGER     NOT NULL
    REFERENCES tax_source_versions(id),

  status                         TEXT        NOT NULL DEFAULT 'open',
  impact_snapshot                JSONB       NOT NULL,
  detected_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  resolution_summary             TEXT,
  resolved_by                    TEXT,
  resolved_at                    TIMESTAMPTZ,

  created_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_tax_source_change_reviews_version
    UNIQUE (tax_source_version_id),

  CONSTRAINT chk_tax_source_change_reviews_status
    CHECK (status IN ('open', 'resolved', 'dismissed')),

  CONSTRAINT chk_tax_source_change_reviews_snapshot_object
    CHECK (jsonb_typeof(impact_snapshot) = 'object'),

  CONSTRAINT chk_tax_source_change_reviews_rule_candidates
    CHECK (
      jsonb_typeof(
        impact_snapshot -> 'ruleCandidates'
      ) = 'array'
    ),

  CONSTRAINT chk_tax_source_change_reviews_control_candidates
    CHECK (
      jsonb_typeof(
        impact_snapshot -> 'controlCandidates'
      ) = 'array'
    ),

  CONSTRAINT chk_tax_source_change_reviews_resolution
    CHECK (
      (
        status = 'open'
        AND resolution_summary IS NULL
        AND resolved_by IS NULL
        AND resolved_at IS NULL
      )
      OR
      (
        status IN ('resolved', 'dismissed')
        AND resolution_summary IS NOT NULL
        AND length(trim(resolution_summary)) > 0
        AND resolved_by IS NOT NULL
        AND length(trim(resolved_by)) > 0
        AND resolved_at IS NOT NULL
      )
    )
);

CREATE INDEX IF NOT EXISTS
  idx_tax_source_change_reviews_status
  ON tax_source_change_reviews(status);

CREATE INDEX IF NOT EXISTS
  idx_tax_source_change_reviews_source
  ON tax_source_change_reviews(
    tax_source_id,
    detected_at DESC
  );

CREATE INDEX IF NOT EXISTS
  idx_tax_source_change_reviews_updated
  ON tax_source_change_reviews(updated_at DESC);

-- ============================================================
-- Validation / lifecycle
-- ============================================================

CREATE OR REPLACE FUNCTION
  validate_tax_source_change_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tax_source_id          INTEGER;
  v_supersedes_version_id  INTEGER;
  v_supersedes_source_id   INTEGER;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'open'
      OR NEW.resolution_summary IS NOT NULL
      OR NEW.resolved_by IS NOT NULL
      OR NEW.resolved_at IS NOT NULL
    THEN
      RAISE EXCEPTION
        'TaxSource change review must start open';
    END IF;

    SELECT
      v.tax_source_id,
      v.supersedes_version_id
    INTO
      v_tax_source_id,
      v_supersedes_version_id
    FROM tax_source_versions AS v
    WHERE v.id = NEW.tax_source_version_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'TaxSourceVersion % does not exist',
        NEW.tax_source_version_id;
    END IF;

    IF v_supersedes_version_id IS NULL THEN
      RAISE EXCEPTION
        'Initial TaxSourceVersion % does not require a change review',
        NEW.tax_source_version_id;
    END IF;

    SELECT v.tax_source_id
    INTO v_supersedes_source_id
    FROM tax_source_versions AS v
    WHERE v.id = v_supersedes_version_id;

    IF NOT FOUND
      OR v_supersedes_source_id <> v_tax_source_id
    THEN
      RAISE EXCEPTION
        'TaxSourceVersion % has an invalid supersedes relationship',
        NEW.tax_source_version_id;
    END IF;

    IF NEW.tax_source_id <> v_tax_source_id
      OR NEW.supersedes_source_version_id <>
        v_supersedes_version_id
    THEN
      RAISE EXCEPTION
        'TaxSource change review provenance does not match SourceVersion %',
        NEW.tax_source_version_id;
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.tax_source_version_id IS DISTINCT FROM
      OLD.tax_source_version_id
    OR NEW.tax_source_id IS DISTINCT FROM OLD.tax_source_id
    OR NEW.supersedes_source_version_id IS DISTINCT FROM
      OLD.supersedes_source_version_id
    OR NEW.impact_snapshot IS DISTINCT FROM
      OLD.impact_snapshot
    OR NEW.detected_at IS DISTINCT FROM OLD.detected_at
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION
      'TaxSource change review % provenance is immutable',
      OLD.id;
  END IF;

  IF OLD.status IN ('resolved', 'dismissed') THEN
    RAISE EXCEPTION
      'Closed TaxSource change review % is immutable',
      OLD.id;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status NOT IN ('resolved', 'dismissed') THEN
      RAISE EXCEPTION
        'Invalid TaxSource change review transition: % -> %',
        OLD.status,
        NEW.status;
    END IF;

    IF NEW.resolution_summary IS NULL
      OR length(trim(NEW.resolution_summary)) = 0
    THEN
      RAISE EXCEPTION
        'TaxSource change review % requires resolution_summary',
        OLD.id;
    END IF;

    IF auth.email() IS NOT NULL THEN
      NEW.resolved_by := auth.email();
      NEW.resolved_at := NOW();
    ELSE
      IF NEW.resolved_by IS NULL
        OR length(trim(NEW.resolved_by)) = 0
      THEN
        RAISE EXCEPTION
          'TaxSource change review % requires resolved_by',
          OLD.id;
      END IF;

      NEW.resolved_at :=
        COALESCE(NEW.resolved_at, NOW());
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.resolution_summary IS DISTINCT FROM
      OLD.resolution_summary
    OR NEW.resolved_by IS DISTINCT FROM OLD.resolved_by
    OR NEW.resolved_at IS DISTINCT FROM OLD.resolved_at
  THEN
    RAISE EXCEPTION
      'Resolution metadata requires a status transition';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS
  trg_validate_tax_source_change_review
  ON tax_source_change_reviews;

CREATE TRIGGER
  trg_validate_tax_source_change_review
  BEFORE INSERT OR UPDATE
  ON tax_source_change_reviews
  FOR EACH ROW
  EXECUTE FUNCTION
    validate_tax_source_change_review();

DROP TRIGGER IF EXISTS
  trg_tax_source_change_reviews_updated_at
  ON tax_source_change_reviews;

CREATE TRIGGER
  trg_tax_source_change_reviews_updated_at
  BEFORE UPDATE
  ON tax_source_change_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Idempotent review creation
-- ============================================================

CREATE OR REPLACE FUNCTION
  ensure_tax_source_change_review(
    p_tax_source_version_id  INTEGER,
    p_impact_snapshot        JSONB
  )
RETURNS TABLE (
  review_id                      INTEGER,
  tax_source_version_id          INTEGER,
  status                         TEXT,
  was_created                    BOOLEAN
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_tax_source_id          INTEGER;
  v_supersedes_version_id  INTEGER;
  v_review_id              INTEGER;
  v_status                 TEXT;
  v_was_created            BOOLEAN := FALSE;
BEGIN
  IF p_impact_snapshot IS NULL
    OR jsonb_typeof(p_impact_snapshot) <> 'object'
    OR jsonb_typeof(
      p_impact_snapshot -> 'ruleCandidates'
    ) <> 'array'
    OR jsonb_typeof(
      p_impact_snapshot -> 'controlCandidates'
    ) <> 'array'
  THEN
    RAISE EXCEPTION
      'impact_snapshot must contain ruleCandidates and controlCandidates arrays';
  END IF;

  SELECT
    v.tax_source_id,
    v.supersedes_version_id
  INTO
    v_tax_source_id,
    v_supersedes_version_id
  FROM tax_source_versions AS v
  WHERE v.id = p_tax_source_version_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'TaxSourceVersion % does not exist',
      p_tax_source_version_id;
  END IF;

  IF v_supersedes_version_id IS NULL THEN
    RAISE EXCEPTION
      'Initial TaxSourceVersion % does not require a change review',
      p_tax_source_version_id;
  END IF;

  INSERT INTO tax_source_change_reviews (
    tax_source_version_id,
    tax_source_id,
    supersedes_source_version_id,
    impact_snapshot
  )
  VALUES (
    p_tax_source_version_id,
    v_tax_source_id,
    v_supersedes_version_id,
    p_impact_snapshot
  )
  ON CONFLICT (tax_source_version_id)
  DO NOTHING
  RETURNING id, tax_source_change_reviews.status
  INTO v_review_id, v_status;

  IF FOUND THEN
    v_was_created := TRUE;
  ELSE
    SELECT
      r.id,
      r.status
    INTO
      v_review_id,
      v_status
    FROM tax_source_change_reviews AS r
    WHERE r.tax_source_version_id =
      p_tax_source_version_id;
  END IF;

  RETURN QUERY
  SELECT
    v_review_id,
    p_tax_source_version_id,
    v_status,
    v_was_created;
END;
$$;

-- ============================================================
-- RLS / privileges
-- ============================================================

ALTER TABLE tax_source_change_reviews
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON tax_source_change_reviews FROM anon;
REVOKE ALL ON tax_source_change_reviews FROM PUBLIC;
REVOKE ALL ON tax_source_change_reviews FROM authenticated;

REVOKE ALL ON SEQUENCE
  tax_source_change_reviews_id_seq FROM anon;
REVOKE ALL ON SEQUENCE
  tax_source_change_reviews_id_seq FROM PUBLIC;
REVOKE ALL ON SEQUENCE
  tax_source_change_reviews_id_seq FROM authenticated;

REVOKE ALL ON FUNCTION
  ensure_tax_source_change_review(INTEGER, JSONB)
  FROM PUBLIC;

REVOKE ALL ON FUNCTION
  ensure_tax_source_change_review(INTEGER, JSONB)
  FROM anon;

REVOKE ALL ON FUNCTION
  ensure_tax_source_change_review(INTEGER, JSONB)
  FROM authenticated;

DROP POLICY IF EXISTS "admin_select"
  ON tax_source_change_reviews;
DROP POLICY IF EXISTS "admin_insert"
  ON tax_source_change_reviews;
DROP POLICY IF EXISTS "admin_update"
  ON tax_source_change_reviews;
DROP POLICY IF EXISTS "admin_delete"
  ON tax_source_change_reviews;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'admin_users'
  ) THEN
    GRANT SELECT, INSERT, UPDATE
      ON tax_source_change_reviews
      TO authenticated;

    GRANT USAGE, SELECT
      ON SEQUENCE tax_source_change_reviews_id_seq
      TO authenticated;

    GRANT EXECUTE ON FUNCTION
      ensure_tax_source_change_review(INTEGER, JSONB)
      TO authenticated;

    CREATE POLICY "admin_select"
      ON tax_source_change_reviews
      FOR SELECT
      USING (
        auth.email() IN (
          SELECT email FROM admin_users
        )
      );

    CREATE POLICY "admin_insert"
      ON tax_source_change_reviews
      FOR INSERT
      WITH CHECK (
        auth.email() IN (
          SELECT email FROM admin_users
        )
      );

    CREATE POLICY "admin_update"
      ON tax_source_change_reviews
      FOR UPDATE
      USING (
        auth.email() IN (
          SELECT email FROM admin_users
        )
      )
      WITH CHECK (
        auth.email() IN (
          SELECT email FROM admin_users
        )
      );

    RAISE NOTICE
      'TaxSource change review admin policies configured.';
  ELSE
    RAISE NOTICE
      'admin_users does not exist; grants and policies skipped.';
  END IF;
END $$;

-- ============================================================
-- Validation
-- ============================================================

SELECT
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'tax_source_change_reviews';

SELECT
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'tax_source_change_reviews'
ORDER BY cmd, policyname;

SELECT
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'tax_source_change_reviews'
  AND grantee IN ('anon', 'authenticated')
ORDER BY grantee, privilege_type;
