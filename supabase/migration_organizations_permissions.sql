-- ============================================================
-- SUNBOO経営ナビ — 行政機関マスター新テーブルの権限設定
-- ============================================================
-- migration_organizations.sql 実行後に、このファイルを Supabase SQL Editor で実行してください。
-- 再実行しても安全（IF EXISTS / DROP POLICY IF EXISTS を使用）。
--
-- 背景：organization_types / organizations / organization_offices / jurisdictions /
-- procedure_organizations は grant_public_read.sql（既存テーブル向け）にも
-- admin_schema.sql（既存テーブル向け）にも含まれておらず、Supabase では
-- テーブル作成だけでは anon/authenticated ロールから読み書きできないため、
-- サイト上で常に0件（空）に見える状態になっていました。このファイルで解消します。
-- ============================================================

-- ── 公開読み取り権限（anon ロール） ──────────────────────────

GRANT SELECT ON organization_types      TO anon;
GRANT SELECT ON organizations           TO anon;
GRANT SELECT ON organization_offices    TO anon;
GRANT SELECT ON jurisdictions           TO anon;
GRANT SELECT ON procedure_organizations TO anon;

ALTER TABLE organization_types      ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_offices    ENABLE ROW LEVEL SECURITY;
ALTER TABLE jurisdictions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE procedure_organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read" ON organization_types;
DROP POLICY IF EXISTS "public_read" ON organizations;
DROP POLICY IF EXISTS "public_read" ON organization_offices;
DROP POLICY IF EXISTS "public_read" ON jurisdictions;
DROP POLICY IF EXISTS "public_read" ON procedure_organizations;

CREATE POLICY "public_read" ON organization_types      FOR SELECT USING (true);
CREATE POLICY "public_read" ON organizations           FOR SELECT USING (true);
CREATE POLICY "public_read" ON organization_offices    FOR SELECT USING (true);
CREATE POLICY "public_read" ON jurisdictions            FOR SELECT USING (true);
CREATE POLICY "public_read" ON procedure_organizations  FOR SELECT USING (true);

-- ── 管理画面からの書き込み権限（authenticated ロール、admin_users 登録者のみ） ──
-- admin_schema.sql が未実行（admin_users テーブルが無い）場合はこのセクションをスキップします。
-- その場合は admin_schema.sql を実行してから、このファイルを再実行してください。

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_users') THEN

    GRANT INSERT, UPDATE, DELETE ON organization_types      TO authenticated;
    GRANT INSERT, UPDATE, DELETE ON organizations           TO authenticated;
    GRANT INSERT, UPDATE, DELETE ON organization_offices    TO authenticated;
    GRANT INSERT, UPDATE, DELETE ON jurisdictions           TO authenticated;
    GRANT INSERT, UPDATE, DELETE ON procedure_organizations TO authenticated;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

    DECLARE
      t TEXT;
    BEGIN
      FOREACH t IN ARRAY ARRAY[
        'organization_types', 'organizations', 'organization_offices',
        'jurisdictions', 'procedure_organizations'
      ]
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS "admin_insert" ON %I', t);
        EXECUTE format(
          'CREATE POLICY "admin_insert" ON %I FOR INSERT
             WITH CHECK (auth.email() IN (SELECT email FROM admin_users))', t
        );

        EXECUTE format('DROP POLICY IF EXISTS "admin_update" ON %I', t);
        EXECUTE format(
          'CREATE POLICY "admin_update" ON %I FOR UPDATE
             USING (auth.email() IN (SELECT email FROM admin_users))
             WITH CHECK (auth.email() IN (SELECT email FROM admin_users))', t
        );

        EXECUTE format('DROP POLICY IF EXISTS "admin_delete" ON %I', t);
        EXECUTE format(
          'CREATE POLICY "admin_delete" ON %I FOR DELETE
             USING (auth.email() IN (SELECT email FROM admin_users))', t
        );
      END LOOP;
    END;

    RAISE NOTICE '管理者書き込みポリシーを設定しました。';
  ELSE
    RAISE NOTICE 'admin_users テーブルが存在しないため、管理者書き込みポリシーの設定をスキップしました（admin_schema.sql を先に実行してください）。';
  END IF;
END $$;

-- ── 確認 ─────────────────────────────────────────────────────

SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('organization_types','organizations','organization_offices','jurisdictions','procedure_organizations');

SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('organization_types','organizations','organization_offices','jurisdictions','procedure_organizations')
ORDER BY tablename, cmd;
