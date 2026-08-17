-- ============================================================
-- SUNBOO Tax Intelligence
-- Scheduled monitoring service-role privileges
-- ============================================================
--
-- Vercel Cronから使用するSupabase secret/service-role clientへ、
-- TaxSource監視に必要な2つのRPC実行権限だけを明示付与する。
--
-- service_roleはData API上でRLSを迂回できるが、
-- PUBLICから剥奪した関数EXECUTE権限は別途必要。
-- ============================================================

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
) TO service_role;

GRANT EXECUTE ON FUNCTION
  ensure_tax_source_change_review(INTEGER, JSONB)
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
    'ingest_tax_source_version',
    'ensure_tax_source_change_review'
  )
ORDER BY p.proname;
