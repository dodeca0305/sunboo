-- ============================================================
-- SUNBOO経営ナビ — 月間売上の要因分解
-- ============================================================
-- Supabase Dashboard → SQL Editorで実行する。再実行しても安全。

ALTER TABLE workspace_monthly_sales
  ADD COLUMN IF NOT EXISTS revenue_model TEXT NOT NULL DEFAULT 'sales_funnel',
  ADD COLUMN IF NOT EXISTS meeting_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conversion_rate INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS average_contract_value BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customer_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchase_frequency INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS average_order_value BIGINT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspace_monthly_sales_revenue_model_check') THEN
    ALTER TABLE workspace_monthly_sales ADD CONSTRAINT workspace_monthly_sales_revenue_model_check
      CHECK (revenue_model IN ('sales_funnel', 'customer_repeat'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspace_monthly_sales_driver_values_check') THEN
    ALTER TABLE workspace_monthly_sales ADD CONSTRAINT workspace_monthly_sales_driver_values_check
      CHECK (
        meeting_count >= 0 AND conversion_rate BETWEEN 0 AND 100
        AND average_contract_value >= 0 AND customer_count >= 0
        AND purchase_frequency >= 0 AND average_order_value >= 0
      );
  END IF;
END $$;

SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'workspace_monthly_sales'
  AND column_name IN (
    'revenue_model', 'meeting_count', 'conversion_rate', 'average_contract_value',
    'customer_count', 'purchase_frequency', 'average_order_value'
  )
ORDER BY ordinal_position;
