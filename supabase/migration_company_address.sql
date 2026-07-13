-- ============================================================
-- SUNBOO経営ナビ — workspace_company_profiles へ address 追加（Sprint56）
-- ============================================================
-- 設計根拠: docs/COMPANY_ADDRESS_OFFICE_RESOLUTION_DESIGN.md（Sprint54、案B）
--
-- 本店所在地の番地・建物名等を「表示専用」として保持する。提出先判定の判定キーは
-- 引き続き workspace_companies.municipality_code のみであり、この列は一切使用しない
-- （郵便番号検索・住所解析は行わない。都道府県名・市区町村名は既存の
-- prefecture_code/municipality_code から解決済みのため、ここでは番地部分のみを保持する）。
--
-- 用途: Excel出力の会社所在地列・PDF表紙・共有ページ（/share/[token]）での表示のみ。
-- Roadmap Engine・Decision Engine・Notification・提出先判定ロジックへの影響は無い。
--
-- Supabase ダッシュボード → SQL Editor で実行してください。
-- 再実行しても安全（IF NOT EXISTS を使用）。
--
-- 本マイグレーションが行うこと:
--   1. workspace_company_profiles へ address 列を追加（TEXT、NULL許容）。
--      既存行は自動的に NULL（未設定）になる
--
-- 新しいテーブルは作らないため、GRANT / RLS の追加設定は不要
-- （workspace_company_profiles は既存マイグレーションで設定済みのポリシーをそのまま使う）。
-- ============================================================

ALTER TABLE workspace_company_profiles
  ADD COLUMN IF NOT EXISTS address TEXT;

-- ============================================================
-- 確認クエリ
-- ============================================================

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'workspace_company_profiles' AND column_name = 'address';

SELECT
  COUNT(*) AS 総件数,
  COUNT(address) AS 設定済み件数,
  COUNT(*) - COUNT(address) AS 未設定件数
FROM workspace_company_profiles;
