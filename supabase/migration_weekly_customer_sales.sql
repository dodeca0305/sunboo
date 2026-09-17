-- ============================================================
-- SUNBOO経営ナビ — 店舗型の週間売上実績
-- ============================================================
-- Supabase Dashboard → SQL Editorで実行する。再実行しても安全。

ALTER TABLE workspace_weekly_sales_activities
  ADD COLUMN IF NOT EXISTS target_customers INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_customers INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_purchases INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_revenue BIGINT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspace_weekly_sales_customer_values_check') THEN
    ALTER TABLE workspace_weekly_sales_activities
      ADD CONSTRAINT workspace_weekly_sales_customer_values_check
      CHECK (
        target_customers >= 0 AND actual_customers >= 0
        AND actual_purchases >= 0 AND actual_revenue >= 0
      );
  END IF;
END $$;

SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'workspace_weekly_sales_activities'
  AND column_name IN ('target_customers', 'actual_customers', 'actual_purchases', 'actual_revenue')
ORDER BY ordinal_position;
