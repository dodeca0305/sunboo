-- ============================================================
-- SUNBOO経営ナビ — ロードマップ納税予定と資金繰りの連携
-- ============================================================
-- Supabase Dashboard → SQL Editorで実行する。再実行しても安全。

CREATE TABLE IF NOT EXISTS workspace_tax_payment_plans (
  company_id   INTEGER     NOT NULL REFERENCES workspace_companies(id) ON DELETE CASCADE,
  procedure_id INTEGER     NOT NULL REFERENCES procedures(id),
  due_date     DATE        NOT NULL,
  amount       BIGINT      NOT NULL DEFAULT 0 CHECK (amount >= 0),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, procedure_id, due_date)
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
    DROP TRIGGER IF EXISTS trg_workspace_tax_payment_plans_updated_at ON workspace_tax_payment_plans;
    CREATE TRIGGER trg_workspace_tax_payment_plans_updated_at
      BEFORE UPDATE ON workspace_tax_payment_plans
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

ALTER TABLE workspace_tax_payment_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON workspace_tax_payment_plans FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON workspace_tax_payment_plans TO authenticated;

DROP POLICY IF EXISTS "member_select" ON workspace_tax_payment_plans;
DROP POLICY IF EXISTS "member_insert" ON workspace_tax_payment_plans;
DROP POLICY IF EXISTS "member_update" ON workspace_tax_payment_plans;
DROP POLICY IF EXISTS "member_delete" ON workspace_tax_payment_plans;

CREATE POLICY "member_select" ON workspace_tax_payment_plans FOR SELECT
  USING (auth.email() IN (SELECT email FROM admin_users) AND is_workspace_member(company_id));
CREATE POLICY "member_insert" ON workspace_tax_payment_plans FOR INSERT
  WITH CHECK (auth.email() IN (SELECT email FROM admin_users) AND is_workspace_member(company_id, ARRAY['owner', 'member']));
CREATE POLICY "member_update" ON workspace_tax_payment_plans FOR UPDATE
  USING (auth.email() IN (SELECT email FROM admin_users) AND is_workspace_member(company_id, ARRAY['owner', 'member']))
  WITH CHECK (auth.email() IN (SELECT email FROM admin_users) AND is_workspace_member(company_id, ARRAY['owner', 'member']));
CREATE POLICY "member_delete" ON workspace_tax_payment_plans FOR DELETE
  USING (auth.email() IN (SELECT email FROM admin_users) AND is_workspace_member(company_id, ARRAY['owner', 'member']));

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'workspace_tax_payment_plans'
ORDER BY ordinal_position;
