-- ============================================================
-- SUNBOO経営ナビ — 重複データ削除 & UNIQUE制約追加
-- ============================================================
-- Supabase SQL Editor でこのファイルを丸ごと実行してください。
-- 実行順: 1) 重複削除 → 2) UNIQUE制約追加 → 3) 件数確認
-- ============================================================

-- ── 1. 重複削除 ─────────────────────────────────────────────

-- jurisdiction_offices: (municipality_id, office_type) の重複を削除
-- id が最小のレコードを残す
DELETE FROM jurisdiction_offices a
USING jurisdiction_offices b
WHERE a.id > b.id
  AND a.municipality_id = b.municipality_id
  AND a.office_type     = b.office_type;

-- official_links: (procedure_id, url) の重複を削除
DELETE FROM official_links a
USING official_links b
WHERE a.id > b.id
  AND a.procedure_id = b.procedure_id
  AND a.url          = b.url;

-- procedure_documents: (procedure_id, name) の重複を削除
DELETE FROM procedure_documents a
USING procedure_documents b
WHERE a.id > b.id
  AND a.procedure_id = b.procedure_id
  AND a.name         = b.name;

-- ── 2. UNIQUE制約の追加（再実行安全: DROP IF EXISTS → ADD） ──

-- jurisdiction_offices
ALTER TABLE jurisdiction_offices
  DROP CONSTRAINT IF EXISTS uq_jurisdiction_offices_muni_type;
ALTER TABLE jurisdiction_offices
  ADD CONSTRAINT uq_jurisdiction_offices_muni_type
  UNIQUE (municipality_id, office_type);

-- official_links
ALTER TABLE official_links
  DROP CONSTRAINT IF EXISTS uq_official_links_proc_url;
ALTER TABLE official_links
  ADD CONSTRAINT uq_official_links_proc_url
  UNIQUE (procedure_id, url);

-- procedure_documents
ALTER TABLE procedure_documents
  DROP CONSTRAINT IF EXISTS uq_procedure_documents_proc_name;
ALTER TABLE procedure_documents
  ADD CONSTRAINT uq_procedure_documents_proc_name
  UNIQUE (procedure_id, name);

-- ── 3. 件数確認 ──────────────────────────────────────────────
-- 実行後に結果が表示されます。
-- 期待値: prefectures=1, municipalities=1, jurisdiction_offices=6,
--         procedures=10, official_links=10

SELECT 'prefectures'         AS table_name, COUNT(*) AS count FROM prefectures
UNION ALL
SELECT 'municipalities',       COUNT(*) FROM municipalities
UNION ALL
SELECT 'jurisdiction_offices', COUNT(*) FROM jurisdiction_offices
UNION ALL
SELECT 'procedures',           COUNT(*) FROM procedures
UNION ALL
SELECT 'official_links',       COUNT(*) FROM official_links
UNION ALL
SELECT 'procedure_documents',  COUNT(*) FROM procedure_documents;
