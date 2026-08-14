-- ============================================================
-- SUNBOO Tax Intelligence — TI-0.9
-- Atomic ControlResult / ReviewCase persistence
--
-- Production evaluatorの1回の評価結果を、
-- ControlResultと必要なReviewCaseへ同一transactionで保存する。
--
-- SECURITY INVOKERのままにし、既存RLSを迂回しない。
-- ============================================================

CREATE OR REPLACE FUNCTION persist_workspace_tax_control_evaluation(
  p_company_id               INTEGER,
  p_tax_control_id           INTEGER,
  p_as_of_date               DATE,
  p_applicable               BOOLEAN,
  p_status                   TEXT,
  p_reason_code              TEXT,
  p_reason_summary           TEXT,
  p_observed_inputs          JSONB,
  p_source_version_snapshot  JSONB,
  p_evaluator_version        TEXT,
  p_review_title             TEXT DEFAULT NULL,
  p_review_issue_summary     TEXT DEFAULT NULL
)
RETURNS TABLE (
  control_result_id INTEGER,
  review_case_id    INTEGER
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_control_result_id INTEGER;
  v_review_case_id    INTEGER := NULL;
  v_requires_review   BOOLEAN;
BEGIN
  v_requires_review :=
    p_applicable
    AND p_status IN ('review', 'unknown');

  IF v_requires_review THEN
    IF NULLIF(TRIM(p_review_title), '') IS NULL THEN
      RAISE EXCEPTION
        'review title is required for REVIEW or UNKNOWN evaluation';
    END IF;

    IF NULLIF(TRIM(p_review_issue_summary), '') IS NULL THEN
      RAISE EXCEPTION
        'review issue summary is required for REVIEW or UNKNOWN evaluation';
    END IF;
  ELSE
    IF p_review_title IS NOT NULL
       OR p_review_issue_summary IS NOT NULL
    THEN
      RAISE EXCEPTION
        'review payload is only allowed for REVIEW or UNKNOWN evaluation';
    END IF;
  END IF;

  INSERT INTO workspace_tax_control_results (
    company_id,
    tax_control_id,
    as_of_date,
    applicable,
    status,
    reason_code,
    reason_summary,
    observed_inputs,
    source_version_snapshot,
    evaluator_version
  )
  VALUES (
    p_company_id,
    p_tax_control_id,
    p_as_of_date,
    p_applicable,
    p_status,
    p_reason_code,
    p_reason_summary,
    COALESCE(p_observed_inputs, '{}'::jsonb),
    COALESCE(p_source_version_snapshot, '[]'::jsonb),
    p_evaluator_version
  )
  RETURNING id
    INTO v_control_result_id;

  IF v_requires_review THEN
    INSERT INTO workspace_tax_review_cases (
      company_id,
      control_result_id,
      status,
      title,
      issue_summary
    )
    VALUES (
      p_company_id,
      v_control_result_id,
      'open',
      p_review_title,
      p_review_issue_summary
    )
    RETURNING id
      INTO v_review_case_id;
  END IF;

  RETURN QUERY
  SELECT
    v_control_result_id,
    v_review_case_id;
END;
$$;

REVOKE ALL
  ON FUNCTION persist_workspace_tax_control_evaluation(
    INTEGER,
    INTEGER,
    DATE,
    BOOLEAN,
    TEXT,
    TEXT,
    TEXT,
    JSONB,
    JSONB,
    TEXT,
    TEXT,
    TEXT
  )
  FROM PUBLIC;

REVOKE ALL
  ON FUNCTION persist_workspace_tax_control_evaluation(
    INTEGER,
    INTEGER,
    DATE,
    BOOLEAN,
    TEXT,
    TEXT,
    TEXT,
    JSONB,
    JSONB,
    TEXT,
    TEXT,
    TEXT
  )
  FROM anon;

GRANT EXECUTE
  ON FUNCTION persist_workspace_tax_control_evaluation(
    INTEGER,
    INTEGER,
    DATE,
    BOOLEAN,
    TEXT,
    TEXT,
    TEXT,
    JSONB,
    JSONB,
    TEXT,
    TEXT,
    TEXT
  )
  TO authenticated;
