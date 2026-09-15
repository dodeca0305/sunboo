-- ============================================================
-- SUNBOO経営ナビ — 今後必要な書類の準備状況
-- ============================================================
-- Supabase Dashboard → SQL Editorで実行する。再実行しても安全。

CREATE TABLE IF NOT EXISTS workspace_required_document_statuses (
  company_id    INTEGER     NOT NULL REFERENCES workspace_companies(id) ON DELETE CASCADE,
  document_name TEXT        NOT NULL CHECK (length(trim(document_name)) > 0),
  status        TEXT        NOT NULL DEFAULT 'not_ready'
                  CHECK (status IN ('not_ready', 'in_progress', 'ready')),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, document_name)
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
    DROP TRIGGER IF EXISTS trg_workspace_required_document_statuses_updated_at
      ON workspace_required_document_statuses;
    CREATE TRIGGER trg_workspace_required_document_statuses_updated_at
      BEFORE UPDATE ON workspace_required_document_statuses
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

ALTER TABLE workspace_required_document_statuses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON workspace_required_document_statuses FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON workspace_required_document_statuses TO authenticated;

DROP POLICY IF EXISTS "member_select" ON workspace_required_document_statuses;
DROP POLICY IF EXISTS "member_insert" ON workspace_required_document_statuses;
DROP POLICY IF EXISTS "member_update" ON workspace_required_document_statuses;
DROP POLICY IF EXISTS "member_delete" ON workspace_required_document_statuses;

CREATE POLICY "member_select" ON workspace_required_document_statuses FOR SELECT
  USING (auth.email() IN (SELECT email FROM admin_users) AND is_workspace_member(company_id));

CREATE POLICY "member_insert" ON workspace_required_document_statuses FOR INSERT
  WITH CHECK (
    auth.email() IN (SELECT email FROM admin_users)
    AND is_workspace_member(company_id, ARRAY['owner', 'member'])
  );

CREATE POLICY "member_update" ON workspace_required_document_statuses FOR UPDATE
  USING (
    auth.email() IN (SELECT email FROM admin_users)
    AND is_workspace_member(company_id, ARRAY['owner', 'member'])
  )
  WITH CHECK (
    auth.email() IN (SELECT email FROM admin_users)
    AND is_workspace_member(company_id, ARRAY['owner', 'member'])
  );

CREATE POLICY "member_delete" ON workspace_required_document_statuses FOR DELETE
  USING (
    auth.email() IN (SELECT email FROM admin_users)
    AND is_workspace_member(company_id, ARRAY['owner', 'member'])
  );

SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'workspace_required_document_statuses'
ORDER BY cmd;
