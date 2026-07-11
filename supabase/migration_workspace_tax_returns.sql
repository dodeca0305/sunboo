-- ============================================================
-- SUNBOO経営ナビ — Workspace Tax Return Profile（Sprint 35）
-- ============================================================
-- Supabase ダッシュボード → SQL Editor で実行してください。
-- 再実行しても安全（CREATE TABLE IF NOT EXISTS / DROP POLICY IF EXISTS / CREATE OR REPLACE を使用）。
-- 前提：migration_workspace_mvp.sql（Sprint22.4）・migration_workspace_access_control.sql（Sprint33）・
-- migration_workspace_procedure_statuses_occurrence.sql（Sprint32）が実行済みであること
-- （is_workspace_member()・get_shared_workspace_view()を再利用するため）。
--
-- 設計: docs/WORKSPACE_DB_DESIGN.md 3節・11節（Sprint22.3、設計レビュー承認済み）。
-- ただし11節のRLS方針（admin_users登録者なら全社アクセス可のフラットモデル）はSprint33の
-- Workspaceアクセス制御導入より前の設計のため、本migrationでは採用しない。他のworkspace_*
-- テーブル（company_profiles / procedure_statuses / documents）と同じく、Sprint33で導入された
-- is_workspace_member()ベースの会社単位RLSに合わせる（CLAUDE.md「新しい概念を追加する前に
-- 既存のテーブル・関数で表現できないか検討する」の実践）。
--
-- 【スコープ】src/lib/taxReturnProfile.ts の TaxReturnEntry 型（(site)側でlocalStorage運用中）を
-- 1:1でテーブル化する。既存Engine（診断エンジン・Timeline Producer・State Engine）は無変更。
-- ============================================================

-- ============================================================
-- 1. workspace_tax_return_profiles — 決算のたびの申告実績（1行=1事業年度）
-- ============================================================
-- company_id単一行を主キーにする workspace_company_profiles と異なり、1社に複数行（年度ごと）
-- 持つため、独立した id を主キーにする。UNIQUE(company_id, fiscal_year_end_date) により、
-- 同一年度の重複登録・migration再実行時の増殖を防ぐ（CLAUDE.md「一意性が必要なシードデータには
-- 必ずUNIQUE制約」の対象ではないが同種の事故防止として同じ考え方を適用）。
-- fiscal_year（対象年度の自由記述ラベル、例:「2025年3月期」）は表示用でありUNIQUEキーには
-- ふさわしくないため、一意性の判定には使わない。

CREATE TABLE IF NOT EXISTS workspace_tax_return_profiles (
  id                                       SERIAL      PRIMARY KEY,
  company_id                               INTEGER     NOT NULL REFERENCES workspace_companies(id) ON DELETE CASCADE,
  fiscal_year                              TEXT        NOT NULL,
  fiscal_year_start_date                   DATE,
  fiscal_year_end_date                     DATE        NOT NULL,
  filed_date                               DATE,
  capital_at_filing                        BIGINT,
  taxable_sales_amount                     JSONB,
  consumption_tax_status                   TEXT        NOT NULL
                                              CHECK (consumption_tax_status IN ('exempt', 'taxable')),
  taxation_method                          TEXT        CHECK (taxation_method IN ('principle', 'simplified')),
  invoice_registration_status              TEXT        NOT NULL
                                              CHECK (invoice_registration_status IN ('registered', 'not_registered')),
  corporate_tax_amount                     JSONB,
  consumption_tax_amount                   JSONB,
  corporate_tax_interim_filing_actual      TEXT        NOT NULL
                                              CHECK (corporate_tax_interim_filing_actual IN ('none', 'has')),
  consumption_tax_interim_frequency_actual TEXT        NOT NULL
                                              CHECK (consumption_tax_interim_frequency_actual IN ('none', '1', '3', '11')),
  financial_statement_published            BOOLEAN     NOT NULL DEFAULT FALSE,
  withholding_tax_cycle_actual             TEXT        CHECK (withholding_tax_cycle_actual IN ('monthly', 'special_exception')),
  employee_count_at_fiscal_year_end        INTEGER,
  created_at                               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, fiscal_year_end_date)
);

CREATE INDEX IF NOT EXISTS idx_workspace_tax_return_profiles_company
  ON workspace_tax_return_profiles(company_id);

-- updated_at 自動更新トリガー（schema.sql の update_updated_at() を再利用、既存migrationと同じガード）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
    DROP TRIGGER IF EXISTS trg_workspace_tax_return_profiles_updated_at ON workspace_tax_return_profiles;
    CREATE TRIGGER trg_workspace_tax_return_profiles_updated_at
      BEFORE UPDATE ON workspace_tax_return_profiles
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    RAISE NOTICE 'workspace_tax_return_profiles の updated_at 自動更新トリガーを設定しました。';
  ELSE
    RAISE NOTICE 'update_updated_at() 関数が存在しないため、トリガー設定をスキップしました。';
  END IF;
END $$;

-- ============================================================
-- 2. 権限設定（GRANT + RLS + policy）
-- ============================================================
-- 税務・金額データを扱うため anon には一切 GRANT しない。Sprint33で確立した
-- is_workspace_member() ベースの会社単位モデルに合わせる（migration_workspace_access_control.sql
-- 4節と同じ形。SELECTはWorkspaceの所属メンバーなら誰でも、書き込みはowner/memberのみ）。

ALTER TABLE workspace_tax_return_profiles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON workspace_tax_return_profiles FROM anon;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_users') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON workspace_tax_return_profiles TO authenticated;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

    DROP POLICY IF EXISTS "member_select" ON workspace_tax_return_profiles;
    DROP POLICY IF EXISTS "member_insert" ON workspace_tax_return_profiles;
    DROP POLICY IF EXISTS "member_update" ON workspace_tax_return_profiles;
    DROP POLICY IF EXISTS "member_delete" ON workspace_tax_return_profiles;

    CREATE POLICY "member_select" ON workspace_tax_return_profiles FOR SELECT
      USING (auth.email() IN (SELECT email FROM admin_users) AND is_workspace_member(company_id));

    CREATE POLICY "member_insert" ON workspace_tax_return_profiles FOR INSERT
      WITH CHECK (auth.email() IN (SELECT email FROM admin_users) AND is_workspace_member(company_id, ARRAY['owner', 'member']));

    CREATE POLICY "member_update" ON workspace_tax_return_profiles FOR UPDATE
      USING (auth.email() IN (SELECT email FROM admin_users) AND is_workspace_member(company_id, ARRAY['owner', 'member']))
      WITH CHECK (auth.email() IN (SELECT email FROM admin_users) AND is_workspace_member(company_id, ARRAY['owner', 'member']));

    CREATE POLICY "member_delete" ON workspace_tax_return_profiles FOR DELETE
      USING (auth.email() IN (SELECT email FROM admin_users) AND is_workspace_member(company_id, ARRAY['owner', 'member']));

    RAISE NOTICE 'workspace_tax_return_profiles の権限をWorkspace単位で設定しました。';
  ELSE
    RAISE NOTICE 'admin_users テーブルが存在しないため、権限設定をスキップしました。';
  END IF;
END $$;

-- ============================================================
-- 3. get_shared_workspace_view の更新（tax_returnsをshared_sections経由の任意公開項目として追加）
-- ============================================================
-- company/profileと同じ「shared_sectionsに含まれる場合のみ公開」方式を採用する（statusesとは異なる
-- 判断。決算実績は金額を含む最も機微な情報であり、会社側が明示的に共有を選んだ場合のみ経営者に
-- 見せるべきと判断したため）。定義全体をCREATE OR REPLACEするため、これまでの
-- company/profile/statusesブロックはそのまま引き継ぐ。

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

  -- Sprint35で追加。company/profileと同じくオプトイン公開（shared_sectionsに'tax_returns'が
  -- 含まれる場合のみ）。fiscal_year_end_date昇順（アプリ側TaxReturnProfileの並び順と揃える）。
  IF v_link.shared_sections ? 'tax_returns' THEN
    v_result := v_result || jsonb_build_object(
      'tax_returns',
      (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.fiscal_year_end_date), '[]'::jsonb)
       FROM workspace_tax_return_profiles t
       WHERE t.company_id = v_link.company_id)
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
WHERE schemaname = 'public' AND tablename = 'workspace_tax_return_profiles'
ORDER BY cmd;
