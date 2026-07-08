-- ============================================================
-- SUNBOO経営ナビ — Company Workspace MVP（Sprint 22 Phase22.4）
-- ============================================================
-- Supabase ダッシュボード → SQL Editor で実行してください。
-- 再実行しても安全（IF NOT EXISTS / DROP POLICY IF EXISTS / DROP TRIGGER IF EXISTS を使用）。
-- 前提：schema.sql, admin_schema.sql が実行済みであること
--       （本ファイルは既存の update_updated_at() 関数・admin_users テーブルを再利用する）。
--
-- 設計: docs/WORKSPACE_DB_DESIGN.md（Sprint22.3、設計レビュー承認済み）
--       docs/WORKSPACE_DB_MVP_MIGRATION.md（Sprint22.4、本ファイルの設計判断の詳細）
--
-- スコープ（Sprint22.4）: 「会社を登録する」「会社を管理する」「会社を共有する」の3つだけを
-- 成立させる最小構成。対象は workspace_companies / workspace_company_profiles /
-- workspace_members / workspace_share_links の4テーブルのみ。Timeline / State / Roadmap /
-- Accounting / Documents は対象外（docs/WORKSPACE_DB_MVP_MIGRATION.md 参照）。
--
-- 既存 companies / company_events（本番に存在する素性不明のテーブル）は触らない
-- （docs/COMPANY_WORKSPACE_DB_AUDIT.md、Sprint22.2で承認済みの方針）。
--
-- 権限方針（既存の「anon に SELECT 許可が原則」からの意図的な逸脱）:
-- 本ファイルが作るテーブルは会社の税務・労務データを扱うため、anon には一切 GRANT しない。
-- 読み取り・書き込みいずれも authenticated ロール + admin_users 照合のみで許可する
-- （docs/WORKSPACE_DB_DESIGN.md 11節で承認済みの方針）。
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 1. workspace_companies — 会社の識別子となる最小限のテーブル
-- ============================================================
-- 他の全 workspace_* テーブルが company_id で参照する起点。会社一覧（検索・フィルタ）に
-- 必要な最低限の列のみを持ち、税務・労務の詳細は workspace_company_profiles に分離する
-- （docs/WORKSPACE_DB_DESIGN.md 1節）。owner/auth_user_id のような単一所有者列は持たない
-- （誰が担当するかは workspace_members の多対多関係で表現する、同ドキュメント9-1節相当の判断）。

CREATE TABLE IF NOT EXISTS workspace_companies (
  id                SERIAL      PRIMARY KEY,
  name              TEXT        NOT NULL,
  prefecture_code   TEXT        NOT NULL,
  municipality_code TEXT        NOT NULL,
  corporate_type    TEXT        NOT NULL CHECK (corporate_type IN ('kabushiki', 'godo')),
  fiscal_month      INTEGER     CHECK (fiscal_month BETWEEN 1 AND 12),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspace_companies_municipality
  ON workspace_companies(prefecture_code, municipality_code);
CREATE INDEX IF NOT EXISTS idx_workspace_companies_name ON workspace_companies(name);

-- ============================================================
-- 2. workspace_company_profiles — 既存 CompanyProfile 型の1:1転写
-- ============================================================
-- src/lib/companyProfile.ts の CompanyProfile 型をそのままカラムに転写する
-- （docs/WORKSPACE_DB_DESIGN.md 2節）。1社1行を company_id 自体を主キーにすることで保証する。

CREATE TABLE IF NOT EXISTS workspace_company_profiles (
  company_id                        INTEGER     PRIMARY KEY REFERENCES workspace_companies(id) ON DELETE CASCADE,
  employee_count                    INTEGER     NOT NULL DEFAULT 0,
  capital                           BIGINT,
  established_date                  DATE,
  stage                             TEXT        NOT NULL DEFAULT 'pre_establishment'
                                       CHECK (stage IN ('pre_establishment', 'first_term', 'second_term_or_later')),
  consumption_tax_status            TEXT        NOT NULL DEFAULT 'exempt'
                                       CHECK (consumption_tax_status IN ('exempt', 'taxable')),
  invoice_registration_status       TEXT        NOT NULL DEFAULT 'not_registered'
                                       CHECK (invoice_registration_status IN ('registered', 'not_registered')),
  taxation_method                   TEXT        CHECK (taxation_method IN ('principle', 'simplified')),
  corporate_tax_interim_filing      TEXT        NOT NULL DEFAULT 'none'
                                       CHECK (corporate_tax_interim_filing IN ('none', 'has')),
  consumption_tax_interim_frequency TEXT        NOT NULL DEFAULT 'none'
                                       CHECK (consumption_tax_interim_frequency IN ('none', '1', '3', '11')),
  withholding_tax_cycle             TEXT        NOT NULL DEFAULT 'unset'
                                       CHECK (withholding_tax_cycle IN ('monthly', 'special_exception', 'unset')),
  local_tax_collection_method       TEXT        NOT NULL DEFAULT 'special_collection'
                                       CHECK (local_tax_collection_method IN ('special_collection', 'general_collection')),
  e_tax_enabled                     BOOLEAN     NOT NULL DEFAULT FALSE,
  e_ltax_enabled                    BOOLEAN     NOT NULL DEFAULT FALSE,
  advisors                          JSONB       NOT NULL DEFAULT
    '{"taxAccountant":false,"laborConsultant":false,"judicialScrivener":false,"administrativeScrivener":false}'::jsonb,
  updated_at                        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── updated_at 自動更新トリガー ──────────────────────────────
-- schema.sql が定義する update_updated_at() を再利用する（前提として schema.sql 実行済みを
-- 挙げているが、admin_users と同様に「無い場合でも移行そのものは失敗させない」ようガードする
-- （Sprint22.4レビューで指摘・修正）。関数が無い環境では自動更新が働かないだけで、
-- テーブル自体の作成やRLS設定は正常に完了する。

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
    DROP TRIGGER IF EXISTS trg_workspace_companies_updated_at ON workspace_companies;
    CREATE TRIGGER trg_workspace_companies_updated_at
      BEFORE UPDATE ON workspace_companies
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();

    DROP TRIGGER IF EXISTS trg_workspace_company_profiles_updated_at ON workspace_company_profiles;
    CREATE TRIGGER trg_workspace_company_profiles_updated_at
      BEFORE UPDATE ON workspace_company_profiles
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();

    RAISE NOTICE 'updated_at 自動更新トリガーを設定しました。';
  ELSE
    RAISE NOTICE 'update_updated_at() 関数が存在しないため、updated_at自動更新トリガーの設定をスキップしました（schema.sqlの実行状況を確認してください）。';
  END IF;
END $$;

-- ============================================================
-- 3. workspace_members — 会社ごとのメンバー（担当者・将来の経営者ログインの受け皿）
-- ============================================================
-- docs/WORKSPACE_DB_DESIGN.md 7節で提案した workspace_assignments（担当者の割当、今すぐ必要）と
-- workspace_members（将来のログイン付き経営者アカウント、将来構想）を、Sprint22.4のスコープ縮小に
-- 伴い1テーブルに統合したもの。email は admin_users への外部キーにしない
-- （role='admin'/'staff' の行は admin_users と対応するが、role='owner'/'viewer' の行は
-- 将来のログイン基盤ができるまで admin_users に存在しないメールアドレスを保持しうるため）。
--
-- 【Sprint22.4のスコープ判断】本テーブルは行の記録・自己参照read（後述 self_read）のみを提供する。
-- 「担当者に割り当てられた会社しか見えない」という制限付きRLSはこのSprintでは実装しない
-- （画面が無いスコープでRLSだけ先に絞ると検証できないため）。会社の管理自体は当面
-- admin_users登録者なら誰でも全社アクセス可、という既存の管理画面と同じフラットな権限モデルを
-- 踏襲する（4節「権限設計」参照）。

CREATE TABLE IF NOT EXISTS workspace_members (
  id          SERIAL      PRIMARY KEY,
  company_id  INTEGER     NOT NULL REFERENCES workspace_companies(id) ON DELETE CASCADE,
  email       TEXT        NOT NULL,
  role        TEXT        NOT NULL CHECK (role IN ('admin', 'staff', 'owner', 'viewer')),
  invited_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  UNIQUE (company_id, email)
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_company ON workspace_members(company_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_email   ON workspace_members(email);

-- ============================================================
-- 4. workspace_share_links — 経営者への共有リンク（ログイン不要）
-- ============================================================
-- token は32バイト相当のランダム値（hex表現64文字）。推測困難性を優先し、company_id等の
-- 連番からは推測できない値にする。shared_sections は共有する項目のコード配列（JSONB）で、
-- 本Sprintでは "company" / "profile" の2値のみを想定する（Timeline/Roadmap等は対象外のため）。

CREATE TABLE IF NOT EXISTS workspace_share_links (
  id               SERIAL      PRIMARY KEY,
  company_id       INTEGER     NOT NULL REFERENCES workspace_companies(id) ON DELETE CASCADE,
  token            TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  shared_sections  JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_by       TEXT        NOT NULL REFERENCES admin_users(email),
  expires_at       TIMESTAMPTZ,
  revoked_at       TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspace_share_links_company ON workspace_share_links(company_id);

-- ============================================================
-- 5. 権限設定（GRANT + RLS + policy）
-- ============================================================
-- admin_users が存在しない環境でも安全に動くようガードする（既存 migration_rule_engine.sql と
-- 同じパターン、CLAUDE.md「DB変更時の注意」）。anon には一切 GRANT しない
-- （本ファイル冒頭の権限方針を参照）。
--
-- 【Sprint22.4レビューで判明・追記】Supabaseプロジェクトの既定設定により、新規テーブルには
-- anon/authenticated に対する権限が自動付与される場合がある（本番での動作確認で判明。
-- RLSが正しく機能していれば実データは一切見えない・書き込みも拒否されるため実害は無いが、
-- 「anonには一切GRANTしない」という設計意図と実際の権限状態を一致させるため、多層防御として
-- 明示的に REVOKE する。税務・労務・会社情報を扱うテーブルのため、RLSのみに頼らずGRANTレベルでも
-- 遮断する）。

REVOKE ALL ON workspace_companies, workspace_company_profiles, workspace_members, workspace_share_links
  FROM anon;

ALTER TABLE workspace_companies        ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_company_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members          ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_share_links      ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_users') THEN

    GRANT SELECT, INSERT, UPDATE, DELETE ON workspace_companies        TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON workspace_company_profiles TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON workspace_members          TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON workspace_share_links      TO authenticated;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

    -- admin_users 登録者は全社にアクセス可（Sprint22.4はフラットな権限モデル。3節参照）
    DECLARE
      t TEXT;
    BEGIN
      FOREACH t IN ARRAY ARRAY[
        'workspace_companies', 'workspace_company_profiles', 'workspace_members', 'workspace_share_links'
      ]
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS "admin_all" ON %I', t);
        EXECUTE format(
          'CREATE POLICY "admin_all" ON %I FOR ALL
             USING (auth.email() IN (SELECT email FROM admin_users))
             WITH CHECK (auth.email() IN (SELECT email FROM admin_users))', t
        );
      END LOOP;
    END;

    -- workspace_members のみ、admin_users の判定式（既存 admin_schema.sql の self_read と
    -- 同じパターン）に加えて、自分自身のメンバー行を読める self_read を追加する。
    -- 将来のログイン付き経営者アカウント（role='owner'/'viewer'）が「自分はどの会社の
    -- メンバーか」を確認できるようにするための先回りの設計（現状は画面が無いため未使用）。
    DROP POLICY IF EXISTS "self_read" ON workspace_members;
    CREATE POLICY "self_read" ON workspace_members
      FOR SELECT
      USING (email = auth.email());

    RAISE NOTICE 'Company Workspace MVP（4テーブル）の権限を設定しました。';
  ELSE
    RAISE NOTICE 'admin_users テーブルが存在しないため、権限設定をスキップしました。';
  END IF;
END $$;

-- ============================================================
-- 6. 共有リンクの限定閲覧用RPC（SECURITY DEFINER）
-- ============================================================
-- anon はテーブルへの直接アクセス権を持たない（5節）。共有リンクの閲覧はこの関数を経由してのみ
-- 行う（docs/WORKSPACE_DB_DESIGN.md 12節で設計した get_shared_workspace_view の実装。
-- Sprint22.4のスコープに合わせ、返す内容は company / profile の2項目のみに限定する）。
--
-- この関数は「関数の所有者（通常 postgres ロール）」の権限で実行されるため、内部では
-- RLSをバイパスして必要なテーブルを読める。anon にはこの関数の実行権限のみを与え、
-- テーブルへの直接権限は与えない。

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

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_shared_workspace_view(TEXT) TO anon;

-- ============================================================
-- 確認
-- ============================================================

SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('workspace_companies', 'workspace_company_profiles', 'workspace_members', 'workspace_share_links')
ORDER BY tablename, cmd;
