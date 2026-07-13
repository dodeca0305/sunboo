-- ============================================================
-- SUNBOO経営ナビ — workspace_company_profiles へ next_officer_change_date 追加（Sprint55）
-- ============================================================
-- 設計根拠: docs/COMPANY_ADDRESS_OFFICE_RESOLUTION_DESIGN.md（Sprint54、S評価）
--
-- 【Sprint55レビュー対応で再設計】当初「役員任期の定め有無（officer_term_status、3値enum）」を
-- 提案したが、以下2点の指摘によりボツにした（このファイルは migration_officer_term_status.sql の
-- 後継。あちらは一度も実行していないため、そのまま置き換える）。
--   1. 株式会社の役員には会社法上必ず任期があるため、「任期の定めなし」という選択肢自体が
--      制度上誤りだった
--   2. LEGAL_OFFICER_CHANGE（役員変更登記）は timing_type='event_based' のため、
--      「任期の定めの有無」だけでは起算日が無く、Annual Roadmapへoccurrenceを生成できなかった
--
-- 代わりに「次回の役員変更（重任・交代）の効力発生予定日」そのものを保持し、
-- src/lib/companyProfile.ts の applyCompanyProfileToProcedures がこの日付を起算日として
-- calculateNextDeadline（event_based分岐）を再利用して期限を計算する。
--
-- 【注意】next_officer_change_date は登記申請期限そのものではない。役員変更・重任・交代が
-- 効力を生じる日（例: 株主総会での重任決議日）を保持する列であり、そこから2週間（14日）以内の
-- 登記申請期限はアプリケーション側で自動計算する（procedures.timing_data.days_from_event=14）。
--
-- Supabase ダッシュボード → SQL Editor で実行してください。
-- 再実行しても安全（IF NOT EXISTS を使用）。
--
-- 本マイグレーションが行うこと:
--   1. workspace_company_profiles へ next_officer_change_date 列を追加（DATE、NULL許容）。
--      既存行は自動的に NULL（未設定）になる
--
-- 新しいテーブルは作らないため、GRANT / RLS の追加設定は不要
-- （workspace_company_profiles は既存マイグレーションで設定済みのポリシーをそのまま使う）。
-- DBスキーマ変更はこの1列に限定する（Procedure Master・他テーブルへの変更は行わない）。
-- CHECK制約は不要（任意の日付を許容するため。列自体がNULL許容であることが「未設定」を表す）。
-- ============================================================

ALTER TABLE workspace_company_profiles
  ADD COLUMN IF NOT EXISTS next_officer_change_date DATE;

-- ============================================================
-- 確認クエリ
-- ============================================================

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'workspace_company_profiles' AND column_name = 'next_officer_change_date';

-- 既存行が全て NULL（未設定）であることを確認する
SELECT
  COUNT(*) AS 総件数,
  COUNT(next_officer_change_date) AS 設定済み件数,
  COUNT(*) - COUNT(next_officer_change_date) AS 未設定件数
FROM workspace_company_profiles;
