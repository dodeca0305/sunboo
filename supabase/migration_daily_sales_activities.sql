-- ============================================================
-- SUNBOO経営ナビ — 日次売上アクションの記録
-- ============================================================
-- Supabase Dashboard → SQL Editorで実行する。再実行しても安全。

CREATE TABLE IF NOT EXISTS workspace_daily_sales_activities (
  company_id     INTEGER     NOT NULL REFERENCES workspace_companies(id) ON DELETE CASCADE,
  activity_date  DATE        NOT NULL,
  target_units   INTEGER     NOT NULL DEFAULT 0 CHECK (target_units >= 0),
  actual_units   INTEGER     NOT NULL DEFAULT 0 CHECK (actual_units >= 0),
  action_plan    TEXT        NOT NULL DEFAULT '' CHECK (length(action_plan) <= 500),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, activity_date)
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
    DROP TRIGGER IF EXISTS trg_workspace_daily_sales_activities_updated_at ON workspace_daily_sales_activities;
    CREATE TRIGGER trg_workspace_daily_sales_activities_updated_at
      BEFORE UPDATE ON workspace_daily_sales_activities
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

ALTER TABLE workspace_daily_sales_activities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON workspace_daily_sales_activities FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON workspace_daily_sales_activities TO authenticated;

DROP POLICY IF EXISTS "member_select" ON workspace_daily_sales_activities;
DROP POLICY IF EXISTS "member_insert" ON workspace_daily_sales_activities;
DROP POLICY IF EXISTS "member_update" ON workspace_daily_sales_activities;
DROP POLICY IF EXISTS "member_delete" ON workspace_daily_sales_activities;

CREATE POLICY "member_select" ON workspace_daily_sales_activities FOR SELECT
  USING (auth.email() IN (SELECT email FROM admin_users) AND is_workspace_member(company_id));
CREATE POLICY "member_insert" ON workspace_daily_sales_activities FOR INSERT
  WITH CHECK (auth.email() IN (SELECT email FROM admin_users) AND is_workspace_member(company_id, ARRAY['owner', 'member']));
CREATE POLICY "member_update" ON workspace_daily_sales_activities FOR UPDATE
  USING (auth.email() IN (SELECT email FROM admin_users) AND is_workspace_member(company_id, ARRAY['owner', 'member']))
  WITH CHECK (auth.email() IN (SELECT email FROM admin_users) AND is_workspace_member(company_id, ARRAY['owner', 'member']));
CREATE POLICY "member_delete" ON workspace_daily_sales_activities FOR DELETE
  USING (auth.email() IN (SELECT email FROM admin_users) AND is_workspace_member(company_id, ARRAY['owner', 'member']));

SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'workspace_daily_sales_activities'
ORDER BY cmd;
