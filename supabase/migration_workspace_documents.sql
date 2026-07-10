-- ============================================================
-- SUNBOO経営ナビ — Workspace Documents MVP（Sprint 26）
-- ============================================================
-- Supabase ダッシュボード → SQL Editor で実行してください。
-- 再実行しても安全（IF NOT EXISTS / DROP POLICY IF EXISTS / CREATE OR REPLACE を使用）。
-- 前提：migration_workspace_mvp.sql（Sprint22.4）が実行済みであること
--       （本ファイルは既存の workspace_companies・admin_users・update_updated_at() を参照する）。
--
-- 本SprintはMVPのため、ファイルアップロードは実装しない（メタデータ＝状態管理のみ）。
-- 書類の種類（定款・登記簿謄本等）は今回は固定5種とし、別テーブル（document_types等）は
-- 作らずアプリコード側（src/lib/workspaceDocumentStatus.ts）で列挙する
-- （workspace_procedure_statuses・WORKSPACE_PROCEDURE_STATUSESと同じ設計判断。
-- 種類が増減する場合はCHECK制約とアプリコードの両方を更新する）。
--
-- ステータスは3値（not_registered/registered/needs_update）とする。
-- 主キーは (company_id, document_type) とし、書類の種類ごとに1つの状態を持つ。
-- ============================================================

CREATE TABLE IF NOT EXISTS workspace_documents (
  company_id    INTEGER     NOT NULL REFERENCES workspace_companies(id) ON DELETE CASCADE,
  document_type TEXT        NOT NULL
                  CHECK (document_type IN (
                    'articles_of_incorporation',
                    'certificate_of_registered_matters',
                    'corporate_tax_return',
                    'consumption_tax_return',
                    'withholding_tax_payment_slip'
                  )),
  status        TEXT        NOT NULL DEFAULT 'not_registered'
                  CHECK (status IN ('not_registered', 'registered', 'needs_update')),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, document_type)
);

-- updated_at 自動更新トリガー（schema.sql の update_updated_at() を再利用。
-- 存在しない環境でもテーブル作成自体は失敗しないようガードする。既存migrationと同じパターン）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
    DROP TRIGGER IF EXISTS trg_workspace_documents_updated_at ON workspace_documents;
    CREATE TRIGGER trg_workspace_documents_updated_at
      BEFORE UPDATE ON workspace_documents
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    RAISE NOTICE 'workspace_documents の updated_at 自動更新トリガーを設定しました。';
  ELSE
    RAISE NOTICE 'update_updated_at() 関数が存在しないため、トリガー設定をスキップしました。';
  END IF;
END $$;

-- ── 権限（GRANT + RLS + policy）─────────────────────────────────
-- 既存workspace系テーブルと同じ方針：anonには一切GRANTしない（REVOKEを明示的に書く。多層防御）。
-- 本MVPでは経営者向け共有画面（/share/[token]）に書類は出さないため、anon向けのRPC拡張もしない。

ALTER TABLE workspace_documents ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON workspace_documents FROM anon;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_users') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON workspace_documents TO authenticated;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

    DROP POLICY IF EXISTS "admin_all" ON workspace_documents;
    CREATE POLICY "admin_all" ON workspace_documents
      FOR ALL
      USING (auth.email() IN (SELECT email FROM admin_users))
      WITH CHECK (auth.email() IN (SELECT email FROM admin_users));

    RAISE NOTICE 'workspace_documents の権限を設定しました。';
  ELSE
    RAISE NOTICE 'admin_users テーブルが存在しないため、権限設定をスキップしました。';
  END IF;
END $$;

-- ============================================================
-- 確認
-- ============================================================

SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'workspace_documents'
ORDER BY cmd;
