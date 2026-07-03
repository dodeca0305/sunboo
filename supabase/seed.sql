-- ============================================================
-- SUNBOO経営ナビ 初期データ (MVP: 東京都渋谷区)
-- ============================================================
-- schema.sql を実行した後に実行してください。
-- 何度実行しても安全（ON CONFLICT で既存行を安全にマージ）。
-- ============================================================

-- 都道府県（東京都）
INSERT INTO prefectures (code, name) VALUES ('13', '東京都')
ON CONFLICT (code) DO NOTHING;

-- 市区町村（渋谷区）
INSERT INTO municipalities (prefecture_id, code, name)
SELECT id, '13113', '渋谷区' FROM prefectures WHERE code = '13'
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 管轄機関（渋谷区の6機関）
-- official_url_status: ok / broken / redirected / unchecked
-- fallback_url: リンク切れ時に誘導する安定した公式一覧ページ
-- ============================================================
INSERT INTO jurisdiction_offices (
  municipality_id, office_type, name, address, phone,
  website_url, map_url,
  official_url, official_url_status, fallback_url
)
SELECT m.id, v.office_type, v.name, v.address, v.phone,
       v.website_url, v.map_url,
       v.official_url, v.official_url_status, v.fallback_url
FROM municipalities m,
(VALUES
  ('tax_office',
   '渋谷税務署',
   '東京都渋谷区神山町10番地',
   '03-3461-5511',
   'https://www.nta.go.jp/about/organization/tokyo/shokatsu/shibuya/index.htm',
   'https://maps.google.com/?q=渋谷税務署',
   'https://www.nta.go.jp/about/organization/tokyo/shokatsu/shibuya/index.htm',
   'ok',
   'https://www.nta.go.jp/about/organization/index.htm'),

  ('prefectural_tax',
   '東京都渋谷都税事務所',
   '東京都渋谷区宇田川町1番18号',
   '03-3464-1311',
   'https://www.tax.metro.tokyo.lg.jp/about/jimusho/shibuya.html',
   'https://maps.google.com/?q=東京都渋谷都税事務所',
   'https://www.tax.metro.tokyo.lg.jp/about/jimusho/shibuya.html',
   'ok',
   'https://www.tax.metro.tokyo.lg.jp/about/jimusho/'),

  ('municipal_tax',
   '渋谷区役所（税務課）',
   '東京都渋谷区宇田川町1番1号',
   '03-3463-1211',
   'https://www.city.shibuya.tokyo.jp/kurashi/zeikin/hojin/',
   'https://maps.google.com/?q=渋谷区役所',
   'https://www.city.shibuya.tokyo.jp/kurashi/zeikin/hojin/',
   'ok',
   'https://www.city.shibuya.tokyo.jp/kurashi/zeikin/'),

  ('pension_office',
   '渋谷年金事務所',
   '東京都渋谷区渋谷1丁目17番1号',
   '03-3462-1723',
   'https://www.nenkin.go.jp/section/soudan/tokyo/shibuya.html',
   'https://maps.google.com/?q=渋谷年金事務所',
   'https://www.nenkin.go.jp/section/soudan/tokyo/shibuya.html',
   'ok',
   'https://www.nenkin.go.jp/section/soudan/index.html'),

  ('labor_standards',
   '渋谷労働基準監督署',
   '東京都渋谷区神南1丁目3番5号',
   '03-3780-6811',
   'https://jsite.mhlw.go.jp/tokyo-roudoukyoku/kanren_kikan/kanri_kantoku/shibuya.html',
   'https://maps.google.com/?q=渋谷労働基準監督署',
   'https://jsite.mhlw.go.jp/tokyo-roudoukyoku/kanren_kikan/kanri_kantoku/shibuya.html',
   'ok',
   'https://jsite.mhlw.go.jp/tokyo-roudoukyoku/kanren_kikan/kanri_kantoku/'),

  ('hello_work',
   'ハローワーク渋谷',
   '東京都渋谷区神南1丁目3番5号',
   '03-3476-8609',
   'https://jsite.mhlw.go.jp/tokyo-hellowork/hw/shibuya/',
   'https://maps.google.com/?q=ハローワーク渋谷',
   'https://jsite.mhlw.go.jp/tokyo-hellowork/hw/shibuya/',
   'ok',
   'https://jsite.mhlw.go.jp/tokyo-hellowork/hw/')

) AS v(office_type, name, address, phone, website_url, map_url,
       official_url, official_url_status, fallback_url)
WHERE m.code = '13113'
ON CONFLICT (municipality_id, office_type) DO UPDATE SET
  official_url        = COALESCE(jurisdiction_offices.official_url, EXCLUDED.official_url),
  fallback_url        = COALESCE(jurisdiction_offices.fallback_url, EXCLUDED.fallback_url),
  official_url_status = CASE
    WHEN jurisdiction_offices.official_url_status = 'unchecked'
    THEN EXCLUDED.official_url_status
    ELSE jurisdiction_offices.official_url_status
  END;

-- ============================================================
-- 手続きマスタ（10手続き）
-- ============================================================
INSERT INTO procedures (
  code, name, description, category, requires_employees,
  office_type, frequency, timing_label, timing_type, timing_data, priority
) VALUES
('CORP_ESTABLISH_TAX',
 '法人設立届出書',
 '法人を設立した場合、法人の基本情報を税務署に届け出る書類です。設立登記後に必ず提出が必要です。',
 'registration', FALSE,
 'tax_office', 'one_time', '設立日から2ヶ月以内',
 'at_establishment', '{"days_from_event": 60}', 1),
('BLUE_RETURN_APPROVAL',
 '青色申告承認申請書',
 '青色申告を選択することで、欠損金の繰越控除など税務上の優遇が受けられます。設立後早めに申請しましょう。',
 'tax', FALSE,
 'tax_office', 'one_time', '設立から3ヶ月以内または最初の事業年度終了日の前日のいずれか早い日',
 'at_establishment', '{"days_from_event": 90}', 2),
('PAYROLL_OFFICE_OPEN',
 '給与支払事務所等の開設届',
 '給与や報酬を支払う事務所を開設した場合に必要な届出です。源泉徴収の義務が発生します。',
 'tax', TRUE,
 'tax_office', 'one_time', '開設から1ヶ月以内',
 'at_establishment', '{"days_from_event": 30}', 3),
('SOCIAL_INS_NEW',
 '社会保険新規適用届',
 '法人を設立した場合、役員のみの会社でも社会保険（健康保険・厚生年金）の加入が義務付けられます。',
 'insurance', FALSE,
 'pension_office', 'one_time', '設立後5日以内（実務上は速やかに）',
 'at_establishment', '{"days_from_event": 5}', 4),
('LABOR_INS_ESTABLISH',
 '労働保険成立届',
 '従業員を雇用した場合、労働保険（労災保険・雇用保険）の保険関係を成立させる届出です。',
 'labor', TRUE,
 'labor_standards', 'one_time', '保険関係成立の翌日から10日以内',
 'at_establishment', '{"days_from_event": 10}', 5),
('EMPLOY_INS_OFFICE',
 '雇用保険適用事業所設置届',
 '週20時間以上・31日以上継続雇用する従業員がいる場合、ハローワークへ事業所の設置を届け出ます。',
 'labor', TRUE,
 'hello_work', 'one_time', '設置後10日以内',
 'at_establishment', '{"days_from_event": 10}', 6),
('WITHHOLDING_TAX',
 '源泉所得税の納付',
 '役員報酬や給与から天引きした源泉所得税を翌月10日までに納付します。従業員10人未満は納期特例（年2回）を申請できます。',
 'tax', TRUE,
 'tax_office', 'monthly', '毎月10日（納期特例の場合：1月20日・7月10日）',
 'monthly_10th', NULL, 7),
('SOCIAL_INS_SANTEIKISO',
 '算定基礎届（社会保険）',
 '4・5・6月の給与をもとに標準報酬月額を見直す年1回の届出です。全従業員分を提出します。',
 'insurance', TRUE,
 'pension_office', 'annual', '毎年 7月1日〜7月10日',
 'period', '{"startMonth": 7, "startDay": 1, "endMonth": 7, "endDay": 10}', 8),
('LABOR_INS_RENEWAL',
 '労働保険年度更新',
 '前年度の確定保険料を精算し、今年度の概算保険料を前払いする年1回の手続きです。',
 'labor', TRUE,
 'labor_standards', 'annual', '毎年 6月1日〜7月10日',
 'period', '{"startMonth": 6, "startDay": 1, "endMonth": 7, "endDay": 10}', 9),
('YEAR_END_ADJUSTMENT',
 '年末調整・法定調書合計表の提出',
 '年末に従業員の所得税を精算（年末調整）し、翌年1月31日までに法定調書合計表を税務署へ提出します。',
 'tax', TRUE,
 'tax_office', 'annual', '毎年1月31日（年末調整は12月末実施）',
 'fixed_date', '{"month": 1, "day": 31}', 10)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 手続き必要書類
-- ============================================================
INSERT INTO procedure_documents (procedure_id, name, form_number, is_required, notes, sort_order)
SELECT p.id, v.name, v.form_number, v.is_required, v.notes, v.sort_order
FROM procedures p,
(VALUES
  ('CORP_ESTABLISH_TAX', '法人設立届出書',         '別紙2（国税庁様式）', TRUE,  NULL,                   1),
  ('CORP_ESTABLISH_TAX', '定款のコピー',           NULL,                  TRUE,  '設立登記が完了したもの', 2),
  ('CORP_ESTABLISH_TAX', '登記事項証明書のコピー', NULL,                  TRUE,  '発行から3ヶ月以内',      3),
  ('BLUE_RETURN_APPROVAL', '青色申告の承認申請書', '国税庁様式',          TRUE,  NULL,                   1),
  ('SOCIAL_INS_NEW', '健康保険・厚生年金保険 新規適用届', '日本年金機構様式', TRUE,  NULL,                1),
  ('SOCIAL_INS_NEW', '登記事項証明書',             NULL,                  TRUE,  '法人の場合',             2),
  ('SOCIAL_INS_NEW', '事業所の所在地と名称がわかる書類', NULL,            FALSE, '賃貸借契約書など',        3)
) AS v(code, name, form_number, is_required, notes, sort_order)
WHERE p.code = v.code
ON CONFLICT (procedure_id, name) DO NOTHING;

-- ============================================================
-- 公式リンク
-- status: ok / broken / redirected / unchecked
-- fallback_url: リンク切れ時に誘導する安定した公式一覧ページ
-- ============================================================
INSERT INTO official_links (procedure_id, label, url, sort_order, status, fallback_url)
SELECT p.id, v.label, v.url, v.sort_order, v.status, v.fallback_url
FROM procedures p
JOIN (VALUES
  ('CORP_ESTABLISH_TAX',
   '法人設立届出書（国税庁）',
   'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/hojin/annai/1554_2.htm',
   1, 'ok',
   'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/hojin/'),

  ('BLUE_RETURN_APPROVAL',
   '青色申告承認申請書（国税庁）',
   'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/hojin/annai/1554_20.htm',
   1, 'ok',
   'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/hojin/'),

  ('PAYROLL_OFFICE_OPEN',
   '給与支払事務所等の開設届（国税庁）',
   'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/gensen/annai/1648_11.htm',
   1, 'ok',
   'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/gensen/'),

  ('SOCIAL_INS_NEW',
   '新規適用の手続き（日本年金機構）',
   'https://www.nenkin.go.jp/service/kounen/kenpo-todoke/jigyo/20150518.html',
   1, 'ok',
   'https://www.nenkin.go.jp/service/kounen/kenpo-todoke/jigyo/'),

  ('LABOR_INS_ESTABLISH',
   '労働保険成立手続き（厚生労働省）',
   'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/hoken/roudouhoken20/index.html',
   1, 'ok',
   'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/hoken/'),

  ('EMPLOY_INS_OFFICE',
   '雇用保険適用事業所設置届（ハローワーク）',
   'https://www.hellowork.mhlw.go.jp/insurance/insurance_guide.html',
   1, 'ok',
   'https://www.hellowork.mhlw.go.jp/insurance/'),

  ('WITHHOLDING_TAX',
   '源泉所得税の納付（国税庁）',
   'https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2505.htm',
   1, 'ok',
   'https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/'),

  ('SOCIAL_INS_SANTEIKISO',
   '算定基礎届の手続き（日本年金機構）',
   'https://www.nenkin.go.jp/service/kounen/kenpo-todoke/hihokensha/20141205.html',
   1, 'ok',
   'https://www.nenkin.go.jp/service/kounen/kenpo-todoke/hihokensha/'),

  ('LABOR_INS_RENEWAL',
   '労働保険年度更新（厚生労働省）',
   'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/hoken/roudouhoken20/index.html',
   1, 'ok',
   'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/hoken/'),

  ('YEAR_END_ADJUSTMENT',
   '法定調書の提出（国税庁）',
   'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/hotei/annai/23100051.htm',
   1, 'ok',
   'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/hotei/')

) AS v(code, label, url, sort_order, status, fallback_url) ON p.code = v.code
ON CONFLICT (procedure_id, url) DO UPDATE SET
  status       = CASE
    WHEN official_links.status = 'unchecked' THEN EXCLUDED.status
    ELSE official_links.status
  END,
  fallback_url = COALESCE(official_links.fallback_url, EXCLUDED.fallback_url);
