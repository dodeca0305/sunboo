-- ============================================================
-- SUNBOO経営ナビ
-- 設立時の主要手続きに必要書類データをバックフィルする。
--
-- 既存行は (procedure_id, name) の一意制約で重複させず、
-- 必須区分・種別・表示順だけを最新の定義へ揃える。
-- ============================================================

BEGIN;

WITH required_documents (
  procedure_code,
  document_name,
  form_number,
  notes,
  sort_order
) AS (
  VALUES
    -- 国税庁：法人設立届出書
    ('CORP_ESTABLISH_TAX',
     '法人設立届出書',
     '別紙2（国税庁様式）',
     '提出する届出書本体',
     1),
    ('CORP_ESTABLISH_TAX',
     '定款等の写し',
     NULL,
     '国税庁の案内に基づく添付書類',
     2),

    -- 福岡市：法人等の設立申告書
    ('FUKUOKA_CITY_ESTABLISHMENT_NOTICE',
     '法人等の設立申告書',
     '市税条例第51号様式',
     '提出する申告書本体',
     1),
    ('FUKUOKA_CITY_ESTABLISHMENT_NOTICE',
     '定款または寄附行為の写し',
     NULL,
     '福岡市公式案内に記載された添付書類',
     2),
    ('FUKUOKA_CITY_ESTABLISHMENT_NOTICE',
     '登記事項証明書の写し',
     NULL,
     '福岡市公式案内に記載された添付書類',
     3),

    -- 福岡県：法人設立（設置）届
    ('FUKUOKA_PREFECTURAL_ESTABLISHMENT_NOTICE',
     '法人設立（設置）届',
     NULL,
     '提出する届出書本体。添付書類は提出時点の福岡県公式案内を確認',
     1),

    -- 法務局：合同会社設立登記
    ('LEGAL_ESTABLISH_GODO',
     '合同会社設立登記申請書',
     NULL,
     '提出する登記申請書本体',
     1),
    ('LEGAL_ESTABLISH_GODO',
     '定款',
     NULL,
     '会社の機関設計等により追加書面が必要になる場合があります',
     2),
    ('LEGAL_ESTABLISH_GODO',
     '出資の払込みを証する書面',
     NULL,
     '払込みの事実を確認できる書面',
     3)
)
INSERT INTO procedure_documents (
  procedure_id,
  name,
  form_number,
  is_required,
  notes,
  item_type,
  sort_order
)
SELECT
  p.id,
  d.document_name,
  d.form_number,
  TRUE,
  d.notes,
  'document',
  d.sort_order
FROM required_documents d
JOIN procedures p ON p.code = d.procedure_code
ON CONFLICT (procedure_id, name) DO UPDATE SET
  form_number = COALESCE(EXCLUDED.form_number, procedure_documents.form_number),
  is_required = TRUE,
  notes = COALESCE(procedure_documents.notes, EXCLUDED.notes),
  item_type = 'document',
  sort_order = EXCLUDED.sort_order;

-- 対象手続きが欠けている環境で、書類だけ静かに欠落することを防ぐ。
DO $$
DECLARE
  missing_codes TEXT;
BEGIN
  SELECT string_agg(expected.code, ', ' ORDER BY expected.code)
  INTO missing_codes
  FROM (
    VALUES
      ('CORP_ESTABLISH_TAX'),
      ('FUKUOKA_CITY_ESTABLISHMENT_NOTICE'),
      ('FUKUOKA_PREFECTURAL_ESTABLISHMENT_NOTICE'),
      ('LEGAL_ESTABLISH_GODO')
  ) AS expected(code)
  WHERE NOT EXISTS (
    SELECT 1 FROM procedures p WHERE p.code = expected.code
  );

  IF missing_codes IS NOT NULL THEN
    RAISE EXCEPTION '必要書類の対象手続きが存在しません: %', missing_codes;
  END IF;
END $$;

COMMIT;

-- 実行結果の確認
SELECT
  p.code AS procedure_code,
  p.name AS procedure_name,
  d.name AS document_name,
  d.form_number,
  d.is_required,
  d.item_type,
  d.sort_order
FROM procedures p
JOIN procedure_documents d ON d.procedure_id = p.id
WHERE p.code IN (
  'CORP_ESTABLISH_TAX',
  'FUKUOKA_CITY_ESTABLISHMENT_NOTICE',
  'FUKUOKA_PREFECTURAL_ESTABLISHMENT_NOTICE',
  'LEGAL_ESTABLISH_GODO'
)
ORDER BY p.code, d.sort_order, d.id;
