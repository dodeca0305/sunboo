-- ============================================================
-- SUNBOO経営ナビ — procedure_documents へ item_type 追加（Sprint53設計・Sprint54実装想定）
-- ============================================================
-- 設計根拠: docs/ROADMAP_REQUIRED_DOCUMENTS_GUIDE_DESIGN.md（Sprint53、設計レビュー承認済み）
--
-- 【本ファイルはSprint53時点では未実行】。実装Sprint（Sprint54想定）でのレビュー後、
-- Supabase SQL Editorで実行してください。
-- 再実行しても安全（IF NOT EXISTS / DOブロックでの事前存在チェックを使用）。
--
-- 本マイグレーションが行うこと:
--   1. procedure_documents へ item_type 列を追加（NOT NULL DEFAULT 'document'、CHECK制約付き）。
--      既存33件は列追加時点のDEFAULTにより自動的に 'document'（書類）で補完される
--      （docs/ROADMAP_REQUIRED_DOCUMENTS_GUIDE_DESIGN.md 8-3節で全33件の内容を確認済み、
--      いずれも物理的な書類・証明書類でありpreparation/checklistに該当するものは無い）
--
-- 新しいテーブルは作らないため、GRANT / RLS の追加設定は不要
-- （procedure_documents は既存マイグレーション（schema.sql・grant_public_read.sql等）で
-- 設定済みのポリシーをそのまま使う）。
-- ============================================================

-- ============================================================
-- 1. procedure_documents へ列追加
-- ============================================================
-- 【再実行安全性】ADD COLUMN IF NOT EXISTS のため2回目以降は何もしない。
-- 【既存データの補完】列追加時に DEFAULT 'document' を指定しているため、追加時点で存在する
--   既存33行にも自動的に 'document' が入る（PostgreSQLは定数DEFAULT付きの列追加をメタデータ操作
--   のみで完了し、既存行を「そのDEFAULT値を持つもの」として扱う。別途UPDATE文は不要）。

ALTER TABLE procedure_documents
  ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT 'document';

-- CHECK制約はADD COLUMN IF NOT EXISTSのように冪等な構文が無いため、事前に存在確認してから追加する
-- （再実行時の duplicate_object エラーを避ける。Sprint47のresident_tax_payment_cycleと同じパターン）。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'procedure_documents_item_type_check'
  ) THEN
    ALTER TABLE procedure_documents
      ADD CONSTRAINT procedure_documents_item_type_check
      CHECK (item_type IN ('document', 'preparation', 'checklist'));
  END IF;
END $$;

-- ============================================================
-- 2. 確認クエリ
-- ============================================================

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'procedure_documents' AND column_name = 'item_type';

-- 既存33件が全て 'document' に補完されていることを確認する
SELECT item_type, COUNT(*) AS 件数
FROM procedure_documents
GROUP BY item_type
ORDER BY item_type;
