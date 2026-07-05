-- ============================================================
-- 診断用クエリ（読み取り専用・DDLなし・安全に何度でも実行可能）
-- company_events の permission denied 原因調査のため、Supabase SQL Editor で
-- 実行し、結果をそのまま共有してください。
-- ============================================================

-- 1. company_events / companies という名前のオブジェクトが実際に存在するか、
--    テーブルかビューか（relkind: r=table, v=view, m=materialized view）
SELECT c.relname, c.relkind, n.nspname AS schema
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE c.relname IN ('company_events', 'companies')
  AND n.nspname = 'public';

-- 2. company_events の実際のカラム構成
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'company_events'
ORDER BY ordinal_position;

-- 3. companies が存在する場合のカラム構成（存在しなければ0行）
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'companies'
ORDER BY ordinal_position;

-- 4. company_events に付与されている実際の権限（anon / authenticated）
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'company_events'
ORDER BY grantee, privilege_type;

-- 5. companies に付与されている実際の権限（存在する場合）
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'companies'
ORDER BY grantee, privilege_type;

-- 6. company_events に定義されているRLSポリシー
SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_expr, pg_get_expr(polwithcheck, polrelid) AS with_check_expr
FROM pg_policy
WHERE polrelid = 'public.company_events'::regclass;

-- 7. company_events がビューの場合、その定義（テーブルなら0行）
SELECT pg_get_viewdef('public.company_events'::regclass, true) AS view_definition
WHERE EXISTS (
  SELECT 1 FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname = 'company_events' AND n.nspname = 'public' AND c.relkind = 'v'
);
