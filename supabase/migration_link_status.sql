-- ============================================================
-- SUNBOO経営ナビ — リンク切れ対策マイグレーション
-- ============================================================
-- 既存の Supabase プロジェクトに新カラムを追加します。
-- 初回のみ実行（IF NOT EXISTS で冪等性を確保）。
-- ============================================================

-- ── jurisdiction_offices に追加 ──────────────────────────────

ALTER TABLE jurisdiction_offices
  ADD COLUMN IF NOT EXISTS official_url            TEXT,
  ADD COLUMN IF NOT EXISTS official_url_status     TEXT NOT NULL DEFAULT 'unchecked',
  ADD COLUMN IF NOT EXISTS official_url_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fallback_url            TEXT;

-- 既存行: website_url を official_url にコピー
UPDATE jurisdiction_offices
SET   official_url = website_url
WHERE official_url IS NULL
  AND website_url  IS NOT NULL;

-- 既存行: official_url が設定されたら status を 'ok' に
UPDATE jurisdiction_offices
SET   official_url_status = 'ok'
WHERE official_url_status = 'unchecked'
  AND official_url IS NOT NULL;

-- office_type 別に安定した公式一覧ページを fallback_url に設定
UPDATE jurisdiction_offices SET fallback_url = 'https://www.nta.go.jp/about/organization/index.htm'
WHERE office_type = 'tax_office'       AND fallback_url IS NULL;

UPDATE jurisdiction_offices SET fallback_url = 'https://www.tax.metro.tokyo.lg.jp/about/jimusho/'
WHERE office_type = 'prefectural_tax'  AND fallback_url IS NULL;

UPDATE jurisdiction_offices SET fallback_url = 'https://www.city.shibuya.tokyo.jp/kurashi/zeikin/'
WHERE office_type = 'municipal_tax'    AND fallback_url IS NULL;

UPDATE jurisdiction_offices SET fallback_url = 'https://www.nenkin.go.jp/section/soudan/index.html'
WHERE office_type = 'pension_office'   AND fallback_url IS NULL;

UPDATE jurisdiction_offices SET fallback_url = 'https://jsite.mhlw.go.jp/tokyo-roudoukyoku/kanren_kikan/kanri_kantoku/'
WHERE office_type = 'labor_standards'  AND fallback_url IS NULL;

UPDATE jurisdiction_offices SET fallback_url = 'https://jsite.mhlw.go.jp/tokyo-hellowork/hw/'
WHERE office_type = 'hello_work'       AND fallback_url IS NULL;

-- ── official_links に追加 ────────────────────────────────────

ALTER TABLE official_links
  ADD COLUMN IF NOT EXISTS status      TEXT NOT NULL DEFAULT 'unchecked',
  ADD COLUMN IF NOT EXISTS checked_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fallback_url TEXT;

-- 既存行: status を 'ok' に（手動確認済みとして扱う）
UPDATE official_links
SET   status = 'ok'
WHERE status = 'unchecked'
  AND url IS NOT NULL;

-- 手続きコード別に安定した公式一覧ページを fallback_url に設定
UPDATE official_links SET fallback_url = 'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/hojin/'
WHERE procedure_id IN (SELECT id FROM procedures WHERE code IN ('CORP_ESTABLISH_TAX','BLUE_RETURN_APPROVAL'))
  AND fallback_url IS NULL;

UPDATE official_links SET fallback_url = 'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/gensen/'
WHERE procedure_id IN (SELECT id FROM procedures WHERE code IN ('PAYROLL_OFFICE_OPEN','WITHHOLDING_TAX'))
  AND fallback_url IS NULL;

UPDATE official_links SET fallback_url = 'https://www.nenkin.go.jp/service/kounen/kenpo-todoke/jigyo/'
WHERE procedure_id IN (SELECT id FROM procedures WHERE code IN ('SOCIAL_INS_NEW','SOCIAL_INS_SANTEIKISO'))
  AND fallback_url IS NULL;

UPDATE official_links SET fallback_url = 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/hoken/'
WHERE procedure_id IN (SELECT id FROM procedures WHERE code IN ('LABOR_INS_ESTABLISH','LABOR_INS_RENEWAL'))
  AND fallback_url IS NULL;

UPDATE official_links SET fallback_url = 'https://www.hellowork.mhlw.go.jp/insurance/'
WHERE procedure_id IN (SELECT id FROM procedures WHERE code = 'EMPLOY_INS_OFFICE')
  AND fallback_url IS NULL;

UPDATE official_links SET fallback_url = 'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/hotei/'
WHERE procedure_id IN (SELECT id FROM procedures WHERE code = 'YEAR_END_ADJUSTMENT')
  AND fallback_url IS NULL;

-- ── 確認クエリ ───────────────────────────────────────────────

SELECT
  office_type,
  name,
  official_url_status,
  CASE WHEN official_url  IS NOT NULL THEN '✓' ELSE '✗' END AS official_url,
  CASE WHEN fallback_url  IS NOT NULL THEN '✓' ELSE '✗' END AS fallback_url
FROM jurisdiction_offices
ORDER BY id;

SELECT
  p.code,
  ol.label,
  ol.status,
  CASE WHEN ol.fallback_url IS NOT NULL THEN '✓' ELSE '✗' END AS fallback
FROM official_links ol
JOIN procedures p ON ol.procedure_id = p.id
ORDER BY p.priority;
