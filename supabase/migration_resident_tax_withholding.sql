-- ============================================================
-- SUNBOO経営ナビ — 住民税特別徴収 対応（Sprint47）
-- ============================================================
-- 設計根拠: docs/RESIDENT_TAX_SUPPORT_DESIGN.md（Sprint46、設計レビュー承認済み）
--
-- Supabase ダッシュボード → SQL Editor で実行してください。
-- 再実行しても安全（IF NOT EXISTS / ON CONFLICT / DOブロックでの事前存在チェックを使用）。
--
-- 本マイグレーションが行うこと:
--   1. workspace_company_profiles へ resident_tax_payment_cycle 列を追加（NOT NULL DEFAULT 'unknown'、
--      CHECK制約付き）。既存行は列追加時点のDEFAULTにより自動的に 'unknown'（未設定）で補完される
--   2. procedures へ RESIDENT_TAX_WITHHOLDING（特別徴収税額の納付）を1件追加
--
-- 新しいテーブルは作らないため、GRANT / RLS の追加設定は不要
-- （workspace_company_profiles / procedures は既存マイグレーションで設定済み）。
-- ============================================================

-- ============================================================
-- 1. workspace_company_profiles へ列追加
-- ============================================================
-- 【再実行安全性】ADD COLUMN IF NOT EXISTS のため2回目以降は何もしない。
-- 【既存データの補完】列追加時に DEFAULT 'unknown' を指定しているため、追加時点で存在する既存行にも
--   自動的に 'unknown' が入る（PostgreSQLは定数DEFAULT付きの列追加をメタデータ操作のみで完了し、
--   既存行を「そのDEFAULT値を持つもの」として扱う。別途UPDATE文は不要）。

ALTER TABLE workspace_company_profiles
  ADD COLUMN IF NOT EXISTS resident_tax_payment_cycle TEXT NOT NULL DEFAULT 'unknown';

-- CHECK制約はADD COLUMN IF NOT EXISTSのように冪等な構文が無いため、事前に存在確認してから追加する
-- （CLAUDE.md「一意性が必要なシードデータには必ずUNIQUE制約」と同じ考え方で、再実行時の
-- duplicate_object エラーを避ける）。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workspace_company_profiles_resident_tax_payment_cycle_check'
  ) THEN
    ALTER TABLE workspace_company_profiles
      ADD CONSTRAINT workspace_company_profiles_resident_tax_payment_cycle_check
      CHECK (resident_tax_payment_cycle IN ('unknown', 'monthly', 'special'));
  END IF;
END $$;

-- ============================================================
-- 2. procedures へ1件追加
-- ============================================================
-- 優先度: 既存の最大値が30（FINANCIAL_STATEMENT_PUBLICATION）のため、31番から採番する
-- （2026-07-12時点でSupabase実データを確認済み）。
-- timing_type は既存の WITHHOLDING_TAX と同じ 'monthly_10th' を基本形とする。納期の特例
-- （年2回）への切替は CompanyProfile.residentTaxPaymentCycle に応じて Roadmap Engine
-- （src/lib/companyProfile.ts の PERIODIC_CYCLE_OVERRIDES、src/lib/roadmap.ts）が行うため、
-- timing_data 自体は WITHHOLDING_TAX 同様 NULL のままでよい。

INSERT INTO procedures (
  code, name, description, category, requires_employees,
  office_type, frequency, timing_label, timing_type, timing_data, priority,
  is_active, corporate_type, requires_officer_term, include_in_diagnosis,
  target_note, submission_method, e_filing_system_name, e_filing_system_url, caution_note
) VALUES

('RESIDENT_TAX_WITHHOLDING',
 '特別徴収税額の納付',
 '従業員の給与から特別徴収（天引き）した個人住民税を、市区町村へ納付します。毎月10日が納期ですが、'
 '常時給与を受ける従業員が10人未満の場合は「納期の特例」により年2回（6月10日・12月10日）にまとめて'
 '納付することもできます。',
 'local_tax', TRUE, 'municipal_tax', 'monthly',
 '毎月10日（納期の特例の場合は年2回：6月10日・12月10日）',
 'monthly_10th', NULL, 31,
 TRUE, NULL, FALSE, TRUE,
 '従業員の住民税を特別徴収（給与天引き）している全ての法人（普通徴収を選択している場合は対象外）',
 '金融機関窓口への納付、または地方税お共通納税システム（eLTAX）によるオンライン納付',
 'eLTAX（地方税お共通納税システム）', 'https://www.eltax.lta.go.jp/',
 '本情報は一般的な参考情報です。毎年5月頃、市区町村から「特別徴収税額の決定通知書」が送付され、'
 '6月分の給与から新しい税額での天引きが始まります。金額の確認・納付方法・納期の特例の適用要件は'
 '税理士等の専門家にご確認ください。')

ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 3. 確認クエリ
-- ============================================================

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'workspace_company_profiles' AND column_name = 'resident_tax_payment_cycle';

SELECT code, name, category, office_type, requires_employees, timing_type, is_active, priority
FROM procedures
WHERE code = 'RESIDENT_TAX_WITHHOLDING';
