-- ============================================================
-- SUNBOO経営ナビ — 日次売上アクションの成果・振り返り
-- ============================================================
-- Supabase Dashboard → SQL Editorで実行する。再実行しても安全。

ALTER TABLE workspace_daily_sales_activities
  ADD COLUMN IF NOT EXISTS outcome_review TEXT NOT NULL DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'workspace_daily_sales_activities_outcome_review_length'
      AND conrelid = 'workspace_daily_sales_activities'::regclass
  ) THEN
    ALTER TABLE workspace_daily_sales_activities
      ADD CONSTRAINT workspace_daily_sales_activities_outcome_review_length
      CHECK (length(outcome_review) <= 500);
  END IF;
END $$;

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'workspace_daily_sales_activities'
  AND column_name = 'outcome_review';
