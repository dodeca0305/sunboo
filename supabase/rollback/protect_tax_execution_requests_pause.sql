-- Safe recovery: preserve ACL/data and pause the SAME function. Do not replay legacy SQL.
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
BEGIN
  RAISE EXCEPTION 'Tax execution is temporarily paused for safe recovery';
END;
$$;
