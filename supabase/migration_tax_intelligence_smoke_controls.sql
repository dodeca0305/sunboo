-- ============================================================
-- SUNBOO Tax Intelligence
-- TI-0.5: 5 MVP Smoke Controls
--
-- Initial seed policy:
--   status     = draft
--   is_enabled = false
--
-- Human review is required before approval / activation.
-- Smoke Controls intentionally have no TaxRule links.
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
  proposed_by_kind,
  approved_by,
  approved_at
)
VALUES

(
  'TI_DATA_001',
  1,
  'data_quality',
  'Duplicate Fiscal Period',
  '同じ決算期のTaxReturnProfileが重複していないか確認するSmoke Control。',
  'tax-intelligence/duplicate-fiscal-period',
  '{}'::jsonb,
  '[
    "tax_return_profile.entries[].fiscal_year_end_date"
  ]'::jsonb,
  'warning',
  NULL,
  NULL,
  'draft',
  false,
  'system',
  NULL,
  NULL
),

(
  'TI_DATA_002',
  1,
  'data_quality',
  'Fiscal Date Order',
  '決算開始日、決算終了日、申告日の順序に矛盾がないか確認するSmoke Control。',
  'tax-intelligence/fiscal-date-order',
  '{}'::jsonb,
  '[
    "tax_return_profile.entries[].fiscal_year_start_date",
    "tax_return_profile.entries[].fiscal_year_end_date",
    "tax_return_profile.entries[].filed_date"
  ]'::jsonb,
  'warning',
  NULL,
  NULL,
  'draft',
  false,
  'system',
  NULL,
  NULL
),

(
  'TI_STATE_001',
  1,
  'state_consistency',
  'Consumption Tax State Consistency',
  'CompanyProfileと最新TaxReturnProfileの消費税状態の整合性を確認するSmoke Control。',
  'tax-intelligence/consumption-tax-state-consistency',
  '{}'::jsonb,
  '[
    "company_profile.consumption_tax_status",
    "tax_return_profile.latest.consumption_tax_status"
  ]'::jsonb,
  'warning',
  NULL,
  NULL,
  'draft',
  false,
  'system',
  NULL,
  NULL
),

(
  'TI_STATE_002',
  1,
  'state_consistency',
  'Invoice Registration Consistency',
  'CompanyProfileと最新TaxReturnProfileのインボイス登録状態の整合性を確認するSmoke Control。',
  'tax-intelligence/invoice-registration-consistency',
  '{}'::jsonb,
  '[
    "company_profile.invoice_registration_status",
    "tax_return_profile.latest.invoice_registration_status"
  ]'::jsonb,
  'warning',
  NULL,
  NULL,
  'draft',
  false,
  'system',
  NULL,
  NULL
),

(
  'TI_STATE_003',
  1,
  'state_consistency',
  'Fiscal Month Consistency',
  'Workspace会社情報の決算月と最新TaxReturnProfileの決算日の月を比較するSmoke Control。',
  'tax-intelligence/fiscal-month-consistency',
  '{}'::jsonb,
  '[
    "company_profile.fiscal_month",
    "tax_return_profile.latest.fiscal_year_end_date"
  ]'::jsonb,
  'warning',
  NULL,
  NULL,
  'draft',
  false,
  'system',
  NULL,
  NULL
)

ON CONFLICT (control_code, version_no) DO NOTHING;

-- ============================================================
-- Validation
-- ============================================================

SELECT
  control_code,
  version_no,
  control_kind,
  evaluator_key,
  default_severity,
  status,
  is_enabled,
  proposed_by_kind
FROM tax_controls
WHERE control_code IN (
  'TI_DATA_001',
  'TI_DATA_002',
  'TI_STATE_001',
  'TI_STATE_002',
  'TI_STATE_003'
)
ORDER BY control_code, version_no;
