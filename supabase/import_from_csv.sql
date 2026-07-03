-- ============================================================
-- SUNBOO経営ナビ — CSVインポート基盤（全国対応データ投入用）
-- ============================================================
-- 目的：
--   税務署・年金事務所・労基署・ハローワーク・都税事務所・区市町村税窓口を
--   SQL手入力ではなく、CSVファイルから取り込めるようにする。
--
-- 全体の流れ（詳細は docs/全国対応データ整備ガイド.md を参照）：
--   1. supabase/import_templates/*.csv を編集する（追加したい市区町村・機関を記入）
--   2. このファイルの「STEP 1」を SQL Editor で実行し、ステージングテーブルを作成する
--   3. Supabase ダッシュボード → Table Editor → 各 staging_* テーブルを開き、
--      「Insert data → Import data from spreadsheet」で CSV をそのままインポートする
--      （CSVのヘッダー名がテーブルの列名と一致しているため、自動でマッピングされる）
--   4. このファイルの「STEP 2」を SQL Editor で実行し、
--      staging テーブルの内容を本番テーブルへ ON CONFLICT DO UPDATE でマージする
--   5. 「STEP 3」の確認クエリで反映結果を確認する
--   6. 「STEP 4（任意）」で staging テーブルを空にしておく（次回インポートに備える）
--
-- 冪等性：
--   何度実行しても安全です。同じ muni_code / office_type の組み合わせは
--   UPDATE として扱われ、重複行は作られません。
-- ============================================================


-- ============================================================
-- STEP 1: ステージングテーブルの作成（初回のみ実行すればOK。再実行しても安全）
-- ============================================================
-- ステージングテーブルは「CSVをそのまま流し込むための一時置き場」です。
-- 本番テーブルのように外部キーやUNIQUE制約を持たない、フラットな構造にしています。

CREATE TABLE IF NOT EXISTS staging_municipalities (
  pref_code TEXT,
  pref_name TEXT,
  muni_code TEXT,
  muni_name TEXT
);

CREATE TABLE IF NOT EXISTS staging_jurisdiction_offices (
  muni_code   TEXT,
  office_type TEXT,
  name        TEXT,
  address     TEXT,
  phone       TEXT,
  website_url TEXT,
  map_url     TEXT
);

CREATE TABLE IF NOT EXISTS staging_official_links (
  muni_code            TEXT,
  office_type          TEXT,
  official_url         TEXT,
  official_url_status  TEXT,
  fallback_url         TEXT
);


-- ============================================================
-- STEP 2: staging → 本番テーブルへのマージ
-- ============================================================
-- 【重要】STEP 1 の CSV インポートを終えてから実行してください。
-- import_templates/*.csv を全部インポートしていない場合、
-- 対応する INSERT/UPDATE 文はコメントアウトするか、該当ブロックだけ実行してください。

-- ── 2-1. municipalities.csv → prefectures / municipalities ──

INSERT INTO prefectures (code, name)
SELECT DISTINCT pref_code, pref_name
FROM staging_municipalities
WHERE pref_code IS NOT NULL AND pref_code <> ''
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name;

INSERT INTO municipalities (prefecture_id, code, name)
SELECT p.id, s.muni_code, s.muni_name
FROM staging_municipalities s
JOIN prefectures p ON p.code = s.pref_code
WHERE s.muni_code IS NOT NULL AND s.muni_code <> ''
ON CONFLICT (code) DO UPDATE SET
  name          = EXCLUDED.name,
  prefecture_id = EXCLUDED.prefecture_id;

-- ── 2-2. jurisdiction_offices.csv → jurisdiction_offices ──
-- キー: (municipality_id, office_type)
-- ※ この時点で municipalities に対象の muni_code が存在している必要があります
--    （2-1 を先に実行するか、既存の市区町村であること）

INSERT INTO jurisdiction_offices (
  municipality_id, office_type, name, address, phone, website_url, map_url
)
SELECT
  m.id,
  s.office_type,
  s.name,
  NULLIF(s.address, ''),
  NULLIF(s.phone, ''),
  NULLIF(s.website_url, ''),
  NULLIF(s.map_url, '')
FROM staging_jurisdiction_offices s
JOIN municipalities m ON m.code = s.muni_code
WHERE s.office_type IS NOT NULL AND s.office_type <> ''
ON CONFLICT (municipality_id, office_type) DO UPDATE SET
  name        = EXCLUDED.name,
  address     = COALESCE(EXCLUDED.address, jurisdiction_offices.address),
  phone       = COALESCE(EXCLUDED.phone, jurisdiction_offices.phone),
  website_url = COALESCE(EXCLUDED.website_url, jurisdiction_offices.website_url),
  map_url     = COALESCE(EXCLUDED.map_url, jurisdiction_offices.map_url);

-- ── 2-3. official_links.csv → jurisdiction_offices の公式リンク系カラム ──
-- キー: (municipality_id, office_type)
-- ※ official_links テーブル（procedures 用・全国共通の手続きリンク）とは別物です。
--    ここで更新するのは jurisdiction_offices.official_url 系カラム
--    （機関ごとの「自分のページが生きているか」を管理する列）です。
--    詳しくは docs/全国対応データ整備ガイド.md の「公式リンクの扱い」を参照してください。
-- ※ 対象の jurisdiction_offices 行が先に存在している必要があるため、
--    2-2 を先に実行してください。

UPDATE jurisdiction_offices jo
SET
  official_url            = NULLIF(s.official_url, ''),
  official_url_status     = COALESCE(NULLIF(s.official_url_status, ''), 'unchecked'),
  official_url_checked_at = CASE
    WHEN NULLIF(s.official_url_status, '') IS NOT NULL THEN NOW()
    ELSE jo.official_url_checked_at
  END,
  fallback_url             = NULLIF(s.fallback_url, '')
FROM staging_official_links s
JOIN municipalities m ON m.code = s.muni_code
WHERE jo.municipality_id = m.id
  AND jo.office_type     = s.office_type;


-- ============================================================
-- STEP 3: 反映結果の確認
-- ============================================================

SELECT
  pref.name AS prefecture,
  m.name    AS municipality,
  m.code    AS muni_code,
  jo.office_type,
  jo.name,
  jo.official_url_status,
  CASE WHEN jo.official_url IS NOT NULL THEN '✓' ELSE '✗' END AS official_url,
  CASE WHEN jo.fallback_url IS NOT NULL THEN '✓' ELSE '✗' END AS fallback_url
FROM jurisdiction_offices jo
JOIN municipalities m ON m.id = jo.municipality_id
JOIN prefectures pref ON pref.id = m.prefecture_id
ORDER BY pref.code, m.code, jo.office_type;


-- ============================================================
-- STEP 4（任意）: 次回インポートに備えて staging テーブルを空にする
-- ============================================================
-- 前回分のデータが残ったまま次のCSVをインポートすると重複行が増えるため、
-- 新しいCSVをインポートする前に毎回 TRUNCATE することを推奨します。

-- TRUNCATE staging_municipalities;
-- TRUNCATE staging_jurisdiction_offices;
-- TRUNCATE staging_official_links;
