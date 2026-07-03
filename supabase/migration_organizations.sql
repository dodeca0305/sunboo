-- ============================================================
-- SUNBOO経営ナビ — 行政機関マスター再構築マイグレーション（Phase 1.5）
-- ============================================================
-- Supabase ダッシュボード → SQL Editor で実行してください。
-- 再実行しても安全（IF NOT EXISTS / ON CONFLICT を使用）。
-- 旧 jurisdiction_offices テーブルは削除しません（ロールバック用に残す。
-- 動作確認後、ファイル末尾のコメントアウトされたDROP文で手動削除できます）。
-- ============================================================

-- ============================================================
-- 1. スキーマ定義
-- ============================================================

CREATE TABLE IF NOT EXISTS organization_types (
  id         SERIAL PRIMARY KEY,
  code       TEXT   NOT NULL UNIQUE,   -- procedures.office_type と同じ値体系
  name       TEXT   NOT NULL,
  description TEXT,
  sort_order INT    NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS organizations (
  id                    SERIAL      PRIMARY KEY,
  organization_type_id  INT         NOT NULL REFERENCES organization_types(id),
  name                  TEXT        NOT NULL,
  official_url          TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_type_id, name)
);

CREATE TABLE IF NOT EXISTS organization_offices (
  id                      SERIAL      PRIMARY KEY,
  organization_id         INT         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                    TEXT        NOT NULL,
  postal_code             TEXT,
  address                 TEXT,
  phone                   TEXT,
  fax                     TEXT,
  email                   TEXT,
  website_url             TEXT,
  official_url            TEXT,
  e_filing_url            TEXT,
  download_page_url       TEXT,
  map_url                 TEXT,
  business_hours          TEXT,
  notes                   TEXT,
  official_url_status     TEXT        NOT NULL DEFAULT 'unchecked',
  official_url_checked_at TIMESTAMPTZ,
  fallback_url            TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS jurisdictions (
  id                      SERIAL PRIMARY KEY,
  municipality_id         INT    NOT NULL REFERENCES municipalities(id),
  organization_type_id    INT    NOT NULL REFERENCES organization_types(id),
  organization_office_id  INT    NOT NULL REFERENCES organization_offices(id),
  UNIQUE (municipality_id, organization_type_id)
);

CREATE TABLE IF NOT EXISTS procedure_organizations (
  id                    SERIAL  PRIMARY KEY,
  procedure_id          INT     NOT NULL REFERENCES procedures(id) ON DELETE CASCADE,
  organization_type_id  INT     NOT NULL REFERENCES organization_types(id),
  is_primary            BOOLEAN NOT NULL DEFAULT TRUE,
  notes                 TEXT,
  UNIQUE (procedure_id, organization_type_id)
);

CREATE INDEX IF NOT EXISTS idx_organizations_type           ON organizations(organization_type_id);
CREATE INDEX IF NOT EXISTS idx_organization_offices_org     ON organization_offices(organization_id);
CREATE INDEX IF NOT EXISTS idx_jurisdictions_muni           ON jurisdictions(municipality_id);
CREATE INDEX IF NOT EXISTS idx_jurisdictions_org_type       ON jurisdictions(organization_type_id);
CREATE INDEX IF NOT EXISTS idx_procedure_organizations_proc ON procedure_organizations(procedure_id);

-- ============================================================
-- 2. 機関種別マスタ（13種）
-- ============================================================
INSERT INTO organization_types (code, name, description, sort_order) VALUES
  ('legal_affairs_bureau', '法務局',         '商業・法人登記、不動産登記、証明書発行', 1),
  ('tax_office',           '税務署',         '法人税・源泉所得税等の国税', 2),
  ('pension_office',       '年金事務所',     '健康保険・厚生年金保険', 3),
  ('labor_standards',      '労働基準監督署', '労災保険・労働基準', 4),
  ('hello_work',           'ハローワーク',   '雇用保険・職業紹介', 5),
  ('prefectural_tax',      '都道府県税事務所', '法人都道府県民税・事業税', 6),
  ('municipal_tax',        '市区町村税務課', '法人住民税', 7),
  ('prefectural_office',   '都道府県庁',     '各種許認可・補助金', 8),
  ('municipal_office',     '市区町村役場',   '各種許認可・補助金', 9),
  ('health_center',        '保健所',         '飲食業・医療関連等の許認可', 10),
  ('fire_department',      '消防署',         '防火対象物使用開始届等', 11),
  ('chamber_of_commerce',  '商工会議所',     '経営相談・各種証明', 12),
  ('other',                'その他',         NULL, 99)
ON CONFLICT (code) DO NOTHING;

-- procedures.office_type に参照整合性を追加（値は変更不要、既存文字列がそのまま organization_types.code になる）
-- organization_types のシード投入後に実行する必要がある（既存 procedures 行の値を検証するため）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_procedures_office_type') THEN
    ALTER TABLE procedures
      ADD CONSTRAINT fk_procedures_office_type
      FOREIGN KEY (office_type) REFERENCES organization_types(code);
  END IF;
END $$;

-- ============================================================
-- 3. 福岡県 市区町村マスタ（72件：北九州市7区・福岡市7区を含む）
-- ============================================================
INSERT INTO prefectures (code, name) VALUES ('40', '福岡県')
ON CONFLICT (code) DO NOTHING;

INSERT INTO municipalities (prefecture_id, code, name)
SELECT p.id, v.code, v.name
FROM prefectures p,
(VALUES
  ('401013', '北九州市門司区'), ('401030', '北九州市若松区'), ('401056', '北九州市戸畑区'),
  ('401064', '北九州市小倉北区'), ('401072', '北九州市小倉南区'), ('401081', '北九州市八幡東区'),
  ('401099', '北九州市八幡西区'),
  ('401315', '福岡市東区'), ('401323', '福岡市博多区'), ('401331', '福岡市中央区'),
  ('401340', '福岡市南区'), ('401358', '福岡市西区'), ('401366', '福岡市城南区'), ('401374', '福岡市早良区'),
  ('402028', '大牟田市'), ('402036', '久留米市'), ('402044', '直方市'), ('402052', '飯塚市'),
  ('402061', '田川市'), ('402079', '柳川市'), ('402109', '八女市'), ('402117', '筑後市'),
  ('402125', '大川市'), ('402133', '行橋市'), ('402141', '豊前市'), ('402150', '中間市'),
  ('402168', '小郡市'), ('402176', '筑紫野市'), ('402184', '春日市'), ('402192', '大野城市'),
  ('402206', '宗像市'), ('402214', '太宰府市'), ('402231', '古賀市'), ('402249', '福津市'),
  ('402257', 'うきは市'), ('402265', '宮若市'), ('402273', '嘉麻市'), ('402281', '朝倉市'),
  ('402290', 'みやま市'), ('402303', '糸島市'), ('402311', '那珂川市'),
  ('403415', '糟屋郡宇美町'), ('403423', '糟屋郡篠栗町'), ('403431', '糟屋郡志免町'),
  ('403440', '糟屋郡須恵町'), ('403458', '糟屋郡新宮町'), ('403482', '糟屋郡久山町'),
  ('403491', '糟屋郡粕屋町'),
  ('403814', '遠賀郡芦屋町'), ('403822', '遠賀郡水巻町'), ('403831', '遠賀郡岡垣町'),
  ('403849', '遠賀郡遠賀町'),
  ('404012', '鞍手郡小竹町'), ('404021', '鞍手郡鞍手町'),
  ('404217', '嘉穂郡桂川町'),
  ('404471', '朝倉郡筑前町'), ('404489', '朝倉郡東峰村'),
  ('405035', '三井郡大刀洗町'),
  ('405221', '三潴郡大木町'),
  ('405442', '八女郡広川町'),
  ('406015', '田川郡香春町'), ('406023', '田川郡添田町'), ('406040', '田川郡糸田町'),
  ('406058', '田川郡川崎町'), ('406082', '田川郡大任町'), ('406091', '田川郡赤村'),
  ('406104', '田川郡福智町'),
  ('406210', '京都郡苅田町'), ('406252', '京都郡みやこ町'),
  ('406422', '築上郡吉富町'), ('406465', '築上郡上毛町'), ('406473', '築上郡築上町')
) AS v(code, name)
WHERE p.code = '40'
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 4. 機関投入ヘルパーの使い方
-- ============================================================
-- 以降、1機関＝1つの WITH チェーンで「organizations → organization_offices → jurisdictions」を
-- まとめて冪等投入する。同じ形を福岡県の全カテゴリで繰り返す。

-- ── 東京都渋谷区（既存7機関の再構築） ─────────────────────────

WITH org AS (
  INSERT INTO organizations (organization_type_id, name)
  SELECT id, '渋谷税務署' FROM organization_types WHERE code = 'tax_office'
  ON CONFLICT (organization_type_id, name) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
), office AS (
  INSERT INTO organization_offices (organization_id, name, address, phone, website_url, official_url, official_url_status, map_url, fallback_url)
  SELECT org.id, '渋谷税務署', '東京都渋谷区神山町10番地', '03-3461-5511',
    'https://www.nta.go.jp/about/organization/tokyo/shokatsu/shibuya/index.htm',
    'https://www.nta.go.jp/about/organization/tokyo/shokatsu/shibuya/index.htm', 'ok',
    'https://maps.google.com/?q=渋谷税務署', 'https://www.nta.go.jp/about/organization/index.htm'
  FROM org
  ON CONFLICT (organization_id, name) DO UPDATE SET address = EXCLUDED.address
  RETURNING id
)
INSERT INTO jurisdictions (municipality_id, organization_type_id, organization_office_id)
SELECT m.id, ot.id, office.id
FROM office, organization_types ot, municipalities m
WHERE ot.code = 'tax_office' AND m.code IN ('13113')
ON CONFLICT (municipality_id, organization_type_id) DO UPDATE SET organization_office_id = EXCLUDED.organization_office_id;

WITH org AS (
  INSERT INTO organizations (organization_type_id, name)
  SELECT id, '東京都渋谷都税事務所' FROM organization_types WHERE code = 'prefectural_tax'
  ON CONFLICT (organization_type_id, name) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
), office AS (
  INSERT INTO organization_offices (organization_id, name, address, phone, website_url, official_url, official_url_status, map_url, fallback_url)
  SELECT org.id, '東京都渋谷都税事務所', '東京都渋谷区宇田川町1番18号', '03-3464-1311',
    'https://www.tax.metro.tokyo.lg.jp/about/jimusho/shibuya.html',
    'https://www.tax.metro.tokyo.lg.jp/about/jimusho/shibuya.html', 'ok',
    'https://maps.google.com/?q=東京都渋谷都税事務所', 'https://www.tax.metro.tokyo.lg.jp/about/jimusho/'
  FROM org
  ON CONFLICT (organization_id, name) DO UPDATE SET address = EXCLUDED.address
  RETURNING id
)
INSERT INTO jurisdictions (municipality_id, organization_type_id, organization_office_id)
SELECT m.id, ot.id, office.id
FROM office, organization_types ot, municipalities m
WHERE ot.code = 'prefectural_tax' AND m.code IN ('13113')
ON CONFLICT (municipality_id, organization_type_id) DO UPDATE SET organization_office_id = EXCLUDED.organization_office_id;

WITH org AS (
  INSERT INTO organizations (organization_type_id, name)
  SELECT id, '渋谷区役所（税務課）' FROM organization_types WHERE code = 'municipal_tax'
  ON CONFLICT (organization_type_id, name) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
), office AS (
  INSERT INTO organization_offices (organization_id, name, address, phone, website_url, official_url, official_url_status, map_url, fallback_url)
  SELECT org.id, '渋谷区役所（税務課）', '東京都渋谷区宇田川町1番1号', '03-3463-1211',
    'https://www.city.shibuya.tokyo.jp/kurashi/zeikin/hojin/',
    'https://www.city.shibuya.tokyo.jp/kurashi/zeikin/hojin/', 'ok',
    'https://maps.google.com/?q=渋谷区役所', 'https://www.city.shibuya.tokyo.jp/kurashi/zeikin/'
  FROM org
  ON CONFLICT (organization_id, name) DO UPDATE SET address = EXCLUDED.address
  RETURNING id
)
INSERT INTO jurisdictions (municipality_id, organization_type_id, organization_office_id)
SELECT m.id, ot.id, office.id
FROM office, organization_types ot, municipalities m
WHERE ot.code = 'municipal_tax' AND m.code IN ('13113')
ON CONFLICT (municipality_id, organization_type_id) DO UPDATE SET organization_office_id = EXCLUDED.organization_office_id;

WITH org AS (
  INSERT INTO organizations (organization_type_id, name)
  SELECT id, '渋谷年金事務所' FROM organization_types WHERE code = 'pension_office'
  ON CONFLICT (organization_type_id, name) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
), office AS (
  INSERT INTO organization_offices (organization_id, name, address, phone, website_url, official_url, official_url_status, map_url, fallback_url)
  SELECT org.id, '渋谷年金事務所', '東京都渋谷区渋谷1丁目17番1号', '03-3462-1723',
    'https://www.nenkin.go.jp/section/soudan/tokyo/shibuya.html',
    'https://www.nenkin.go.jp/section/soudan/tokyo/shibuya.html', 'ok',
    'https://maps.google.com/?q=渋谷年金事務所', 'https://www.nenkin.go.jp/section/soudan/index.html'
  FROM org
  ON CONFLICT (organization_id, name) DO UPDATE SET address = EXCLUDED.address
  RETURNING id
)
INSERT INTO jurisdictions (municipality_id, organization_type_id, organization_office_id)
SELECT m.id, ot.id, office.id
FROM office, organization_types ot, municipalities m
WHERE ot.code = 'pension_office' AND m.code IN ('13113')
ON CONFLICT (municipality_id, organization_type_id) DO UPDATE SET organization_office_id = EXCLUDED.organization_office_id;

WITH org AS (
  INSERT INTO organizations (organization_type_id, name)
  SELECT id, '渋谷労働基準監督署' FROM organization_types WHERE code = 'labor_standards'
  ON CONFLICT (organization_type_id, name) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
), office AS (
  INSERT INTO organization_offices (organization_id, name, address, phone, website_url, official_url, official_url_status, map_url, fallback_url)
  SELECT org.id, '渋谷労働基準監督署', '東京都渋谷区神南1丁目3番5号', '03-3780-6811',
    'https://jsite.mhlw.go.jp/tokyo-roudoukyoku/kanren_kikan/kanri_kantoku/shibuya.html',
    'https://jsite.mhlw.go.jp/tokyo-roudoukyoku/kanren_kikan/kanri_kantoku/shibuya.html', 'ok',
    'https://maps.google.com/?q=渋谷労働基準監督署', 'https://jsite.mhlw.go.jp/tokyo-roudoukyoku/kanren_kikan/kanri_kantoku/'
  FROM org
  ON CONFLICT (organization_id, name) DO UPDATE SET address = EXCLUDED.address
  RETURNING id
)
INSERT INTO jurisdictions (municipality_id, organization_type_id, organization_office_id)
SELECT m.id, ot.id, office.id
FROM office, organization_types ot, municipalities m
WHERE ot.code = 'labor_standards' AND m.code IN ('13113')
ON CONFLICT (municipality_id, organization_type_id) DO UPDATE SET organization_office_id = EXCLUDED.organization_office_id;

WITH org AS (
  INSERT INTO organizations (organization_type_id, name)
  SELECT id, 'ハローワーク渋谷' FROM organization_types WHERE code = 'hello_work'
  ON CONFLICT (organization_type_id, name) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
), office AS (
  INSERT INTO organization_offices (organization_id, name, address, phone, website_url, official_url, official_url_status, map_url, fallback_url)
  SELECT org.id, 'ハローワーク渋谷', '東京都渋谷区神南1丁目3番5号', '03-3476-8609',
    'https://jsite.mhlw.go.jp/tokyo-hellowork/hw/shibuya/',
    'https://jsite.mhlw.go.jp/tokyo-hellowork/hw/shibuya/', 'ok',
    'https://maps.google.com/?q=ハローワーク渋谷', 'https://jsite.mhlw.go.jp/tokyo-hellowork/hw/'
  FROM org
  ON CONFLICT (organization_id, name) DO UPDATE SET address = EXCLUDED.address
  RETURNING id
)
INSERT INTO jurisdictions (municipality_id, organization_type_id, organization_office_id)
SELECT m.id, ot.id, office.id
FROM office, organization_types ot, municipalities m
WHERE ot.code = 'hello_work' AND m.code IN ('13113')
ON CONFLICT (municipality_id, organization_type_id) DO UPDATE SET organization_office_id = EXCLUDED.organization_office_id;

WITH org AS (
  INSERT INTO organizations (organization_type_id, name)
  SELECT id, '東京法務局' FROM organization_types WHERE code = 'legal_affairs_bureau'
  ON CONFLICT (organization_type_id, name) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
), office AS (
  INSERT INTO organization_offices (organization_id, name, postal_code, address, phone, website_url, official_url, official_url_status, map_url, fallback_url)
  SELECT org.id, '東京法務局渋谷出張所', '150-8301', '東京都渋谷区宇田川町1番10号（渋谷地方合同庁舎）', '03-3463-7671',
    'https://houmukyoku.moj.go.jp/tokyo/table/shikyokutou/all/shibuya.html',
    'https://houmukyoku.moj.go.jp/tokyo/table/shikyokutou/all/shibuya.html', 'unchecked',
    'https://maps.google.com/?q=東京法務局渋谷出張所', 'https://houmukyoku.moj.go.jp/tokyo/table/shikyokutou/all.html'
  FROM org
  ON CONFLICT (organization_id, name) DO UPDATE SET address = EXCLUDED.address
  RETURNING id
)
INSERT INTO jurisdictions (municipality_id, organization_type_id, organization_office_id)
SELECT m.id, ot.id, office.id
FROM office, organization_types ot, municipalities m
WHERE ot.code = 'legal_affairs_bureau' AND m.code IN ('13113')
ON CONFLICT (municipality_id, organization_type_id) DO UPDATE SET organization_office_id = EXCLUDED.organization_office_id;

-- ============================================================
-- 5. 福岡県 行政機関データ
-- ============================================================
-- 調査情報源：
--   法務局: houmukyoku.moj.go.jp/fukuoka（取扱事務一覧表・管轄区域ページ）
--   税務署: nta.go.jp/about/organization/fukuoka/location/fukuoka.htm
--   年金事務所: nenkin.go.jp/section/soudan/kankatsu/kankatsu_fukuoka.html
--   労働基準監督署・ハローワーク: jsite.mhlw.go.jp/fukuoka-roudoukyoku
-- 住所・電話は上記公式ページから転記。FAX/メール/営業時間は情報源に明記がないため未入力（NULLのまま）。
-- 一部、複数機関が同一市区町村を共同管轄しているケースがあり、SUNBOOの1市区町村=1窓口という
-- 制約上どちらか一方に確定させた箇所がある（該当オフィスのnotesに詳細を記載）。

-- 投入用ヘルパー関数（このセクション内でのみ使用し、末尾で削除する）
CREATE OR REPLACE FUNCTION _sunboo_upsert_office(
  p_type_code TEXT,
  p_org_name TEXT,
  p_office_name TEXT,
  p_postal TEXT,
  p_address TEXT,
  p_phone TEXT,
  p_official_url TEXT,
  p_fallback_url TEXT,
  p_notes TEXT,
  p_muni_codes TEXT[]
) RETURNS VOID AS $$
DECLARE
  v_org_id INT;
  v_office_id INT;
  v_type_id INT;
BEGIN
  SELECT id INTO v_type_id FROM organization_types WHERE code = p_type_code;

  INSERT INTO organizations (organization_type_id, name)
  VALUES (v_type_id, p_org_name)
  ON CONFLICT (organization_type_id, name) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_org_id;

  INSERT INTO organization_offices
    (organization_id, name, postal_code, address, phone, official_url, website_url, official_url_status, fallback_url, notes, map_url)
  VALUES
    (v_org_id, p_office_name, p_postal, p_address, p_phone, p_official_url, p_official_url, 'unchecked', p_fallback_url, p_notes,
     'https://maps.google.com/?q=' || p_office_name)
  ON CONFLICT (organization_id, name) DO UPDATE SET
    postal_code = EXCLUDED.postal_code, address = EXCLUDED.address, phone = EXCLUDED.phone,
    official_url = EXCLUDED.official_url, fallback_url = EXCLUDED.fallback_url, notes = EXCLUDED.notes
  RETURNING id INTO v_office_id;

  INSERT INTO jurisdictions (municipality_id, organization_type_id, organization_office_id)
  SELECT m.id, v_type_id, v_office_id FROM municipalities m WHERE m.code = ANY(p_muni_codes)
  ON CONFLICT (municipality_id, organization_type_id) DO UPDATE SET organization_office_id = EXCLUDED.organization_office_id;
END;
$$ LANGUAGE plpgsql;

-- ── 5-1. 法務局（商業・法人登記の申請は本局・北九州支局の2庁に集約） ──
-- 情報源: houmukyoku.moj.go.jp/fukuoka/table/shikyokutou/all/honkyoku.html, .../kitakyusyu.html

SELECT _sunboo_upsert_office('legal_affairs_bureau', '福岡法務局', '福岡法務局', '810-8513',
  '福岡市中央区舞鶴3丁目5番25号', '092-721-4570',
  'https://houmukyoku.moj.go.jp/fukuoka/table/shikyokutou/all/honkyoku.html',
  'https://houmukyoku.moj.go.jp/fukuoka/table/shikyokutou/all00.html',
  NULL,
  ARRAY['401315','401323','401331','401340','401358','401366','401374', -- 福岡市7区
    '402028','402036','402052','402079','402109','402117','402125','402168','402176','402184','402192',
    '402206','402214','402231','402249','402257','402273','402281','402290','402303','402311',
    '403415','403423','403431','403440','403458','403482','403491', -- 糟屋郡
    '404217', -- 嘉穂郡桂川町
    '404471','404489', -- 朝倉郡
    '405035', -- 三井郡大刀洗町
    '405221', -- 三潴郡大木町
    '405442']); -- 八女郡広川町

SELECT _sunboo_upsert_office('legal_affairs_bureau', '福岡法務局', '福岡法務局北九州支局', '803-8513',
  '北九州市小倉北区城内5番1号（小倉合同庁舎）', '093-561-3542',
  'https://houmukyoku.moj.go.jp/fukuoka/table/shikyokutou/all/kitakyusyu.html',
  'https://houmukyoku.moj.go.jp/fukuoka/table/shikyokutou/all00.html',
  NULL,
  ARRAY['401013','401030','401056','401064','401072','401081','401099', -- 北九州市7区
    '402044','402061','402133','402141','402150','402265',
    '403814','403822','403831','403849', -- 遠賀郡
    '404012','404021', -- 鞍手郡
    '406015','406023','406040','406058','406082','406091','406104', -- 田川郡
    '406210','406252', -- 京都郡
    '406422','406465','406473']); -- 築上郡

-- ── 5-2. 税務署（18署） ──
-- 情報源: nta.go.jp/about/organization/fukuoka/location/fukuoka/{slug}/index.htm

SELECT _sunboo_upsert_office('tax_office', '甘木税務署', '甘木税務署', '838-0061', '朝倉市菩提寺565-1', '0946-22-2720',
  'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka/amagi/index.htm',
  'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka.htm', NULL,
  ARRAY['402281','404471','404489']);

SELECT _sunboo_upsert_office('tax_office', '飯塚税務署', '飯塚税務署', '820-8603', '飯塚市芳雄町13-6 飯塚合同庁舎', '0948-22-6710',
  'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka/iizuka/index.htm',
  'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka.htm', NULL,
  ARRAY['402052','402273','404217']);

SELECT _sunboo_upsert_office('tax_office', '大川税務署', '大川税務署', '831-8686', '大川市大字榎津325の1', '0944-87-2125',
  'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka/okawa/index.htm',
  'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka.htm', NULL,
  ARRAY['402125','405221']);

SELECT _sunboo_upsert_office('tax_office', '大牟田税務署', '大牟田税務署', '836-8686', '大牟田市不知火町1丁目3番地16', '0944-52-3245',
  'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka/omuta/index.htm',
  'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka.htm', NULL,
  ARRAY['402028','402079','402290']);

SELECT _sunboo_upsert_office('tax_office', '香椎税務署', '香椎税務署', '813-8681', '福岡市東区千早6丁目2番1号', '092-661-1031',
  'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka/kashii/index.htm',
  'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka.htm',
  '福岡市東区の一部は博多税務署が管轄する場合があります（公式サイト上、区内の詳細な境界は町名レベルでは非公開）。正確な管轄は国税庁の管轄税務署検索でご確認ください。',
  ARRAY['401315','402206','402231','402249','403415','403423','403431','403440','403458','403482','403491']);

SELECT _sunboo_upsert_office('tax_office', '久留米税務署', '久留米税務署', '830-8688', '久留米市諏訪野町2401の10', '0942-32-4461',
  'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka/kurume/index.htm',
  'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka.htm', NULL,
  ARRAY['402036','402168','402257','405035']);

SELECT _sunboo_upsert_office('tax_office', '小倉税務署', '小倉税務署', '803-8602', '北九州市小倉北区大手町13番17号', '093-583-1331',
  'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka/kokura/index.htm',
  'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka.htm', NULL,
  ARRAY['401064','401072']);

SELECT _sunboo_upsert_office('tax_office', '田川税務署', '田川税務署', '825-0016', '田川市新町11番55号', '0947-44-0430',
  'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka/tagawa/index.htm',
  'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka.htm', NULL,
  ARRAY['402061','406015','406023','406040','406058','406082','406091','406104']);

SELECT _sunboo_upsert_office('tax_office', '筑紫税務署', '筑紫税務署', '818-8666', '筑紫野市針摺西1丁目1番8号', '092-923-1400',
  'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka/chikushi/index.htm',
  'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka.htm', NULL,
  ARRAY['402176','402184','402192','402214','402311']);

SELECT _sunboo_upsert_office('tax_office', '西福岡税務署', '西福岡税務署', '814-8602', '福岡市早良区百道1丁目5番22号', '092-843-6211',
  'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka/nishifukuoka/index.htm',
  'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka.htm', NULL,
  ARRAY['401358','401366','401374','402303']);

SELECT _sunboo_upsert_office('tax_office', '直方税務署', '直方税務署', '822-8666', '直方市殿町9番10号', '0949-22-0880',
  'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka/nogata/index.htm',
  'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka.htm', NULL,
  ARRAY['402044','402265','404012','404021']);

SELECT _sunboo_upsert_office('tax_office', '博多税務署', '博多税務署', '812-8706', '福岡市東区馬出1丁目8番1号', '092-641-8131',
  'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka/hakata/index.htm',
  'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka.htm',
  '福岡市東区の一部を管轄する場合があります（東区の主管轄は香椎税務署として登録）。正確な管轄は国税庁の管轄税務署検索でご確認ください。',
  ARRAY['401323']);

SELECT _sunboo_upsert_office('tax_office', '福岡税務署', '福岡税務署', '810-8689', '福岡市中央区天神4丁目8番28号', '092-771-1151',
  'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka/fukuoka/index.htm',
  'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka.htm', NULL,
  ARRAY['401331','401340']);

SELECT _sunboo_upsert_office('tax_office', '門司税務署', '門司税務署', '801-8601', '北九州市門司区西海岸1丁目3番10号 門司港湾合同庁舎', '093-321-5831',
  'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka/moji/index.htm',
  'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka.htm', NULL,
  ARRAY['401013']);

SELECT _sunboo_upsert_office('tax_office', '八幡税務署', '八幡税務署', '805-8606', '北九州市八幡東区平野2丁目13番1号', '093-671-6531',
  'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka/yahata/index.htm',
  'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka.htm', NULL,
  ARRAY['401056','401081','401099']);

SELECT _sunboo_upsert_office('tax_office', '八女税務署', '八女税務署', '834-0031', '八女市本町510', '0943-23-5191',
  'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka/yame/index.htm',
  'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka.htm', NULL,
  ARRAY['402109','402117','405442']);

SELECT _sunboo_upsert_office('tax_office', '行橋税務署', '行橋税務署', '824-8611', '行橋市門樋町1番1号', '0930-23-0580',
  'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka/yukuhashi/index.htm',
  'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka.htm', NULL,
  ARRAY['402133','402141','406210','406252','406422','406465','406473']);

SELECT _sunboo_upsert_office('tax_office', '若松税務署', '若松税務署', '808-8606', '北九州市若松区本町1-14-12 若松港湾合同庁舎', '093-761-2536',
  'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka/wakamatsu/index.htm',
  'https://www.nta.go.jp/about/organization/fukuoka/location/fukuoka.htm', NULL,
  ARRAY['401030','402150','403814','403822','403831','403849']);

-- ── 5-3. 年金事務所（11所） ──
-- 情報源: nenkin.go.jp/section/soudan/fukuoka/{slug}.html

SELECT _sunboo_upsert_office('pension_office', '日本年金機構', '東福岡年金事務所', '812-8657', '福岡市東区馬出3-12-32', '092-651-7967',
  'https://www.nenkin.go.jp/section/soudan/fukuoka/higashifukuoka.html',
  'https://www.nenkin.go.jp/section/soudan/fukuoka/index.html',
  '健康保険・厚生年金保険については博多年金事務所と共同管轄の地域です（東区・宗像市・古賀市・福津市・糟屋郡）。博多区のみ博多年金事務所の単独管轄です。',
  ARRAY['401315','402206','402231','402249','403415','403423','403431','403440','403458','403482','403491']);

SELECT _sunboo_upsert_office('pension_office', '日本年金機構', '博多年金事務所', '812-8540', '福岡市博多区博多駅東3-14-1 T-Building HAKATA EAST 4・5階', '092-474-0012',
  'https://www.nenkin.go.jp/section/soudan/fukuoka/hakata.html',
  'https://www.nenkin.go.jp/section/soudan/fukuoka/index.html',
  '博多区は単独管轄。東区・宗像市・古賀市・福津市・糟屋郡は東福岡年金事務所と共同管轄です。',
  ARRAY['401323']);

SELECT _sunboo_upsert_office('pension_office', '日本年金機構', '中福岡年金事務所', '810-8668', '福岡市中央区大手門2-8-25', '092-751-1232',
  'https://www.nenkin.go.jp/section/soudan/fukuoka/nakafukuoka.html',
  'https://www.nenkin.go.jp/section/soudan/fukuoka/index.html', NULL,
  ARRAY['401331']);

SELECT _sunboo_upsert_office('pension_office', '日本年金機構', '西福岡年金事務所', '819-8502', '福岡市西区内浜1-3-7', '092-883-9962',
  'https://www.nenkin.go.jp/section/soudan/fukuoka/nishifukuoka.html',
  'https://www.nenkin.go.jp/section/soudan/fukuoka/index.html', NULL,
  ARRAY['401358','401366','401374','402303']);

SELECT _sunboo_upsert_office('pension_office', '日本年金機構', '南福岡年金事務所', '815-8558', '福岡市南区塩原3-1-27', '092-552-6112',
  'https://www.nenkin.go.jp/section/soudan/fukuoka/minamifukuoka.html',
  'https://www.nenkin.go.jp/section/soudan/fukuoka/index.html', NULL,
  ARRAY['401340','402176','402184','402192','402214','402281','402311','404471','404489']);

SELECT _sunboo_upsert_office('pension_office', '日本年金機構', '小倉北年金事務所', '803-8588', '北九州市小倉北区大手町13-3', '093-583-8340',
  'https://www.nenkin.go.jp/section/soudan/fukuoka/kokurakita.html',
  'https://www.nenkin.go.jp/section/soudan/fukuoka/index.html', NULL,
  ARRAY['401013','401064']);

SELECT _sunboo_upsert_office('pension_office', '日本年金機構', '小倉南年金事務所', '800-0294', '北九州市小倉南区下曽根1-8-6', '093-471-8873',
  'https://www.nenkin.go.jp/section/soudan/fukuoka/kokuraminami.html',
  'https://www.nenkin.go.jp/section/soudan/fukuoka/index.html', NULL,
  ARRAY['401072','402133','402141','406210','406252','406422','406465','406473']);

SELECT _sunboo_upsert_office('pension_office', '日本年金機構', '八幡年金事務所', '806-8555', '北九州市八幡西区岸の浦1-5-5', '093-631-7962',
  'https://www.nenkin.go.jp/section/soudan/fukuoka/yahata.html',
  'https://www.nenkin.go.jp/section/soudan/fukuoka/index.html', NULL,
  ARRAY['401030','401056','401081','401099','402150','403814','403822','403831','403849']);

SELECT _sunboo_upsert_office('pension_office', '日本年金機構', '久留米年金事務所', '830-8501', '久留米市諏訪野町2401', '0942-33-6192',
  'https://www.nenkin.go.jp/section/soudan/fukuoka/kurume.html',
  'https://www.nenkin.go.jp/section/soudan/fukuoka/index.html', NULL,
  ARRAY['402036','402109','402117','402125','402168','402257','405035','405221','405442']);

SELECT _sunboo_upsert_office('pension_office', '日本年金機構', '大牟田年金事務所', '836-8501', '大牟田市大正町6-2-10', '0944-52-5294',
  'https://www.nenkin.go.jp/section/soudan/fukuoka/omuta.html',
  'https://www.nenkin.go.jp/section/soudan/fukuoka/index.html', NULL,
  ARRAY['402028','402079','402290']);

SELECT _sunboo_upsert_office('pension_office', '日本年金機構', '直方年金事務所', '822-8555', '直方市知古1-8-1', '0949-22-0891',
  'https://www.nenkin.go.jp/section/soudan/fukuoka/nogata.html',
  'https://www.nenkin.go.jp/section/soudan/fukuoka/index.html', NULL,
  ARRAY['402044','402052','402061','402265','402273','404012','404021','404217','406015','406023','406040','406058','406082','406091','406104']);

-- ── 5-4. 労働基準監督署（12署） ──
-- 情報源: jsite.mhlw.go.jp/fukuoka-roudoukyoku/kantoku/ 配下の各署ページ

SELECT _sunboo_upsert_office('labor_standards', '福岡労働局', '福岡中央労働基準監督署', '810-8605', '福岡市中央区長浜2-1-1', '092-761-5607',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/_00636.html',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/', NULL,
  ARRAY['401323','401331','401340','401358','401366','401374','402176','402184','402192','402214','402303','402311']);

SELECT _sunboo_upsert_office('labor_standards', '福岡労働局', '福岡東労働基準監督署', '813-0016', '福岡市東区香椎浜1-3-26', '092-661-3770',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/_00637.html',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/', NULL,
  ARRAY['401315','402206','402231','402249','403415','403423','403431','403440','403458','403482','403491']);

SELECT _sunboo_upsert_office('labor_standards', '福岡労働局', '北九州東労働基準監督署', '803-0814', '北九州市小倉北区大手町13-26', '093-561-0881',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/_00644.html',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/', NULL,
  ARRAY['401064','401072']);

SELECT _sunboo_upsert_office('labor_standards', '福岡労働局', '北九州東労働基準監督署門司支署', '800-0004', '北九州市門司区北川町1-18', '093-381-5361',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/kantoku/mojishisyomokuji.html',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/', NULL,
  ARRAY['401013']);

SELECT _sunboo_upsert_office('labor_standards', '福岡労働局', '北九州西労働基準監督署', '806-8540', '北九州市八幡西区岸の浦1-5-10', '093-622-6550',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/kantoku/kitanishisyomokuji.html',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/', NULL,
  ARRAY['401030','401056','401081','401099','402150','403814','403822','403831','403849']);

SELECT _sunboo_upsert_office('labor_standards', '福岡労働局', '行橋労働基準監督署', '824-0005', '行橋市中央1-12-35', '0930-23-0454',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/kantoku/yukuhashisyomokuji.html',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/', NULL,
  ARRAY['402133','402141','406210','406252','406422','406465','406473']);

SELECT _sunboo_upsert_office('labor_standards', '福岡労働局', '久留米労働基準監督署', '830-0037', '久留米市諏訪野町2401', '0942-33-7251',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/kantoku/kurumesyomokuji.html',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/', NULL,
  ARRAY['402036','402125','402281','402168','402257','405035','405221','404471','404489']);

SELECT _sunboo_upsert_office('labor_standards', '福岡労働局', '大牟田労働基準監督署', '836-8502', '大牟田市小浜町24-13', '0944-53-3987',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/kantoku/oomutasyomokuji.html',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/', NULL,
  ARRAY['402028','402079','402290']);

SELECT _sunboo_upsert_office('labor_standards', '福岡労働局', '八女労働基準監督署', '834-0047', '八女市稲富132', '0943-23-2121',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/kantoku/yamesyomokuji.html',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/', NULL,
  ARRAY['402109','402117','405442']);

SELECT _sunboo_upsert_office('labor_standards', '福岡労働局', '飯塚労働基準監督署', '820-0018', '飯塚市芳雄町13-6（飯塚合同庁舎）', '0948-22-3200',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/kantoku/iidukasyomokuji.html',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/', NULL,
  ARRAY['402052','402273','404217']);

SELECT _sunboo_upsert_office('labor_standards', '福岡労働局', '直方労働基準監督署', '822-0017', '直方市殿町9-17', '0949-22-0544',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/kantoku/nougatasyomokuji.html',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/', NULL,
  ARRAY['402044','402265','404012','404021']);

SELECT _sunboo_upsert_office('labor_standards', '福岡労働局', '田川労働基準監督署', '825-0013', '田川市中央町4-12', '0947-42-0380',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/kantoku/tagawasyomokuji.html',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/', NULL,
  ARRAY['402061','406015','406023','406040','406058','406082','406091','406104']);

-- ── 5-5. ハローワーク（17所） ──
-- 情報源: jsite.mhlw.go.jp/fukuoka-roudoukyoku/hw/kankatsu_shozaichi/kikan02/ 配下の各所ページ
-- 求職者向けのみの分庁舎・出張所（赤坂駅前庁舎・黒崎駅前庁舎・戸畑分庁舎・若松出張所の一部）は、
-- 事業主向け業務（雇用保険適用等）を担う本所・出張所へ統合して登録。

SELECT _sunboo_upsert_office('hello_work', '福岡労働局', 'ハローワーク福岡中央', '810-8609', '福岡市中央区赤坂1-6-19', '092-712-8609',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/hw/kankatsu_shozaichi/kikan02/antmap01.html',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/hw/kankatsu_shozaichi/kikan02.html', NULL,
  ARRAY['401331','401323','401366','401374','403431','403440','403415']);

SELECT _sunboo_upsert_office('hello_work', '福岡労働局', 'ハローワーク福岡東', '813-8609', '福岡市東区千早6-1-1', '092-672-8609',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/hw/kankatsu_shozaichi/kikan02/antmap04.html',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/hw/kankatsu_shozaichi/kikan02.html', NULL,
  ARRAY['401315','402206','402231','402249','403423','403458','403482','403491']);

SELECT _sunboo_upsert_office('hello_work', '福岡労働局', 'ハローワーク福岡南', '816-8577', '春日市春日公園3-2', '092-513-8609',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/hw/kankatsu_shozaichi/kikan02/antmap05.html',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/hw/kankatsu_shozaichi/kikan02.html', NULL,
  ARRAY['401340','402176','402184','402192','402214','402311']);

SELECT _sunboo_upsert_office('hello_work', '福岡労働局', 'ハローワーク福岡西', '819-8552', '福岡市西区姪浜駅南3-8-10', '092-881-8609',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/hw/kankatsu_shozaichi/kikan02/antmap06.html',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/hw/kankatsu_shozaichi/kikan02.html', NULL,
  ARRAY['401358','402303']);

SELECT _sunboo_upsert_office('hello_work', '福岡労働局', 'ハローワーク八幡', '806-8509', '北九州市八幡西区岸の浦1-5-10', '093-622-5566',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/hw/kankatsu_shozaichi/kikan02/antmap07.html',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/hw/kankatsu_shozaichi/kikan02.html',
  '戸畑区・若松区は求職者向け業務は戸畑分庁舎・若松出張所が個別に担当しますが、事業主向け（雇用保険適用等）は本所が管轄します。',
  ARRAY['401081','401099','401056','401030','402150','403814','403822','403831','403849']);

SELECT _sunboo_upsert_office('hello_work', '福岡労働局', 'ハローワーク小倉', '802-8507', '北九州市小倉北区萩崎町1-11', '093-941-8609',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/hw/kankatsu_shozaichi/kikan02/antmap08.html',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/hw/kankatsu_shozaichi/kikan02.html', NULL,
  ARRAY['401064','401072']);

SELECT _sunboo_upsert_office('hello_work', '福岡労働局', 'ハローワーク小倉門司出張所', '800-0004', '北九州市門司区北川町1-18', '093-381-8609',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/hw/kankatsu_shozaichi/kikan02/antmap12.html',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/hw/kankatsu_shozaichi/kikan02.html', NULL,
  ARRAY['401013']);

SELECT _sunboo_upsert_office('hello_work', '福岡労働局', 'ハローワーク行橋', '824-0031', '行橋市西宮市5-2-47', '0930-25-8609',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/hw/kankatsu_shozaichi/kikan02/antmap14.html',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/hw/kankatsu_shozaichi/kikan02.html', NULL,
  ARRAY['402133','406210','406252','406473']);

SELECT _sunboo_upsert_office('hello_work', '福岡労働局', 'ハローワーク行橋豊前出張所', '828-0021', '豊前市大字八屋322-70', '0979-82-8609',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/hw/kankatsu_shozaichi/kikan02/antmap15.html',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/hw/kankatsu_shozaichi/kikan02.html', NULL,
  ARRAY['402141','406422','406465']);

SELECT _sunboo_upsert_office('hello_work', '福岡労働局', 'ハローワーク飯塚', '820-8540', '飯塚市芳雄町12-1', '0948-24-8609',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/hw/kankatsu_shozaichi/kikan02/antmap21.html',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/hw/kankatsu_shozaichi/kikan02.html', NULL,
  ARRAY['402052','402273','404217']);

SELECT _sunboo_upsert_office('hello_work', '福岡労働局', 'ハローワーク直方', '822-0002', '直方市大字頓野3334-5', '0949-22-8609',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/hw/kankatsu_shozaichi/kikan02/antmap23.html',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/hw/kankatsu_shozaichi/kikan02.html', NULL,
  ARRAY['402044','402265','404012','404021']);

SELECT _sunboo_upsert_office('hello_work', '福岡労働局', 'ハローワーク田川', '826-8609', '田川市弓削田184-1', '0947-44-8609',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/hw/kankatsu_shozaichi/kikan02/antmap24.html',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/hw/kankatsu_shozaichi/kikan02.html', NULL,
  ARRAY['402061','406015','406023','406040','406058','406082','406091','406104']);

SELECT _sunboo_upsert_office('hello_work', '福岡労働局', 'ハローワーク大牟田', '836-0047', '大牟田市大正町6-2-3', '0944-53-1551',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/hw/kankatsu_shozaichi/kikan02/antmap16.html',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/hw/kankatsu_shozaichi/kikan02.html', NULL,
  ARRAY['402028','402079','402290']);

SELECT _sunboo_upsert_office('hello_work', '福岡労働局', 'ハローワーク久留米', '830-8505', '久留米市諏訪野町2401', '0942-35-8609',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/hw/kankatsu_shozaichi/kikan02/antmap17.html',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/hw/kankatsu_shozaichi/kikan02.html', NULL,
  ARRAY['402036','402168','402257','405035']);

SELECT _sunboo_upsert_office('hello_work', '福岡労働局', 'ハローワーク久留米大川出張所', '831-0041', '大川市大字小保614-6', '0944-86-8609',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/hw/kankatsu_shozaichi/kikan02/antmap18.html',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/hw/kankatsu_shozaichi/kikan02.html', NULL,
  ARRAY['402125','405221']);

SELECT _sunboo_upsert_office('hello_work', '福岡労働局', 'ハローワーク八女', '834-0023', '八女市馬場514-3', '0943-23-6188',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/hw/kankatsu_shozaichi/kikan02/antmap19.html',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/hw/kankatsu_shozaichi/kikan02.html', NULL,
  ARRAY['402109','402117','405442']);

SELECT _sunboo_upsert_office('hello_work', '福岡労働局', 'ハローワーク朝倉', '838-0061', '朝倉市菩提寺480-3', '0946-22-8609',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/hw/kankatsu_shozaichi/kikan02/antmap20.html',
  'https://jsite.mhlw.go.jp/fukuoka-roudoukyoku/hw/kankatsu_shozaichi/kikan02.html', NULL,
  ARRAY['402281','404471','404489']);

-- 投入用ヘルパー関数を削除（データ投入専用のため常駐させない）
DROP FUNCTION _sunboo_upsert_office(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]);

-- ── 確認クエリ ───────────────────────────────────────────────
-- 市区町村ごとに機関種別が正しく1件ずつ解決できるか確認（NULLがあれば管轄漏れ）
SELECT
  pf.name AS 都道府県, m.name AS 市区町村,
  MAX(CASE WHEN ot.code = 'legal_affairs_bureau' THEN oo.name END) AS 法務局,
  MAX(CASE WHEN ot.code = 'tax_office' THEN oo.name END) AS 税務署,
  MAX(CASE WHEN ot.code = 'pension_office' THEN oo.name END) AS 年金事務所,
  MAX(CASE WHEN ot.code = 'labor_standards' THEN oo.name END) AS 労基署,
  MAX(CASE WHEN ot.code = 'hello_work' THEN oo.name END) AS ハローワーク
FROM municipalities m
JOIN prefectures pf ON pf.id = m.prefecture_id
LEFT JOIN jurisdictions j ON j.municipality_id = m.id
LEFT JOIN organization_types ot ON ot.id = j.organization_type_id
LEFT JOIN organization_offices oo ON oo.id = j.organization_office_id
WHERE pf.code = '40'
GROUP BY pf.name, m.name
ORDER BY m.name;

-- 未実行のDROP文（新スキーマの動作確認が終わってから手動実行してください）
-- DROP TABLE IF EXISTS jurisdiction_offices;
