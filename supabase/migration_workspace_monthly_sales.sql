-- ============================================================
-- SUNBOO経営ナビ — 月間売上目標・実績
-- ============================================================
-- Supabase Dashboard → SQL Editorで実行する。再実行しても安全。

CREATE TABLE IF NOT EXISTS workspace_monthly_sales (
  company_id       INTEGER     NOT NULL REFERENCES workspace_companies(id) ON DELETE CASCADE,
  year_month       DATE        NOT NULL CHECK (EXTRACT(DAY FROM year_month) = 1),
  target_revenue   BIGINT      NOT NULL CHECK (target_revenue >= 0),
  actual_revenue   BIGINT      NOT NULL DEFAULT 0 CHECK (actual_revenue >= 0),
  action_goal      TEXT        NOT NULL DEFAULT '' CHECK (length(action_goal) <= 500),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, year_month)
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
    DROP TRIGGER IF EXISTS trg_workspace_monthly_sales_updated_at ON workspace_monthly_sales;
    CREATE TRIGGER trg_workspace_monthly_sales_updated_at
      BEFORE UPDATE ON workspace_monthly_sales
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

ALTER TABLE workspace_monthly_sales ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON workspace_monthly_sales FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON workspace_monthly_sales TO authenticated;

DROP POLICY IF EXISTS "member_select" ON workspace_monthly_sales;
DROP POLICY IF EXISTS "member_insert" ON workspace_monthly_sales;
DROP POLICY IF EXISTS "member_update" ON workspace_monthly_sales;
DROP POLICY IF EXISTS "member_delete" ON workspace_monthly_sales;

CREATE POLICY "member_select" ON workspace_monthly_sales FOR SELECT
  USING (auth.email() IN (SELECT email FROM admin_users) AND is_workspace_member(company_id));
CREATE POLICY "member_insert" ON workspace_monthly_sales FOR INSERT
  WITH CHECK (auth.email() IN (SELECT email FROM admin_users) AND is_workspace_member(company_id, ARRAY['owner', 'member']));
CREATE POLICY "member_update" ON workspace_monthly_sales FOR UPDATE
  USING (auth.email() IN (SELECT email FROM admin_users) AND is_workspace_member(company_id, ARRAY['owner', 'member']))
  WITH CHECK (auth.email() IN (SELECT email FROM admin_users) AND is_workspace_member(company_id, ARRAY['owner', 'member']));
CREATE POLICY "member_delete" ON workspace_monthly_sales FOR DELETE
  USING (auth.email() IN (SELECT email FROM admin_users) AND is_workspace_member(company_id, ARRAY['owner', 'member']));

SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'workspace_monthly_sales'
ORDER BY cmd;
