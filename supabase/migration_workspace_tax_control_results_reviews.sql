-- ============================================================
-- SUNBOO Tax Intelligence — TI-0.4
-- ControlResult / ReviewCase persistence
-- ============================================================

CREATE TABLE IF NOT EXISTS workspace_tax_control_results (
  id                       SERIAL      PRIMARY KEY,
  company_id               INTEGER     NOT NULL REFERENCES workspace_companies(id) ON DELETE CASCADE,
  tax_control_id           INTEGER     NOT NULL REFERENCES tax_controls(id),
  as_of_date               DATE        NOT NULL,
  applicable               BOOLEAN     NOT NULL,
  status                   TEXT,
  reason_code              TEXT        NOT NULL,
  reason_summary           TEXT        NOT NULL,
  observed_inputs          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  source_version_snapshot  JSONB       NOT NULL DEFAULT '[]'::jsonb,
  evaluated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  evaluator_version        TEXT        NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_workspace_tax_control_results_id_company UNIQUE (id, company_id),
  CONSTRAINT chk_workspace_tax_control_results_status CHECK (
    (applicable = FALSE AND status IS NULL)
    OR (applicable = TRUE AND status IN ('pass', 'review', 'unknown'))
  ),
  CONSTRAINT chk_workspace_tax_control_results_observed_inputs_object
    CHECK (jsonb_typeof(observed_inputs) = 'object'),
  CONSTRAINT chk_workspace_tax_control_results_source_snapshot_array
    CHECK (jsonb_typeof(source_version_snapshot) = 'array'),
  CONSTRAINT chk_workspace_tax_control_results_evaluator_version_not_blank
    CHECK (length(trim(evaluator_version)) > 0),
  CONSTRAINT chk_workspace_tax_control_results_reason_code_not_blank
    CHECK (length(trim(reason_code)) > 0),
  CONSTRAINT chk_workspace_tax_control_results_reason_summary_not_blank
    CHECK (length(trim(reason_summary)) > 0)
);

CREATE TABLE IF NOT EXISTS workspace_tax_review_cases (
  id                  SERIAL      PRIMARY KEY,
  company_id          INTEGER     NOT NULL,
  control_result_id   INTEGER     NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'open',
  title               TEXT        NOT NULL,
  issue_summary       TEXT        NOT NULL,
  resolution_summary  TEXT,
  resolved_by         TEXT,
  resolved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_workspace_tax_review_cases_control_result UNIQUE (control_result_id),
  CONSTRAINT uq_workspace_tax_review_cases_id_company UNIQUE (id, company_id),
  CONSTRAINT fk_workspace_tax_review_cases_result_company
    FOREIGN KEY (control_result_id, company_id)
    REFERENCES workspace_tax_control_results(id, company_id)
    ON DELETE CASCADE,
  CONSTRAINT chk_workspace_tax_review_cases_status
    CHECK (status IN ('open', 'resolved', 'dismissed')),
  CONSTRAINT chk_workspace_tax_review_cases_title_not_blank
    CHECK (length(trim(title)) > 0),
  CONSTRAINT chk_workspace_tax_review_cases_issue_summary_not_blank
    CHECK (length(trim(issue_summary)) > 0),
  CONSTRAINT chk_workspace_tax_review_cases_resolution_metadata CHECK (
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

CREATE TABLE IF NOT EXISTS workspace_tax_review_case_events (
  id             SERIAL      PRIMARY KEY,
  company_id     INTEGER     NOT NULL,
  review_case_id INTEGER     NOT NULL,
  event_type     TEXT        NOT NULL,
  from_status    TEXT,
  to_status      TEXT,
  event_summary  TEXT,
  actor_email    TEXT,
  case_snapshot  JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_workspace_tax_review_case_events_case_company
    FOREIGN KEY (review_case_id, company_id)
    REFERENCES workspace_tax_review_cases(id, company_id)
    ON DELETE CASCADE,
  CONSTRAINT chk_workspace_tax_review_case_events_type
    CHECK (event_type IN ('opened', 'resolution', 'dismissal', 'reopened')),
  CONSTRAINT chk_workspace_tax_review_case_events_status_values CHECK (
    (from_status IS NULL OR from_status IN ('open', 'resolved', 'dismissed'))
    AND (to_status IS NULL OR to_status IN ('open', 'resolved', 'dismissed'))
  ),
  CONSTRAINT chk_workspace_tax_review_case_events_semantics CHECK (
    (event_type = 'opened' AND from_status IS NULL AND to_status = 'open')
    OR (event_type = 'resolution' AND from_status = 'open' AND to_status = 'resolved')
    OR (event_type = 'dismissal' AND from_status = 'open' AND to_status = 'dismissed')
    OR (event_type = 'reopened' AND from_status IN ('resolved', 'dismissed') AND to_status = 'open')
  ),
  CONSTRAINT chk_workspace_tax_review_case_events_snapshot_object
    CHECK (jsonb_typeof(case_snapshot) = 'object')
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_workspace_tax_control_results_company
  ON workspace_tax_control_results(company_id);
CREATE INDEX IF NOT EXISTS idx_workspace_tax_control_results_control
  ON workspace_tax_control_results(tax_control_id);
CREATE INDEX IF NOT EXISTS idx_workspace_tax_control_results_company_as_of
  ON workspace_tax_control_results(company_id, as_of_date DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_tax_control_results_latest
  ON workspace_tax_control_results(company_id, tax_control_id, as_of_date DESC, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_tax_control_results_company_status
  ON workspace_tax_control_results(company_id, status);
CREATE INDEX IF NOT EXISTS idx_workspace_tax_control_results_evaluated_at
  ON workspace_tax_control_results(evaluated_at DESC);

CREATE INDEX IF NOT EXISTS idx_workspace_tax_review_cases_company
  ON workspace_tax_review_cases(company_id);
CREATE INDEX IF NOT EXISTS idx_workspace_tax_review_cases_company_status
  ON workspace_tax_review_cases(company_id, status);
CREATE INDEX IF NOT EXISTS idx_workspace_tax_review_cases_company_updated
  ON workspace_tax_review_cases(company_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_tax_review_cases_resolved_at
  ON workspace_tax_review_cases(resolved_at);

CREATE INDEX IF NOT EXISTS idx_workspace_tax_review_case_events_company
  ON workspace_tax_review_case_events(company_id);
CREATE INDEX IF NOT EXISTS idx_workspace_tax_review_case_events_case_created
  ON workspace_tax_review_case_events(review_case_id, created_at);
CREATE INDEX IF NOT EXISTS idx_workspace_tax_review_case_events_company_created
  ON workspace_tax_review_case_events(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_tax_review_case_events_type
  ON workspace_tax_review_case_events(event_type);

-- ============================================================
-- ControlResult append-only protection
-- ============================================================

CREATE OR REPLACE FUNCTION protect_workspace_tax_control_result_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION
    'workspace_tax_control_result % is immutable; insert a new result instead',
    OLD.id;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_workspace_tax_control_result_update
  ON workspace_tax_control_results;
CREATE TRIGGER trg_protect_workspace_tax_control_result_update
  BEFORE UPDATE ON workspace_tax_control_results
  FOR EACH ROW EXECUTE FUNCTION protect_workspace_tax_control_result_update();

-- ============================================================
-- ReviewCase validation / lifecycle
-- DB owns resolved_by / resolved_at for authenticated reviewers.
-- Reopen automatically clears current resolution metadata; prior decisions
-- remain in the append-only event history.
-- ============================================================

CREATE OR REPLACE FUNCTION validate_workspace_tax_review_case()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result_applicable BOOLEAN;
  v_result_status     TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'open'
       OR NEW.resolution_summary IS NOT NULL
       OR NEW.resolved_by IS NOT NULL
       OR NEW.resolved_at IS NOT NULL
    THEN
      RAISE EXCEPTION
        'workspace_tax_review_case must start open with no resolution metadata';
    END IF;

    SELECT r.applicable, r.status
      INTO v_result_applicable, v_result_status
      FROM public.workspace_tax_control_results r
     WHERE r.id = NEW.control_result_id
       AND r.company_id = NEW.company_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'control_result % does not exist for company %',
        NEW.control_result_id, NEW.company_id;
    END IF;

    IF v_result_applicable IS DISTINCT FROM TRUE
       OR v_result_status NOT IN ('review', 'unknown')
    THEN
      RAISE EXCEPTION
        'ReviewCase requires an applicable REVIEW or UNKNOWN ControlResult; result % has status %',
        NEW.control_result_id, COALESCE(v_result_status, 'NULL');
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.control_result_id IS DISTINCT FROM OLD.control_result_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION
      'workspace_tax_review_case % identity/provenance is immutable', OLD.id;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'open' AND NEW.status IN ('resolved', 'dismissed') THEN
      -- The reviewer supplies the decision summary, but DB owns reviewer identity/time.
      IF NEW.resolution_summary IS NULL
         OR length(trim(NEW.resolution_summary)) = 0
      THEN
        RAISE EXCEPTION
          'ReviewCase % requires a non-blank resolution_summary before closing',
          OLD.id;
      END IF;

      IF auth.email() IS NOT NULL THEN
        NEW.resolved_by := auth.email();
        NEW.resolved_at := NOW();
      ELSE
        -- Allows explicit postgres/service maintenance while authenticated users
        -- can never spoof the reviewer identity or resolution timestamp.
        IF NEW.resolved_by IS NULL
           OR length(trim(NEW.resolved_by)) = 0
        THEN
          RAISE EXCEPTION
            'ReviewCase % requires resolved_by when no authenticated actor exists',
            OLD.id;
        END IF;

        NEW.resolved_at := COALESCE(NEW.resolved_at, NOW());
      END IF;

    ELSIF OLD.status IN ('resolved', 'dismissed') AND NEW.status = 'open' THEN
      -- Reopen clears current resolution metadata. The prior decision remains
      -- immutable in workspace_tax_review_case_events.
      NEW.resolution_summary := NULL;
      NEW.resolved_by := NULL;
      NEW.resolved_at := NULL;

    ELSE
      RAISE EXCEPTION
        'invalid ReviewCase status transition for case %: % -> %',
        OLD.id, OLD.status, NEW.status;
    END IF;

  ELSIF OLD.status IN ('resolved', 'dismissed')
        AND (
          NEW.resolution_summary IS DISTINCT FROM OLD.resolution_summary
          OR NEW.resolved_by IS DISTINCT FROM OLD.resolved_by
          OR NEW.resolved_at IS DISTINCT FROM OLD.resolved_at
        )
  THEN
    RAISE EXCEPTION
      'closed ReviewCase % resolution metadata is immutable; reopen before changing the decision',
      OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_workspace_tax_review_case
  ON workspace_tax_review_cases;
CREATE TRIGGER trg_validate_workspace_tax_review_case
  BEFORE INSERT OR UPDATE ON workspace_tax_review_cases
  FOR EACH ROW EXECUTE FUNCTION validate_workspace_tax_review_case();

DROP TRIGGER IF EXISTS trg_workspace_tax_review_cases_updated_at
  ON workspace_tax_review_cases;
CREATE TRIGGER trg_workspace_tax_review_cases_updated_at
  BEFORE UPDATE ON workspace_tax_review_cases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ReviewCaseEvent automatic audit history
-- ============================================================

CREATE OR REPLACE FUNCTION record_workspace_tax_review_case_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event_type    TEXT;
  v_event_summary TEXT;
  v_actor_email   TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.workspace_tax_review_case_events (
      company_id, review_case_id, event_type, from_status, to_status,
      event_summary, actor_email, case_snapshot
    )
    VALUES (
      NEW.company_id, NEW.id, 'opened', NULL, NEW.status,
      NEW.issue_summary, auth.email(),
      jsonb_build_object(
        'review_case_id', NEW.id,
        'company_id', NEW.company_id,
        'control_result_id', NEW.control_result_id,
        'status', NEW.status,
        'title', NEW.title,
        'issue_summary', NEW.issue_summary,
        'resolution_summary', NEW.resolution_summary,
        'resolved_by', NEW.resolved_by,
        'resolved_at', NEW.resolved_at,
        'updated_at', NEW.updated_at
      )
    );
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'open' AND NEW.status = 'resolved' THEN
    v_event_type := 'resolution';
    v_event_summary := NEW.resolution_summary;
  ELSIF OLD.status = 'open' AND NEW.status = 'dismissed' THEN
    v_event_type := 'dismissal';
    v_event_summary := NEW.resolution_summary;
  ELSIF OLD.status IN ('resolved', 'dismissed') AND NEW.status = 'open' THEN
    v_event_type := 'reopened';
    v_event_summary := 'ReviewCase reopened';
  ELSE
    RAISE EXCEPTION
      'cannot record unsupported ReviewCase transition for case %: % -> %',
      OLD.id, OLD.status, NEW.status;
  END IF;

  IF v_event_type IN ('resolution', 'dismissal') THEN
    v_actor_email := COALESCE(auth.email(), NEW.resolved_by);
  ELSE
    -- On reopen, never attribute the action to the previous resolver.
    v_actor_email := auth.email();
  END IF;

  INSERT INTO public.workspace_tax_review_case_events (
    company_id, review_case_id, event_type, from_status, to_status,
    event_summary, actor_email, case_snapshot
  )
  VALUES (
    NEW.company_id, NEW.id, v_event_type, OLD.status, NEW.status,
    v_event_summary, v_actor_email,
    jsonb_build_object(
      'review_case_id', NEW.id,
      'company_id', NEW.company_id,
      'control_result_id', NEW.control_result_id,
      'status', NEW.status,
      'title', NEW.title,
      'issue_summary', NEW.issue_summary,
      'resolution_summary', NEW.resolution_summary,
      'resolved_by', NEW.resolved_by,
      'resolved_at', NEW.resolved_at,
      'updated_at', NEW.updated_at
    )
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION record_workspace_tax_review_case_event() FROM PUBLIC;
REVOKE ALL ON FUNCTION record_workspace_tax_review_case_event() FROM anon;
REVOKE ALL ON FUNCTION record_workspace_tax_review_case_event() FROM authenticated;

DROP TRIGGER IF EXISTS trg_record_workspace_tax_review_case_event
  ON workspace_tax_review_cases;
CREATE TRIGGER trg_record_workspace_tax_review_case_event
  AFTER INSERT OR UPDATE ON workspace_tax_review_cases
  FOR EACH ROW EXECUTE FUNCTION record_workspace_tax_review_case_event();

CREATE OR REPLACE FUNCTION protect_workspace_tax_review_case_event_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'workspace_tax_review_case_event % is immutable', OLD.id;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_workspace_tax_review_case_event_update
  ON workspace_tax_review_case_events;
CREATE TRIGGER trg_protect_workspace_tax_review_case_event_update
  BEFORE UPDATE ON workspace_tax_review_case_events
  FOR EACH ROW EXECUTE FUNCTION protect_workspace_tax_review_case_event_update();

-- ============================================================
-- RLS / privileges
-- ============================================================

ALTER TABLE workspace_tax_control_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_tax_review_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_tax_review_case_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON workspace_tax_control_results FROM anon;
REVOKE ALL ON workspace_tax_review_cases FROM anon;
REVOKE ALL ON workspace_tax_review_case_events FROM anon;
REVOKE ALL ON workspace_tax_control_results FROM PUBLIC;
REVOKE ALL ON workspace_tax_review_cases FROM PUBLIC;
REVOKE ALL ON workspace_tax_review_case_events FROM PUBLIC;
REVOKE ALL ON workspace_tax_control_results FROM authenticated;
REVOKE ALL ON workspace_tax_review_cases FROM authenticated;
REVOKE ALL ON workspace_tax_review_case_events FROM authenticated;

REVOKE ALL ON SEQUENCE workspace_tax_control_results_id_seq FROM anon;
REVOKE ALL ON SEQUENCE workspace_tax_review_cases_id_seq FROM anon;
REVOKE ALL ON SEQUENCE workspace_tax_review_case_events_id_seq FROM anon;
REVOKE ALL ON SEQUENCE workspace_tax_control_results_id_seq FROM PUBLIC;
REVOKE ALL ON SEQUENCE workspace_tax_review_cases_id_seq FROM PUBLIC;
REVOKE ALL ON SEQUENCE workspace_tax_review_case_events_id_seq FROM PUBLIC;
REVOKE ALL ON SEQUENCE workspace_tax_control_results_id_seq FROM authenticated;
REVOKE ALL ON SEQUENCE workspace_tax_review_cases_id_seq FROM authenticated;
REVOKE ALL ON SEQUENCE workspace_tax_review_case_events_id_seq FROM authenticated;

DROP POLICY IF EXISTS "public_read" ON workspace_tax_control_results;
DROP POLICY IF EXISTS "public_read" ON workspace_tax_review_cases;
DROP POLICY IF EXISTS "public_read" ON workspace_tax_review_case_events;
DROP POLICY IF EXISTS "admin_all" ON workspace_tax_control_results;
DROP POLICY IF EXISTS "admin_all" ON workspace_tax_review_cases;
DROP POLICY IF EXISTS "admin_all" ON workspace_tax_review_case_events;

DROP POLICY IF EXISTS "member_select" ON workspace_tax_control_results;
DROP POLICY IF EXISTS "member_insert" ON workspace_tax_control_results;
DROP POLICY IF EXISTS "member_update" ON workspace_tax_control_results;
DROP POLICY IF EXISTS "member_delete" ON workspace_tax_control_results;
DROP POLICY IF EXISTS "member_select" ON workspace_tax_review_cases;
DROP POLICY IF EXISTS "member_insert" ON workspace_tax_review_cases;
DROP POLICY IF EXISTS "member_update" ON workspace_tax_review_cases;
DROP POLICY IF EXISTS "member_delete" ON workspace_tax_review_cases;
DROP POLICY IF EXISTS "member_select" ON workspace_tax_review_case_events;
DROP POLICY IF EXISTS "member_insert" ON workspace_tax_review_case_events;
DROP POLICY IF EXISTS "member_update" ON workspace_tax_review_case_events;
DROP POLICY IF EXISTS "member_delete" ON workspace_tax_review_case_events;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'admin_users'
  ) THEN
    GRANT SELECT, INSERT ON workspace_tax_control_results TO authenticated;
    GRANT SELECT, INSERT, UPDATE ON workspace_tax_review_cases TO authenticated;
    GRANT SELECT ON workspace_tax_review_case_events TO authenticated;

    GRANT USAGE, SELECT ON SEQUENCE workspace_tax_control_results_id_seq TO authenticated;
    GRANT USAGE, SELECT ON SEQUENCE workspace_tax_review_cases_id_seq TO authenticated;

    CREATE POLICY "member_select" ON workspace_tax_control_results FOR SELECT
      USING (auth.email() IN (SELECT email FROM admin_users) AND is_workspace_member(company_id));
    CREATE POLICY "member_insert" ON workspace_tax_control_results FOR INSERT
      WITH CHECK (auth.email() IN (SELECT email FROM admin_users)
        AND is_workspace_member(company_id, ARRAY['owner', 'member']));

    CREATE POLICY "member_select" ON workspace_tax_review_cases FOR SELECT
      USING (auth.email() IN (SELECT email FROM admin_users) AND is_workspace_member(company_id));
    CREATE POLICY "member_insert" ON workspace_tax_review_cases FOR INSERT
      WITH CHECK (auth.email() IN (SELECT email FROM admin_users)
        AND is_workspace_member(company_id, ARRAY['owner', 'member']));
    CREATE POLICY "member_update" ON workspace_tax_review_cases FOR UPDATE
      USING (auth.email() IN (SELECT email FROM admin_users)
        AND is_workspace_member(company_id, ARRAY['owner', 'member']))
      WITH CHECK (auth.email() IN (SELECT email FROM admin_users)
        AND is_workspace_member(company_id, ARRAY['owner', 'member']));

    CREATE POLICY "member_select" ON workspace_tax_review_case_events FOR SELECT
      USING (auth.email() IN (SELECT email FROM admin_users) AND is_workspace_member(company_id));

    RAISE NOTICE 'TI-0.4 Workspace Tax Result / Review RLS policies configured.';
  ELSE
    RAISE NOTICE 'admin_users does not exist; authenticated grants / policies skipped.';
  END IF;
END $$;

-- ============================================================
-- Validation queries
-- ============================================================

SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'workspace_tax_control_results',
    'workspace_tax_review_cases',
    'workspace_tax_review_case_events'
  )
ORDER BY tablename;

SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'workspace_tax_control_results',
    'workspace_tax_review_cases',
    'workspace_tax_review_case_events'
  )
ORDER BY tablename, cmd, policyname;

SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN (
    'workspace_tax_control_results',
    'workspace_tax_review_cases',
    'workspace_tax_review_case_events'
  )
  AND grantee IN ('anon', 'authenticated', 'PUBLIC')
ORDER BY grantee, table_name, privilege_type;

SELECT conrelid::regclass AS table_name, conname, contype
FROM pg_constraint
WHERE conrelid IN (
  'workspace_tax_control_results'::regclass,
  'workspace_tax_review_cases'::regclass,
  'workspace_tax_review_case_events'::regclass
)
ORDER BY conrelid::regclass::text, conname;

SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'workspace_tax_control_results',
    'workspace_tax_review_cases',
    'workspace_tax_review_case_events'
  )
ORDER BY tablename, indexname;

SELECT event_object_table AS table_name, trigger_name, event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table IN (
    'workspace_tax_control_results',
    'workspace_tax_review_cases',
    'workspace_tax_review_case_events'
  )
ORDER BY table_name, trigger_name, event_manipulation;

SELECT n.nspname AS schema_name, p.proname,
       p.prosecdef AS security_definer, p.proconfig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'record_workspace_tax_review_case_event';
