-- ============================================================
-- SUNBOO経営ナビ — 月次資金繰り
-- ============================================================
-- Supabase Dashboard → SQL Editorで実行する。再実行しても安全。

ALTER TABLE workspace_monthly_sales
  ADD COLUMN IF NOT EXISTS cash_balance BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expected_cash_inflows BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expected_cash_outflows BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS planned_tax_payments BIGINT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workspace_monthly_sales_cash_flow_values_nonnegative'
  ) THEN
    ALTER TABLE workspace_monthly_sales
      ADD CONSTRAINT workspace_monthly_sales_cash_flow_values_nonnegative
      CHECK (
        cash_balance >= 0
        AND expected_cash_inflows >= 0
        AND expected_cash_outflows >= 0
        AND planned_tax_payments >= 0
      );
  END IF;
END $$;

SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'workspace_monthly_sales'
  AND column_name IN (
    'cash_balance',
    'expected_cash_inflows',
    'expected_cash_outflows',
    'planned_tax_payments'
  )
ORDER BY ordinal_position;
