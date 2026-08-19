-- ============================================================
-- SUNBOO Tax Intelligence
-- TaxSource change notification event outbox
-- ============================================================
--
-- TaxSource変更レビューの発生を通知イベントとして冪等保存する。
-- 外部配信（email / Slack等）はこのOutboxとは分離する。
--
-- Lifecycle:
--   pending -> delivered
--   pending -> failed
--   failed  -> pending
--   failed  -> delivered
-- ============================================================

CREATE TABLE IF NOT EXISTS
  tax_source_change_notification_events (
    id                  BIGSERIAL   PRIMARY KEY,
    review_id           INTEGER     NOT NULL
      REFERENCES tax_source_change_reviews(id),
    event_type          TEXT        NOT NULL,
    delivery_status     TEXT        NOT NULL
      DEFAULT 'pending',
    payload             JSONB       NOT NULL,

    delivery_attempts   INTEGER     NOT NULL
      DEFAULT 0,
    last_error          TEXT,
    last_attempted_at   TIMESTAMPTZ,
    delivered_at        TIMESTAMPTZ,

    created_at          TIMESTAMPTZ NOT NULL
      DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL
      DEFAULT NOW(),

    CONSTRAINT
      uq_tax_source_change_notification_events
      UNIQUE (review_id, event_type),

    CONSTRAINT
      chk_tax_source_change_notification_event_type
      CHECK (
        event_type IN (
          'tax_source_change_review_opened'
        )
      ),

    CONSTRAINT
      chk_tax_source_change_notification_status
      CHECK (
        delivery_status IN (
          'pending',
          'delivered',
          'failed'
        )
      ),

    CONSTRAINT
      chk_tax_source_change_notification_payload
      CHECK (
        jsonb_typeof(payload) = 'object'
      ),

    CONSTRAINT
      chk_tax_source_change_notification_attempts
      CHECK (delivery_attempts >= 0),

    CONSTRAINT
      chk_tax_source_change_notification_delivery
      CHECK (
        (
          delivery_status = 'pending'
          AND delivered_at IS NULL
        )
        OR
        (
          delivery_status = 'failed'
          AND delivered_at IS NULL
          AND last_attempted_at IS NOT NULL
          AND last_error IS NOT NULL
          AND length(trim(last_error)) > 0
        )
        OR
        (
          delivery_status = 'delivered'
          AND delivered_at IS NOT NULL
          AND last_attempted_at IS NOT NULL
          AND last_error IS NULL
        )
      )
  );

CREATE INDEX IF NOT EXISTS
  idx_tax_source_change_notification_pending
  ON tax_source_change_notification_events(
    delivery_status,
    created_at
  );

CREATE INDEX IF NOT EXISTS
  idx_tax_source_change_notification_review
  ON tax_source_change_notification_events(
    review_id
  );

DROP TRIGGER IF EXISTS
  trg_tax_source_change_notification_updated_at
  ON tax_source_change_notification_events;

CREATE TRIGGER
  trg_tax_source_change_notification_updated_at
  BEFORE UPDATE
  ON tax_source_change_notification_events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Idempotent notification-event creation
-- ============================================================

CREATE OR REPLACE FUNCTION
  ensure_tax_source_change_notification_event(
    p_review_id INTEGER
  )
RETURNS TABLE (
  notification_event_id  BIGINT,
  review_id               INTEGER,
  event_type              TEXT,
  delivery_status         TEXT,
  was_created             BOOLEAN
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_review                    tax_source_change_reviews%ROWTYPE;
  v_source_title              TEXT;
  v_version_label             TEXT;
  v_content_hash              TEXT;
  v_supersedes_version_label  TEXT;
  v_supersedes_content_hash   TEXT;
  v_event_id                  BIGINT;
  v_event_type                TEXT :=
    'tax_source_change_review_opened';
  v_delivery_status           TEXT;
  v_was_created               BOOLEAN := FALSE;
  v_payload                   JSONB;
BEGIN
  SELECT r.*
  INTO v_review
  FROM tax_source_change_reviews AS r
  WHERE r.id = p_review_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'TaxSource change review % does not exist',
      p_review_id;
  END IF;

  SELECT
    s.title,
    current_version.version_label,
    current_version.content_hash,
    previous_version.version_label,
    previous_version.content_hash
  INTO
    v_source_title,
    v_version_label,
    v_content_hash,
    v_supersedes_version_label,
    v_supersedes_content_hash
  FROM tax_sources AS s
  JOIN tax_source_versions AS current_version
    ON current_version.id =
      v_review.tax_source_version_id
  JOIN tax_source_versions AS previous_version
    ON previous_version.id =
      v_review.supersedes_source_version_id
  WHERE s.id = v_review.tax_source_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'TaxSource provenance for review % is incomplete',
      p_review_id;
  END IF;

  v_payload := jsonb_build_object(
    'reviewId',
      v_review.id,
    'taxSourceId',
      v_review.tax_source_id,
    'taxSourceVersionId',
      v_review.tax_source_version_id,
    'supersedesSourceVersionId',
      v_review.supersedes_source_version_id,
    'sourceTitle',
      v_source_title,
    'versionLabel',
      v_version_label,
    'contentHash',
      v_content_hash,
    'supersedesVersionLabel',
      v_supersedes_version_label,
    'supersedesContentHash',
      v_supersedes_content_hash,
    'detectedAt',
      v_review.detected_at,
    'ruleCandidateCount',
      jsonb_array_length(
        v_review.impact_snapshot ->
          'ruleCandidates'
      ),
    'controlCandidateCount',
      jsonb_array_length(
        v_review.impact_snapshot ->
          'controlCandidates'
      )
  );

  INSERT INTO
    tax_source_change_notification_events (
      review_id,
      event_type,
      payload
    )
  VALUES (
    p_review_id,
    v_event_type,
    v_payload
  )
  ON CONFLICT (review_id, event_type)
  DO NOTHING
  RETURNING
    id,
    tax_source_change_notification_events
      .delivery_status
  INTO
    v_event_id,
    v_delivery_status;

  IF FOUND THEN
    v_was_created := TRUE;
  ELSE
    SELECT
      e.id,
      e.delivery_status
    INTO
      v_event_id,
      v_delivery_status
    FROM tax_source_change_notification_events
      AS e
    WHERE e.review_id = p_review_id
      AND e.event_type = v_event_type;
  END IF;

  RETURN QUERY
  SELECT
    v_event_id,
    p_review_id,
    v_event_type,
    v_delivery_status,
    v_was_created;
END;
$$;

-- ============================================================
-- RLS / privileges
-- ============================================================

ALTER TABLE
  tax_source_change_notification_events
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON
  tax_source_change_notification_events
  FROM PUBLIC;

REVOKE ALL ON
  tax_source_change_notification_events
  FROM anon;

REVOKE ALL ON
  tax_source_change_notification_events
  FROM authenticated;

REVOKE ALL ON SEQUENCE
  tax_source_change_notification_events_id_seq
  FROM PUBLIC;

REVOKE ALL ON SEQUENCE
  tax_source_change_notification_events_id_seq
  FROM anon;

REVOKE ALL ON SEQUENCE
  tax_source_change_notification_events_id_seq
  FROM authenticated;

REVOKE ALL ON FUNCTION
  ensure_tax_source_change_notification_event(
    INTEGER
  )
  FROM PUBLIC;

REVOKE ALL ON FUNCTION
  ensure_tax_source_change_notification_event(
    INTEGER
  )
  FROM anon;

REVOKE ALL ON FUNCTION
  ensure_tax_source_change_notification_event(
    INTEGER
  )
  FROM authenticated;

GRANT SELECT, INSERT, UPDATE ON
  tax_source_change_notification_events
  TO service_role;

GRANT USAGE, SELECT ON SEQUENCE
  tax_source_change_notification_events_id_seq
  TO service_role;

GRANT EXECUTE ON FUNCTION
  ensure_tax_source_change_notification_event(
    INTEGER
  )
  TO service_role;

DROP POLICY IF EXISTS
  "admin_select"
  ON tax_source_change_notification_events;

GRANT SELECT ON
  tax_source_change_notification_events
  TO authenticated;

CREATE POLICY "admin_select"
  ON tax_source_change_notification_events
  FOR SELECT
  TO authenticated
  USING (
    auth.email() IN (
      SELECT email
      FROM admin_users
    )
  );

-- ============================================================
-- Validation
-- ============================================================

SELECT
  p.proname,
  has_function_privilege(
    'service_role',
    p.oid,
    'EXECUTE'
  ) AS service_role_can_execute
FROM pg_proc AS p
JOIN pg_namespace AS n
  ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname =
    'ensure_tax_source_change_notification_event';

SELECT
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename =
    'tax_source_change_notification_events'
ORDER BY policyname;
