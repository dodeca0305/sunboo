-- Only replace the approved existing function. No tables, columns or ACL changes.
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
  v_execution_id uuid;
  v_metadata jsonb;
  v_request jsonb;
  v_existing public.workspace_tax_control_results%ROWTYPE;
  v_matches integer;
  v_observed jsonb;
BEGIN
  -- Keep INVOKER/RLS and the existing ACL. Check write eligibility even on replay.
  IF auth.uid() IS NULL OR COALESCE((auth.jwt()->>'is_anonymous')::boolean, false)
     OR NOT EXISTS (SELECT 1 FROM public.admin_users WHERE email = auth.email())
     OR public.is_workspace_member(p_company_id, ARRAY['owner', 'member']) IS NOT TRUE THEN
    RAISE EXCEPTION 'tax execution permission denied' USING ERRCODE = '42501';
  END IF;
  -- A new statement snapshot after the lock is required for concurrent replay.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'tax execution requires read committed isolation';
  END IF;
  v_metadata := p_observed_inputs->'_sunboo_execution';
  IF jsonb_typeof(v_metadata) IS DISTINCT FROM 'object'
     OR jsonb_typeof(v_metadata->'inputSnapshot') IS DISTINCT FROM 'object'
     OR (v_metadata->>'id') IS NULL
     OR (v_metadata->>'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR v_metadata->'intent'->>'companyId' IS DISTINCT FROM p_company_id::text
     OR v_metadata->'intent'->>'taxControlId' IS DISTINCT FROM p_tax_control_id::text
     OR v_metadata->'intent'->>'asOfDate' IS DISTINCT FROM p_as_of_date::text
     OR v_metadata->'intent'->>'liquidationResidualAssetsCase' IS NULL
     OR v_metadata->'intent'->>'liquidationResidualAssetsCase' NOT IN ('unknown','applicable','not_applicable') THEN
    RAISE EXCEPTION 'valid company-bound execution ID and intent required';
  END IF;
  v_execution_id := (v_metadata->>'id')::uuid;
  v_observed := p_observed_inputs - '_sunboo_execution';
  v_request := jsonb_build_object(
    'companyId', p_company_id, 'taxControlId', p_tax_control_id,
    'asOfDate', p_as_of_date, 'applicable', p_applicable, 'status', p_status,
    'reasonCode', p_reason_code, 'reasonSummary', p_reason_summary,
    'observedInputs', v_observed, 'sourceVersionSnapshot', p_source_version_snapshot,
    'evaluatorVersion', p_evaluator_version,
    'reviewTitle', p_review_title, 'reviewIssueSummary', p_review_issue_summary,
    'intent', v_metadata->'intent', 'inputSnapshot', v_metadata->'inputSnapshot');
  -- Hash collisions only serialize unrelated requests; equality uses the complete UUID.
  PERFORM pg_advisory_xact_lock(hashtextextended('sunboo-tax:' || p_company_id::text || ':' || v_execution_id::text, 0));
  SELECT count(*) INTO v_matches FROM public.workspace_tax_control_results r
    WHERE r.company_id = p_company_id
      AND r.observed_inputs->'_sunboo_execution'->>'id' = v_execution_id::text;
  IF v_matches > 1 THEN RAISE EXCEPTION 'duplicate execution history'; END IF;
  IF v_matches = 1 THEN
    SELECT r.* INTO STRICT v_existing FROM public.workspace_tax_control_results r
      WHERE r.company_id = p_company_id
        AND r.observed_inputs->'_sunboo_execution'->>'id' = v_execution_id::text;
    IF v_existing.observed_inputs->'_sunboo_execution'->'request' IS DISTINCT FROM v_request THEN
      RAISE EXCEPTION 'execution ID conflicts with different input' USING ERRCODE = '22023';
    END IF;
    SELECT c.id INTO v_review_case_id FROM public.workspace_tax_review_cases c
      WHERE c.company_id = p_company_id AND c.control_result_id = v_existing.id;
    IF (p_applicable AND p_status IN ('review','unknown')) IS DISTINCT FROM (v_review_case_id IS NOT NULL) THEN
      RAISE EXCEPTION 'incomplete execution history';
    END IF;
    RETURN QUERY SELECT v_existing.id, v_review_case_id;
    RETURN;
  END IF;
  IF p_applicable IS NULL OR (p_applicable AND p_status IS NULL) THEN
    RAISE EXCEPTION 'valid applicable/status pair required';
  END IF;
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
    v_observed || jsonb_build_object('_sunboo_execution', jsonb_build_object('id', v_execution_id, 'intent', v_metadata->'intent', 'request', v_request)),
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
