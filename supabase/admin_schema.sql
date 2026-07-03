-- ============================================================
-- SUNBOO経営ナビ — 管理画面（Admin）用スキーマ
-- ============================================================
-- Supabase SQL Editor で実行してください。
-- 再実行しても安全（IF NOT EXISTS / DROP POLICY IF EXISTS を使用）。
--
-- 前提：
--   schema.sql / grant_public_read.sql を実行済みであること
--   （全テーブルに RLS が有効化され、公開 SELECT ポリシーが設定済み）。
--
-- 管理者の追加方法：
--   1. Supabase ダッシュボード → Authentication → Users → 「Add user」で
--      管理者のメールアドレス・パスワードを登録する
--   2. このファイルの一番下にある INSERT 文を参考に、
--      admin_users テーブルへ同じメールアドレスを追加する
-- ============================================================

-- ── 管理者許可リスト ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_users (
  email      TEXT        PRIMARY KEY,
  name       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- ログイン中の本人が「自分が管理者かどうか」を確認できるようにするだけ。
-- admin_users への行の追加・削除は SQL Editor（postgres ロール）からのみ行う。
DROP POLICY IF EXISTS "self_read" ON admin_users;
CREATE POLICY "self_read" ON admin_users
  FOR SELECT
  USING (email = auth.email());

GRANT SELECT ON admin_users TO authenticated;

-- ── 管理者による書き込みポリシー ─────────────────────────────
-- 対象テーブルは authenticated ロールに INSERT/UPDATE/DELETE の権限を付与した上で、
-- RLS ポリシーで「admin_users に自分のメールアドレスが登録されている」場合のみ許可する。
-- SELECT は grant_public_read.sql の public_read ポリシーが既に全員に許可済みのため変更しない。

GRANT INSERT, UPDATE, DELETE ON prefectures          TO authenticated;
GRANT INSERT, UPDATE, DELETE ON municipalities       TO authenticated;
GRANT INSERT, UPDATE, DELETE ON jurisdiction_offices TO authenticated;
GRANT INSERT, UPDATE, DELETE ON procedures           TO authenticated;
GRANT INSERT, UPDATE, DELETE ON procedure_documents  TO authenticated;
GRANT INSERT, UPDATE, DELETE ON official_links       TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'prefectures', 'municipalities', 'jurisdiction_offices',
    'procedures', 'procedure_documents', 'official_links'
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
END $$;

-- ── 確認 ─────────────────────────────────────────────────────

SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd;

-- ============================================================
-- 管理者を追加する（Authentication → Users で作成した後に実行）
-- ============================================================
-- INSERT INTO admin_users (email, name) VALUES ('you@example.com', '担当者名')
-- ON CONFLICT (email) DO NOTHING;
