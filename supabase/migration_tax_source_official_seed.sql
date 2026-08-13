-- ============================================================
-- SUNBOO Tax Intelligence — TI-0.7
-- Official TaxSource manual seed
-- ============================================================
--
-- Source:
-- National Tax Agency (Japan)
-- C1-1 法人税、地方法人税及び防衛特別法人税の申告
--
-- This is the first manually curated official TaxSource family.
-- No TaxRule / TaxControl is created in TI-0.7.
-- ============================================================

INSERT INTO tax_sources (
  provider,
  source_type,
  tax_type,
  title,
  canonical_locator,
  jurisdiction,
  is_active
)
VALUES (
  'nta',
  'administrative_guideline',
  NULL,
  'C1-1 法人税、地方法人税及び防衛特別法人税の申告（法人税申告書別表等）',
  'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/hojin/shinkoku/01.htm',
  'JP',
  TRUE
)
ON CONFLICT (provider, canonical_locator) DO NOTHING;

WITH source_row AS (
  SELECT id
  FROM tax_sources
  WHERE provider = 'nta'
    AND canonical_locator =
      'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/hojin/shinkoku/01.htm'
)
INSERT INTO tax_source_versions (
  tax_source_id,
  version_label,
  content_hash,
  published_at,
  effective_from,
  effective_to,
  observed_at,
  retrieved_at,
  supersedes_version_id,
  raw_reference,
  normalized_text
)
SELECT
  source_row.id,
  'manual-seed-2026-08-13',
  'bb1824ef6cb588a16f2cf2047c021f79ea5dce8136d94f52397a18d744053cc5',
  NULL,
  NULL,
  NULL,
  NOW(),
  NOW(),
  NULL,
  'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/hojin/shinkoku/01.htm',
  $normalized$source=C1-1
topic=corporate-tax-filing
general_due_rule=business-year-end-next-day+2-months
extension_rule=use-extended-deadline-if-approved
holiday_rule=next-day-when-deadline-falls-on-weekend-or-national-holiday$normalized$
FROM source_row
ON CONFLICT (tax_source_id, content_hash) DO NOTHING;

-- ============================================================
-- Validation
-- ============================================================

SELECT
  s.id AS tax_source_id,
  s.provider,
  s.source_type,
  s.tax_type,
  s.title,
  s.canonical_locator,
  s.is_active,
  v.id AS tax_source_version_id,
  v.version_label,
  v.content_hash,
  v.observed_at,
  v.retrieved_at,
  v.supersedes_version_id
FROM tax_sources s
JOIN tax_source_versions v
  ON v.tax_source_id = s.id
WHERE s.provider = 'nta'
  AND s.canonical_locator =
    'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/hojin/shinkoku/01.htm'
ORDER BY v.retrieved_at DESC;
