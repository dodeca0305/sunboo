-- ============================================================
-- SUNBOO経営ナビ — Workspace Procedure Status 出現回単位化（Sprint 32）
-- ============================================================
-- Supabase ダッシュボード → SQL Editor で実行してください。
-- 再実行しても安全（DROP TABLE IF EXISTS → CREATE TABLE、DROP POLICY IF EXISTS、
-- CREATE OR REPLACE を使用）。
-- 前提：migration_workspace_mvp.sql（Sprint22.4）が実行済みであること。
--
-- 【Sprint31設計レビュー（docs/PERIODIC_STATUS_REDESIGN.md）で承認済みの再設計】
-- 旧 workspace_procedure_statuses（migration_workspace_procedure_statuses.sql、Sprint24.1）は
-- 主キーが (company_id, procedure_id) だったため、Annual Roadmap Engineが同じ手続きを
-- 複数回展開する場合（毎月納付・毎年申告等）に、出現回を区別できなかった
-- （例: 7月分を「完了」にすると8月分も「完了」のまま表示される）。
--
-- 本migrationは主キーに occurrence_key を追加し (company_id, procedure_id, occurrence_key) とする。
-- occurrence_key には新しい採番ロジックを作らず、既存のAnnual Roadmap Engine
-- （src/lib/roadmap.ts）が計算する RoadmapItem.dueDate（ISO日付文字列）をそのまま使う
-- （docs/PERIODIC_STATUS_REDESIGN.md 5節の採用理由: AnnualRoadmapView.tsxは既に
-- `procedure.id + dueDate` をUI上の出現識別子として使っており、それをDBスキーマに
-- 正式反映するだけで済むため。期限計算ロジック自体は一切変更しない）。
--
-- 【既存データの扱い】開発初期でデータ量が限定的なため、移行せず破棄する
-- （docs/PERIODIC_STATUS_REDESIGN.md 4-2節で承認済みの方針）。DROP TABLEで旧データごと
-- 作り直す。ロールバック安全性のための残置は行わない（対象が「進捗ステータス」という
-- 消えても実害が小さい種類のデータであり、CLAUDE.mdが定める「旧テーブルは残置する」
-- 原則は主に構造・マスタデータを指すため、本件には適用しないと判断した）。
-- ============================================================

DROP TABLE IF EXISTS workspace_procedure_statuses;

CREATE TABLE workspace_procedure_statuses (
  company_id     INTEGER     NOT NULL REFERENCES workspace_companies(id) ON DELETE CASCADE,
  procedure_id   INTEGER     NOT NULL REFERENCES procedures(id),
  occurrence_key TEXT        NOT NULL,
  status         TEXT        NOT NULL DEFAULT 'not_started'
                   CHECK (status IN ('not_started', 'in_progress', 'done', 'on_hold')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, procedure_id, occurrence_key)
);

-- updated_at 自動更新トリガー（schema.sql の update_updated_at() を再利用。旧migrationと同じパターン）
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
-- 旧migrationと同じ方針：anonには一切GRANTしない（REVOKEを明示的に書く）。

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
-- get_shared_workspace_view の更新（statusesにoccurrence_keyを追加）
-- ============================================================
-- company/profileと異なりshared_sectionsによる判定は行わない方針は維持する
-- （migration_workspace_procedure_statuses.sqlの既存方針を踏襲、Sprint24.1参照）。
-- 経営者向け共有ページ（/share/[token]）でも出現回ごとに正しい状態を表示できるよう、
-- occurrence_keyをJSON出力に追加する（編集不可の閲覧専用は維持）。

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

  -- Sprint24.1で追加、Sprint32でoccurrence_keyを追加。手続きステータス（編集不可の参考表示用）
  v_result := v_result || jsonb_build_object(
    'statuses',
    (SELECT COALESCE(
      jsonb_agg(jsonb_build_object(
        'procedure_id', s.procedure_id,
        'occurrence_key', s.occurrence_key,
        'status', s.status
      )),
      '[]'::jsonb
    )
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
