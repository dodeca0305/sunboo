-- ============================================================
-- SUNBOO経営ナビ — 月間粗利益目標・実績
-- ============================================================
-- Supabase Dashboard → SQL Editorで実行する。再実行しても安全。

ALTER TABLE workspace_monthly_sales
  ADD COLUMN IF NOT EXISTS target_gross_profit BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_cost_of_sales BIGINT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workspace_monthly_sales_gross_profit_values_nonnegative'
  ) THEN
    ALTER TABLE workspace_monthly_sales
      ADD CONSTRAINT workspace_monthly_sales_gross_profit_values_nonnegative
      CHECK (target_gross_profit >= 0 AND actual_cost_of_sales >= 0);
  END IF;
END $$;

SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'workspace_monthly_sales'
  AND column_name IN ('target_gross_profit', 'actual_cost_of_sales')
ORDER BY ordinal_position;
