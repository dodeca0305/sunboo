-- ============================================================
-- SUNBOO Tax Intelligence
-- Atomic TaxSourceVersion ingestion
-- ============================================================
--
-- 同一TaxSourceへの取り込みを行ロックで直列化し、
-- 重複防止とsupersedes_version_idの一貫性を保証する。
-- SECURITY INVOKERにより既存RLSをそのまま適用する。
-- ============================================================

CREATE OR REPLACE FUNCTION ingest_tax_source_version(
  p_provider           TEXT,
  p_canonical_locator  TEXT,
  p_version_label      TEXT,
  p_content_hash       TEXT,
  p_published_at       DATE,
  p_effective_from     DATE,
  p_effective_to       DATE,
  p_observed_at        TIMESTAMPTZ,
  p_retrieved_at       TIMESTAMPTZ,
  p_raw_reference      TEXT,
  p_normalized_text    TEXT
)
RETURNS TABLE (
  tax_source_version_id   INT,
  tax_source_id           INT,
  content_hash            TEXT,
  supersedes_version_id   INT,
  was_inserted            BOOLEAN
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source_id            INT;
  v_existing_version_id  INT;
  v_existing_supersedes  INT;
  v_previous_version_id  INT;
  v_inserted_version_id  INT;
BEGIN
  IF p_provider IS NULL OR btrim(p_provider) = '' THEN
    RAISE EXCEPTION 'provider must not be empty';
  END IF;

  IF p_canonical_locator IS NULL
    OR btrim(p_canonical_locator) = ''
  THEN
    RAISE EXCEPTION 'canonical_locator must not be empty';
  END IF;

  IF p_content_hash IS NULL
    OR p_content_hash !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION
      'content_hash must be a lowercase SHA-256 hex digest';
  END IF;

  IF p_normalized_text IS NULL
    OR p_normalized_text = ''
  THEN
    RAISE EXCEPTION 'normalized_text must not be empty';
  END IF;

  IF p_observed_at IS NULL OR p_retrieved_at IS NULL THEN
    RAISE EXCEPTION
      'observed_at and retrieved_at must not be null';
  END IF;

  IF p_effective_to IS NOT NULL
    AND p_effective_from IS NOT NULL
    AND p_effective_to < p_effective_from
  THEN
    RAISE EXCEPTION
      'effective_to must not be before effective_from';
  END IF;

  SELECT s.id
  INTO v_source_id
  FROM tax_sources AS s
  WHERE s.provider = p_provider
    AND s.canonical_locator = p_canonical_locator
    AND s.is_active = TRUE
  FOR UPDATE;

  IF v_source_id IS NULL THEN
    RAISE EXCEPTION
      'active TaxSource not found: provider=%, canonical_locator=%',
      p_provider,
      p_canonical_locator;
  END IF;

  SELECT
    v.id,
    v.supersedes_version_id
  INTO
    v_existing_version_id,
    v_existing_supersedes
  FROM tax_source_versions AS v
  WHERE v.tax_source_id = v_source_id
    AND v.content_hash = p_content_hash;

  IF v_existing_version_id IS NOT NULL THEN
    RETURN QUERY
    SELECT
      v_existing_version_id,
      v_source_id,
      p_content_hash,
      v_existing_supersedes,
      FALSE;

    RETURN;
  END IF;

  SELECT v.id
  INTO v_previous_version_id
  FROM tax_source_versions AS v
  WHERE v.tax_source_id = v_source_id
  ORDER BY
    v.retrieved_at DESC,
    v.id DESC
  LIMIT 1;

  INSERT INTO tax_source_versions (
    tax_source_id,
    version_label,
    content_hash,
    published_at,
    effective_from,
    effective_to,
    observed_at,
    retrieved_at,
    supersedes_version_id,
    raw_reference,
    normalized_text
  )
  VALUES (
    v_source_id,
    p_version_label,
    p_content_hash,
    p_published_at,
    p_effective_from,
    p_effective_to,
    p_observed_at,
    p_retrieved_at,
    v_previous_version_id,
    p_raw_reference,
    p_normalized_text
  )
  RETURNING id
  INTO v_inserted_version_id;

  RETURN QUERY
  SELECT
    v_inserted_version_id,
    v_source_id,
    p_content_hash,
    v_previous_version_id,
    TRUE;
END;
$$;

REVOKE ALL ON FUNCTION ingest_tax_source_version(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  DATE,
  DATE,
  DATE,
  TIMESTAMPTZ,
  TIMESTAMPTZ,
  TEXT,
  TEXT
) FROM PUBLIC;

REVOKE ALL ON FUNCTION ingest_tax_source_version(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  DATE,
  DATE,
  DATE,
  TIMESTAMPTZ,
  TIMESTAMPTZ,
  TEXT,
  TEXT
) FROM anon;

GRANT EXECUTE ON FUNCTION ingest_tax_source_version(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  DATE,
  DATE,
  DATE,
  TIMESTAMPTZ,
  TIMESTAMPTZ,
  TEXT,
  TEXT
) TO authenticated;

-- ============================================================
-- Validation
-- ============================================================

SELECT
  p.proname,
  p.prosecdef AS security_definer,
  p.provolatile,
  has_function_privilege(
    'anon',
    p.oid,
    'EXECUTE'
  ) AS anon_can_execute,
  has_function_privilege(
    'authenticated',
    p.oid,
    'EXECUTE'
  ) AS authenticated_can_execute
FROM pg_proc AS p
JOIN pg_namespace AS n
  ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'ingest_tax_source_version';
