-- ============================================================
-- SUNBOO経営ナビ — Workspace Procedure Status（Sprint 24 Phase24.1）
-- ============================================================
-- Supabase ダッシュボード → SQL Editor で実行してください。
-- 再実行しても安全（IF NOT EXISTS / DROP POLICY IF EXISTS / CREATE OR REPLACE を使用）。
-- 前提：migration_workspace_mvp.sql（Sprint22.4）が実行済みであること
--       （本ファイルは既存の workspace_companies・admin_users・update_updated_at()・
--       get_shared_workspace_view を参照・上書きする）。
--
-- 設計: docs/WORKSPACE_DB_DESIGN.md 10節（Sprint22.3で提案・Sprint22.4ではスコープ外とした）を
-- 実装したもの。Sprint24.1のユーザー承認により新規migrationとして追加する
-- （Sprint24.1の「migrationなし」制約は、本テーブルが未作成だったという前提の誤りが判明したため
-- 唯一の例外として承認済み）。
--
-- ステータスは4値（not_started/in_progress/done/on_hold）とする。既存の
-- src/lib/scheduleProcedure.ts の ProcedureStatus型（3値、/result等の既存Engineが使用）とは
-- 独立した別の型として扱う（Workspace専用。既存Engineには一切影響しない）。
--
-- 【粒度についての設計判断】主キーは (company_id, procedure_id) とし、手続き単位で1つの
-- ステータスを持つ（/result の既存パターンと同じ粒度）。Annual Roadmapは同じ手続きが複数年・
-- 複数回（例: 毎月の源泉所得税納付）出現するが、本MVPでは出現回ごとの個別ステータスは
-- 持たない（1つの手続きに対する状態は全出現回で共有される）。年度・出現回単位の管理が
-- 必要になった場合は、別途 due_date 等をキーに加えたスキーマ拡張を検討する。
-- ============================================================

CREATE TABLE IF NOT EXISTS workspace_procedure_statuses (
  company_id   INTEGER     NOT NULL REFERENCES workspace_companies(id) ON DELETE CASCADE,
  procedure_id INTEGER     NOT NULL REFERENCES procedures(id),
  status       TEXT        NOT NULL DEFAULT 'not_started'
                 CHECK (status IN ('not_started', 'in_progress', 'done', 'on_hold')),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, procedure_id)
);

-- updated_at 自動更新トリガー（schema.sql の update_updated_at() を再利用。
-- 存在しない環境でもテーブル作成自体は失敗しないようガードする。Sprint22.4レビューで
-- migration_workspace_mvp.sql に加えた対応と同じパターン）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
    DROP TRIGGER IF EXISTS trg_workspace_procedure_statuses_updated_at ON workspace_procedure_statuses;
    CREATE TRIGGER trg_workspace_procedure_statuses_updated_at
      BEFORE UPDATE ON workspace_procedure_statuses
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    RAISE NOTICE 'workspace_procedure_statuses の updated_at 自動更新トリガーを設定しました。';
  ELSE
    RAISE NOTICE 'update_updated_at() 関数が存在しないため、トリガー設定をスキップしました。';
  END IF;
END $$;

-- ── 権限（GRANT + RLS + policy）─────────────────────────────────
-- 既存workspace系テーブルと同じ方針：anonには一切GRANTしない
-- （REVOKEを明示的に書く。Sprint22.4レビューでの指摘・対応と同じ、多層防御のため）。

ALTER TABLE workspace_procedure_statuses ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON workspace_procedure_statuses FROM anon;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_users') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON workspace_procedure_statuses TO authenticated;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

    DROP POLICY IF EXISTS "admin_all" ON workspace_procedure_statuses;
    CREATE POLICY "admin_all" ON workspace_procedure_statuses
      FOR ALL
      USING (auth.email() IN (SELECT email FROM admin_users))
      WITH CHECK (auth.email() IN (SELECT email FROM admin_users));

    RAISE NOTICE 'workspace_procedure_statuses の権限を設定しました。';
  ELSE
    RAISE NOTICE 'admin_users テーブルが存在しないため、権限設定をスキップしました。';
  END IF;
END $$;

-- ============================================================
-- get_shared_workspace_view の更新（statusesを追加）
-- ============================================================
-- 共有ページ（/share/[token]）にも手続きステータスを表示するため（編集不可）、
-- 既存RPC（migration_workspace_mvp.sql）に "statuses" キーを追加する。
-- company/profileと異なり shared_sections による判定は行わない（Sprint24.0の
-- /share/[token] 実装がroadmapセクションをshared_sectionsに関わらず常に計算・表示する
-- 設計にしているため、それに揃える）。

CREATE OR REPLACE FUNCTION get_shared_workspace_view(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link   workspace_share_links%ROWTYPE;
  v_result JSONB := '{}'::jsonb;
BEGIN
  SELECT * INTO v_link FROM workspace_share_links
    WHERE token = p_token
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > NOW());

  IF NOT FOUND THEN
    RETURN NULL; -- 無効・失効・期限切れのトークン
  END IF;

  UPDATE workspace_share_links SET last_accessed_at = NOW() WHERE id = v_link.id;

  IF v_link.shared_sections ? 'company' THEN
    v_result := v_result || jsonb_build_object(
      'company',
      (SELECT to_jsonb(c) FROM workspace_companies c WHERE c.id = v_link.company_id)
    );
  END IF;

  IF v_link.shared_sections ? 'profile' THEN
    v_result := v_result || jsonb_build_object(
      'profile',
      (SELECT to_jsonb(p) FROM workspace_company_profiles p WHERE p.company_id = v_link.company_id)
    );
  END IF;

  -- Sprint24.1で追加。手続きステータス（編集不可の参考表示用）
  v_result := v_result || jsonb_build_object(
    'statuses',
    (SELECT COALESCE(jsonb_agg(jsonb_build_object('procedure_id', s.procedure_id, 'status', s.status)), '[]'::jsonb)
     FROM workspace_procedure_statuses s
     WHERE s.company_id = v_link.company_id)
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_shared_workspace_view(TEXT) TO anon;

-- ============================================================
-- 確認
-- ============================================================

SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'workspace_procedure_statuses'
ORDER BY cmd;
