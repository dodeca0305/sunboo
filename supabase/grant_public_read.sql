-- ============================================================
-- SUNBOO経営ナビ — 公開読み取り権限の付与
-- ============================================================
-- anon ロール（未ログインユーザー）に SELECT 権限を付与する。
-- Supabase SQL Editor で実行してください。
-- ============================================================

-- anon ロールへの SELECT 権限付与
GRANT SELECT ON prefectures          TO anon;
GRANT SELECT ON municipalities       TO anon;
GRANT SELECT ON jurisdiction_offices TO anon;
GRANT SELECT ON procedures           TO anon;
GRANT SELECT ON official_links       TO anon;
GRANT SELECT ON procedure_documents  TO anon;

-- RLS を有効化しつつ公開読み取りポリシーを設定（二重の安全策）
ALTER TABLE prefectures          ENABLE ROW LEVEL SECURITY;
ALTER TABLE municipalities       ENABLE ROW LEVEL SECURITY;
ALTER TABLE jurisdiction_offices ENABLE ROW LEVEL SECURITY;
ALTER TABLE procedures           ENABLE ROW LEVEL SECURITY;
ALTER TABLE official_links       ENABLE ROW LEVEL SECURITY;
ALTER TABLE procedure_documents  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read" ON prefectures;
DROP POLICY IF EXISTS "public_read" ON municipalities;
DROP POLICY IF EXISTS "public_read" ON jurisdiction_offices;
DROP POLICY IF EXISTS "public_read" ON procedures;
DROP POLICY IF EXISTS "public_read" ON official_links;
DROP POLICY IF EXISTS "public_read" ON procedure_documents;

CREATE POLICY "public_read" ON prefectures          FOR SELECT USING (true);
CREATE POLICY "public_read" ON municipalities       FOR SELECT USING (true);
CREATE POLICY "public_read" ON jurisdiction_offices FOR SELECT USING (true);
CREATE POLICY "public_read" ON procedures           FOR SELECT USING (true);
CREATE POLICY "public_read" ON official_links       FOR SELECT USING (true);
CREATE POLICY "public_read" ON procedure_documents  FOR SELECT USING (true);

-- 確認
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('prefectures','municipalities','jurisdiction_offices','procedures','official_links');
