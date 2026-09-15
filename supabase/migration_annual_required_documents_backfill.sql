-- ============================================================
-- SUNBOO経営ナビ
-- 年間ロードマップの主要手続きに提出書類本体をバックフィルする。
--
-- 添付資料は法人の状況・申告方式で変わるため、この移行では
-- 各手続きで確実に使用する申告書・計算書・納入書に限定する。
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
    ('WITHHOLDING_TAX',
     '所得税徴収高計算書',
     NULL,
     '納付区分に対応する計算書を使用。e-Taxで提出・納付する場合を含む',
     1),
    ('RESIDENT_TAX_WITHHOLDING',
     '特別徴収税額の納入書',
     NULL,
     '自治体から送付された納入書。eLTAXで納付する場合は納付情報を確認',
     1),
    ('YEAR_END_ADJUSTMENT',
     '給与所得の源泉徴収票等の法定調書合計表',
     NULL,
     '提出する法定調書合計表本体',
     1),
    ('CORP_TAX_RETURN',
     '法人税及び地方法人税の確定申告書',
     NULL,
     '申告する事業年度・法人区分に対応する様式を使用',
     1),
    ('CONSUMPTION_TAX_RETURN',
     '消費税及び地方消費税の確定申告書',
     NULL,
     '課税方式・法人区分に対応する様式を使用',
     1),
    ('PREFECTURAL_RESIDENT_TAX_RETURN',
     '法人事業税・特別法人事業税・法人都道府県民税の申告書',
     '第6号様式',
     '法人事業税と法人都道府県民税を同一様式で申告する一般的な場合',
     1),
    ('PREFECTURAL_BUSINESS_TAX_RETURN',
     '法人事業税・特別法人事業税・法人都道府県民税の申告書',
     '第6号様式',
     '法人事業税と法人都道府県民税を同一様式で申告する一般的な場合',
     1),
    ('MUNICIPAL_RESIDENT_TAX_RETURN',
     '法人市町村民税の確定申告書',
     '第20号様式',
     '申告先自治体の様式・案内を確認',
     1),
    ('DEPRECIABLE_ASSET_TAX_RETURN',
     '償却資産申告書（償却資産課税台帳）',
     NULL,
     '資産所在地の自治体へ提出する申告書本体',
     1),
    ('DEPRECIABLE_ASSET_TAX_RETURN',
     '種類別明細書',
     NULL,
     '初回・増加資産・減少資産など申告内容に対応する明細書を使用',
     2)
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

-- 手続きマスター不足による静かな欠落を防ぐ。
DO $$
DECLARE
  missing_codes TEXT;
BEGIN
  SELECT string_agg(expected.code, ', ' ORDER BY expected.code)
  INTO missing_codes
  FROM (
    VALUES
      ('WITHHOLDING_TAX'),
      ('RESIDENT_TAX_WITHHOLDING'),
      ('YEAR_END_ADJUSTMENT'),
      ('CORP_TAX_RETURN'),
      ('CONSUMPTION_TAX_RETURN'),
      ('PREFECTURAL_RESIDENT_TAX_RETURN'),
      ('PREFECTURAL_BUSINESS_TAX_RETURN'),
      ('MUNICIPAL_RESIDENT_TAX_RETURN'),
      ('DEPRECIABLE_ASSET_TAX_RETURN')
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
  'WITHHOLDING_TAX',
  'RESIDENT_TAX_WITHHOLDING',
  'YEAR_END_ADJUSTMENT',
  'CORP_TAX_RETURN',
  'CONSUMPTION_TAX_RETURN',
  'PREFECTURAL_RESIDENT_TAX_RETURN',
  'PREFECTURAL_BUSINESS_TAX_RETURN',
  'MUNICIPAL_RESIDENT_TAX_RETURN',
  'DEPRECIABLE_ASSET_TAX_RETURN'
)
ORDER BY p.code, d.sort_order, d.id;
