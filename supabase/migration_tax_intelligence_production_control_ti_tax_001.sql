-- ============================================================
-- SUNBOO Tax Intelligence — TI-0.8
-- First Production Tax Rule / Control
-- ============================================================
--
-- TaxRule:
--   TI_RULE_CORP_FINAL_RETURN_DEADLINE v1
--
-- TaxControl:
--   TI_TAX_001 v1
--
-- Status:
--   draft only
--   AI proposed
--   NOT approved
--   Control disabled
--
-- Sources:
--   primary:
--     e-Gov 法人税法 第74条〜第75条の3
--   supporting:
--     NTA C1-1 法人税等の申告
-- ============================================================

BEGIN;

-- ============================================================
-- 0. Preconditions
-- ============================================================

DO $$
DECLARE
  v_source_count INT;
BEGIN
  SELECT COUNT(*)
    INTO v_source_count
  FROM tax_sources s
  JOIN tax_source_versions v
    ON v.tax_source_id = s.id
  WHERE (
    s.provider = 'e_gov'
    AND s.canonical_locator =
      'egov:law:340AC0000000034:articles-74-75-3'
    AND v.content_hash =
      'ad289727a57263365d1e64d3931f7f0960e2501384c6da22fead723334474183'
  )
  OR (
    s.provider = 'nta'
    AND s.canonical_locator =
      'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/hojin/shinkoku/01.htm'
    AND v.content_hash =
      'bb1824ef6cb588a16f2cf2047c021f79ea5dce8136d94f52397a18d744053cc5'
  );

  IF v_source_count <> 2 THEN
    RAISE EXCEPTION
      'TI_TAX_001 requires exactly 2 verified SourceVersions; found %',
      v_source_count;
  END IF;
END $$;

-- ============================================================
-- 1. TaxRule draft
-- ============================================================

INSERT INTO tax_rules (
  rule_code,
  version_no,
  tax_type,
  title,
  rule_statement,
  applicability_note,
  effective_from,
  effective_to,
  status,
  supersedes_rule_id,
  proposed_by_kind,
  approved_by,
  approved_at
)
VALUES (
  'TI_RULE_CORP_FINAL_RETURN_DEADLINE',
  1,
  NULL,
  '法人税確定申告の提出期限（原則・清算特則）',
  '内国法人の確定申告書は、原則として各事業年度終了の日の翌日から2月以内に提出する。ただし、清算中の内国法人につき残余財産が確定した場合には1月以内となり、その期間内に残余財産の最後の分配又は引渡しが行われる場合にはその前日までとなる。提出期限の延長その他の例外が適用される場合は、その適用後の期限を別途確認する。',
  'TI_TAX_001 v1では、検証済みSourceVersionの連続適用境界である2023-04-01以後に終了する決算期を対象とする。清算中の残余財産確定特則が非該当と明示された場合だけ原則2か月の基準日を評価し、特則の該当又は該当有無不明の場合はUNKNOWNとする。期限延長や休日調整を判定できる事実が不足する場合も期限超過とは断定しない。',
  DATE '2023-04-01',
  NULL,
  'draft',
  NULL,
  'ai',
  NULL,
  NULL
)
ON CONFLICT (rule_code, version_no) DO NOTHING;

-- ============================================================
-- 2. TaxRule -> SourceVersion
-- ============================================================

WITH rule_row AS (
  SELECT id
  FROM tax_rules
  WHERE rule_code =
    'TI_RULE_CORP_FINAL_RETURN_DEADLINE'
    AND version_no = 1
),
source_rows AS (
  SELECT
    v.id AS tax_source_version_id,
    CASE
      WHEN s.provider = 'e_gov'
        THEN 'primary'
      WHEN s.provider = 'nta'
        THEN 'supporting'
    END AS authority_role,
    CASE
      WHEN s.provider = 'e_gov'
        THEN '法人税法第74条〜第75条の3。確定申告期限および提出期限延長に関する法令本文。'
      WHEN s.provider = 'nta'
        THEN 'NTA C1-1。原則2か月、期限延長時の取扱い、休日等の期限取扱いを確認する実務案内。'
    END AS citation_note
  FROM tax_sources s
  JOIN tax_source_versions v
    ON v.tax_source_id = s.id
  WHERE (
    s.provider = 'e_gov'
    AND s.canonical_locator =
      'egov:law:340AC0000000034:articles-74-75-3'
    AND v.content_hash =
      'ad289727a57263365d1e64d3931f7f0960e2501384c6da22fead723334474183'
  )
  OR (
    s.provider = 'nta'
    AND s.canonical_locator =
      'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/hojin/shinkoku/01.htm'
    AND v.content_hash =
      'bb1824ef6cb588a16f2cf2047c021f79ea5dce8136d94f52397a18d744053cc5'
  )
)
INSERT INTO tax_rule_source_versions (
  tax_rule_id,
  tax_source_version_id,
  authority_role,
  citation_note
)
SELECT
  rule_row.id,
  source_rows.tax_source_version_id,
  source_rows.authority_role,
  source_rows.citation_note
FROM rule_row
CROSS JOIN source_rows
ON CONFLICT (
  tax_rule_id,
  tax_source_version_id
) DO NOTHING;

-- ============================================================
-- 3. TaxControl draft
-- ============================================================

INSERT INTO tax_controls (
  control_code,
  version_no,
  control_kind,
  title,
  description,
  evaluator_key,
  parameters,
  required_inputs,
  default_severity,
  effective_from,
  effective_to,
  status,
  is_enabled,
  supersedes_control_id,
  proposed_by_kind,
  approved_by,
  approved_at
)
VALUES (
  'TI_TAX_001',
  1,
  'tax_rule',
  '法人税確定申告・原則提出期限確認',
  '最新のTaxReturnProfileについて、清算中の残余財産確定特則が非該当と確認された場合に限り、決算期末日から算出した原則2か月の基準日と申告日を比較する。特則の該当又は該当有無不明はUNKNOWN。原則基準日以内はPASS。基準日後は期限延長・休日調整の事実が不足するためUNKNOWNとし、期限超過とは断定しない。',
  'tax-intelligence/corporate-tax-filing-baseline-deadline',
  '{}'::jsonb,
  '[
    "tax_return_profile.entries[].fiscalYearEndDate",
    "tax_return_profile.entries[].filedDate",
    "corporate_tax_filing_context.liquidation_residual_assets_case"
  ]'::jsonb,
  'warning',
  DATE '2023-04-01',
  NULL,
  'draft',
  FALSE,
  NULL,
  'ai',
  NULL,
  NULL
)
ON CONFLICT (control_code, version_no) DO NOTHING;

-- ============================================================
-- 4. TaxControl -> TaxRule
-- ============================================================

WITH control_row AS (
  SELECT id
  FROM tax_controls
  WHERE control_code = 'TI_TAX_001'
    AND version_no = 1
),
rule_row AS (
  SELECT id
  FROM tax_rules
  WHERE rule_code =
    'TI_RULE_CORP_FINAL_RETURN_DEADLINE'
    AND version_no = 1
)
INSERT INTO tax_control_rules (
  tax_control_id,
  tax_rule_id,
  rule_role
)
SELECT
  control_row.id,
  rule_row.id,
  'primary'
FROM control_row
CROSS JOIN rule_row
ON CONFLICT (
  tax_control_id,
  tax_rule_id
) DO NOTHING;

COMMIT;

-- ============================================================
-- 5. Validation
-- Expected: 2 rows (e_gov / nta)
-- ============================================================

SELECT
  r.id AS tax_rule_id,
  r.rule_code,
  r.version_no AS rule_version,
  r.status AS rule_status,
  r.proposed_by_kind AS rule_proposed_by,
  r.effective_from AS rule_effective_from,

  rsv.authority_role,
  s.provider,
  v.id AS tax_source_version_id,
  v.version_label,
  v.content_hash,

  c.id AS tax_control_id,
  c.control_code,
  c.version_no AS control_version,
  c.control_kind,
  c.evaluator_key,
  c.status AS control_status,
  c.is_enabled,
  c.proposed_by_kind AS control_proposed_by,
  c.effective_from AS control_effective_from,

  cr.rule_role AS control_rule_role

FROM tax_rules r
JOIN tax_rule_source_versions rsv
  ON rsv.tax_rule_id = r.id
JOIN tax_source_versions v
  ON v.id = rsv.tax_source_version_id
JOIN tax_sources s
  ON s.id = v.tax_source_id
JOIN tax_control_rules cr
  ON cr.tax_rule_id = r.id
JOIN tax_controls c
  ON c.id = cr.tax_control_id

WHERE r.rule_code =
    'TI_RULE_CORP_FINAL_RETURN_DEADLINE'
  AND r.version_no = 1
  AND c.control_code = 'TI_TAX_001'
  AND c.version_no = 1

ORDER BY s.provider;
