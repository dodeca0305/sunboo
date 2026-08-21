-- ============================================================
-- SUNBOO Tax Intelligence
-- TaxSource notification email delivery lifecycle
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE
  tax_source_change_notification_events
ADD COLUMN IF NOT EXISTS
  claim_token UUID;

ALTER TABLE
  tax_source_change_notification_events
ADD COLUMN IF NOT EXISTS
  claimed_at TIMESTAMPTZ;

ALTER TABLE
  tax_source_change_notification_events
ADD COLUMN IF NOT EXISTS
  delivery_recipient TEXT;

ALTER TABLE
  tax_source_change_notification_events
ADD COLUMN IF NOT EXISTS
  provider_message_id TEXT;

ALTER TABLE
  tax_source_change_notification_events
DROP CONSTRAINT IF EXISTS
  chk_tax_source_change_notification_status;

ALTER TABLE
  tax_source_change_notification_events
ADD CONSTRAINT
  chk_tax_source_change_notification_status
  CHECK (
    delivery_status IN (
      'pending',
      'processing',
      'delivered',
      'failed'
    )
  );

ALTER TABLE
  tax_source_change_notification_events
DROP CONSTRAINT IF EXISTS
  chk_tax_source_change_notification_delivery;

ALTER TABLE
  tax_source_change_notification_events
ADD CONSTRAINT
  chk_tax_source_change_notification_delivery
  CHECK (
    (
      delivery_status = 'pending'
      AND claim_token IS NULL
      AND claimed_at IS NULL
      AND delivered_at IS NULL
    )
    OR
    (
      delivery_status = 'processing'
      AND claim_token IS NOT NULL
      AND claimed_at IS NOT NULL
      AND last_attempted_at IS NOT NULL
      AND delivered_at IS NULL
      AND last_error IS NULL
    )
    OR
    (
      delivery_status = 'failed'
      AND claim_token IS NULL
      AND claimed_at IS NULL
      AND delivered_at IS NULL
      AND last_attempted_at IS NOT NULL
      AND last_error IS NOT NULL
      AND length(trim(last_error)) > 0
    )
    OR
    (
      delivery_status = 'delivered'
      AND claim_token IS NULL
      AND claimed_at IS NULL
      AND delivered_at IS NOT NULL
      AND last_attempted_at IS NOT NULL
      AND last_error IS NULL
      AND delivery_recipient IS NOT NULL
      AND length(trim(delivery_recipient)) > 0
      AND provider_message_id IS NOT NULL
      AND length(trim(provider_message_id)) > 0
    )
  );

CREATE INDEX IF NOT EXISTS
  idx_tax_source_change_notification_claim
  ON tax_source_change_notification_events(
    delivery_status,
    delivery_attempts,
    last_attempted_at,
    claimed_at,
    created_at
  );

-- ============================================================
-- Atomic claim with stale-lease recovery
-- ============================================================

CREATE OR REPLACE FUNCTION
  claim_tax_source_change_notification_event(
    p_lease_seconds INTEGER DEFAULT 300
  )
RETURNS TABLE (
  notification_event_id BIGINT,
  review_id              INTEGER,
  event_type             TEXT,
  payload                JSONB,
  delivery_attempts      INTEGER,
  claim_token            UUID
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_event_id   BIGINT;
  v_claim_token UUID := gen_random_uuid();
BEGIN
  IF p_lease_seconds < 30
    OR p_lease_seconds > 3600
  THEN
    RAISE EXCEPTION
      'lease seconds must be between 30 and 3600';
  END IF;

  SELECT e.id
  INTO v_event_id
  FROM tax_source_change_notification_events
    AS e
  WHERE
    e.delivery_status = 'pending'
    OR (
      e.delivery_status = 'failed'
      AND e.delivery_attempts < 5
      AND e.last_attempted_at <=
        NOW() - INTERVAL '1 hour'
    )
    OR (
      e.delivery_status = 'processing'
      AND e.delivery_attempts < 5
      AND e.claimed_at <
        NOW() - make_interval(
          secs => p_lease_seconds
        )
    )
  ORDER BY e.created_at, e.id
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_event_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE tax_source_change_notification_events
    AS e
  SET
    delivery_status = 'processing',
    delivery_attempts =
      e.delivery_attempts + 1,
    last_attempted_at = NOW(),
    last_error = NULL,
    claim_token = v_claim_token,
    claimed_at = NOW()
  WHERE e.id = v_event_id
  RETURNING
    e.id,
    e.review_id,
    e.event_type,
    e.payload,
    e.delivery_attempts,
    e.claim_token;
END;
$$;

-- ============================================================
-- Complete delivery
-- ============================================================

CREATE OR REPLACE FUNCTION
  complete_tax_source_change_notification_event(
    p_notification_event_id BIGINT,
    p_claim_token            UUID,
    p_delivery_recipient     TEXT,
    p_provider_message_id    TEXT
  )
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  IF p_delivery_recipient IS NULL
    OR length(trim(p_delivery_recipient)) = 0
    OR p_provider_message_id IS NULL
    OR length(trim(p_provider_message_id)) = 0
  THEN
    RAISE EXCEPTION
      'delivery recipient and provider message id are required';
  END IF;

  UPDATE tax_source_change_notification_events
  SET
    delivery_status = 'delivered',
    delivery_recipient =
      trim(p_delivery_recipient),
    provider_message_id =
      trim(p_provider_message_id),
    delivered_at = NOW(),
    last_error = NULL,
    claim_token = NULL,
    claimed_at = NULL
  WHERE id = p_notification_event_id
    AND delivery_status = 'processing'
    AND claim_token = p_claim_token;

  GET DIAGNOSTICS
    v_updated_count = ROW_COUNT;

  RETURN v_updated_count = 1;
END;
$$;

-- ============================================================
-- Record delivery failure
-- ============================================================

CREATE OR REPLACE FUNCTION
  fail_tax_source_change_notification_event(
    p_notification_event_id BIGINT,
    p_claim_token            UUID,
    p_error                  TEXT
  )
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  IF p_error IS NULL
    OR length(trim(p_error)) = 0
  THEN
    RAISE EXCEPTION
      'delivery error is required';
  END IF;

  UPDATE tax_source_change_notification_events
  SET
    delivery_status = 'failed',
    last_error =
      left(trim(p_error), 1000),
    delivered_at = NULL,
    delivery_recipient = NULL,
    provider_message_id = NULL,
    claim_token = NULL,
    claimed_at = NULL
  WHERE id = p_notification_event_id
    AND delivery_status = 'processing'
    AND claim_token = p_claim_token;

  GET DIAGNOSTICS
    v_updated_count = ROW_COUNT;

  RETURN v_updated_count = 1;
END;
$$;

-- ============================================================
-- Privileges
-- ============================================================

REVOKE ALL ON FUNCTION
  claim_tax_source_change_notification_event(
    INTEGER
  )
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION
  complete_tax_source_change_notification_event(
    BIGINT,
    UUID,
    TEXT,
    TEXT
  )
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION
  fail_tax_source_change_notification_event(
    BIGINT,
    UUID,
    TEXT
  )
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  claim_tax_source_change_notification_event(
    INTEGER
  )
  TO service_role;

GRANT EXECUTE ON FUNCTION
  complete_tax_source_change_notification_event(
    BIGINT,
    UUID,
    TEXT,
    TEXT
  )
  TO service_role;

GRANT EXECUTE ON FUNCTION
  fail_tax_source_change_notification_event(
    BIGINT,
    UUID,
    TEXT
  )
  TO service_role;

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
  AND p.proname IN (
    'claim_tax_source_change_notification_event',
    'complete_tax_source_change_notification_event',
    'fail_tax_source_change_notification_event'
  )
ORDER BY p.proname;
