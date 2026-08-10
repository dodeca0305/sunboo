-- SUNBOO経営ナビ
-- 共有リンク公開境界のハードニング
--
-- 1. company/profile は公開許可した列だけをJSONへ含める。
-- 2. roadmap未共有時はprocedure statusesを返さない。
-- 3. shared_sectionsを結果へ含め、アプリ側でも公開範囲を強制できるようにする。
-- 4. tax_returnsの既存opt-in公開仕様は維持する。

CREATE OR REPLACE FUNCTION get_shared_workspace_view(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link   workspace_share_links%ROWTYPE;
  v_result JSONB := '{}'::jsonb;
BEGIN
  SELECT *
    INTO v_link
    FROM workspace_share_links
   WHERE token = p_token
     AND revoked_at IS NULL
     AND (expires_at IS NULL OR expires_at > NOW());

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE workspace_share_links
     SET last_accessed_at = NOW()
   WHERE id = v_link.id;

  v_result := v_result || jsonb_build_object(
    'shared_sections',
    v_link.shared_sections
  );

  IF v_link.shared_sections ? 'company' THEN
    v_result := v_result || jsonb_build_object(
      'company',
      (
        SELECT jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'prefecture_code', c.prefecture_code,
          'municipality_code', c.municipality_code,
          'corporate_type', c.corporate_type,
          'fiscal_month', c.fiscal_month
        )
        FROM workspace_companies c
        WHERE c.id = v_link.company_id
      )
    );
  END IF;

  IF v_link.shared_sections ? 'profile' THEN
    v_result := v_result || jsonb_build_object(
      'profile',
      (
        SELECT jsonb_build_object(
          'company_id', p.company_id,
          'employee_count', p.employee_count,
          'capital', p.capital,
          'established_date', p.established_date,
          'stage', p.stage,
          'consumption_tax_status', p.consumption_tax_status,
          'invoice_registration_status', p.invoice_registration_status,
          'taxation_method', p.taxation_method,
          'corporate_tax_interim_filing', p.corporate_tax_interim_filing,
          'consumption_tax_interim_frequency', p.consumption_tax_interim_frequency,
          'withholding_tax_cycle', p.withholding_tax_cycle,
          'local_tax_collection_method', p.local_tax_collection_method,
          'resident_tax_payment_cycle', p.resident_tax_payment_cycle,
          'next_officer_change_date', p.next_officer_change_date,
          'address', p.address,
          'e_tax_enabled', p.e_tax_enabled,
          'e_ltax_enabled', p.e_ltax_enabled,
          'advisors', p.advisors
        )
        FROM workspace_company_profiles p
        WHERE p.company_id = v_link.company_id
      )
    );
  END IF;

  IF v_link.shared_sections ? 'tax_returns' THEN
    v_result := v_result || jsonb_build_object(
      'tax_returns',
      (
        SELECT COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'id', t.id,
              'company_id', t.company_id,
              'fiscal_year', t.fiscal_year,
              'fiscal_year_start_date', t.fiscal_year_start_date,
              'fiscal_year_end_date', t.fiscal_year_end_date,
              'filed_date', t.filed_date,
              'capital_at_filing', t.capital_at_filing,
              'taxable_sales_amount', t.taxable_sales_amount,
              'consumption_tax_status', t.consumption_tax_status,
              'taxation_method', t.taxation_method,
              'invoice_registration_status', t.invoice_registration_status,
              'corporate_tax_amount', t.corporate_tax_amount,
              'consumption_tax_amount', t.consumption_tax_amount,
              'corporate_tax_interim_filing_actual', t.corporate_tax_interim_filing_actual,
              'consumption_tax_interim_frequency_actual', t.consumption_tax_interim_frequency_actual,
              'financial_statement_published', t.financial_statement_published,
              'withholding_tax_cycle_actual', t.withholding_tax_cycle_actual,
              'employee_count_at_fiscal_year_end', t.employee_count_at_fiscal_year_end,
              'created_at', t.created_at,
              'updated_at', t.updated_at
            )
            ORDER BY t.fiscal_year_end_date
          ),
          '[]'::jsonb
        )
        FROM workspace_tax_return_profiles t
        WHERE t.company_id = v_link.company_id
      )
    );
  END IF;

  IF v_link.shared_sections ? 'roadmap' THEN
    v_result := v_result || jsonb_build_object(
      'statuses',
      (
        SELECT COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'procedure_id', s.procedure_id,
              'occurrence_key', s.occurrence_key,
              'status', s.status
            )
          ),
          '[]'::jsonb
        )
        FROM workspace_procedure_statuses s
        WHERE s.company_id = v_link.company_id
      )
    );
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_shared_workspace_view(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_shared_workspace_view(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_shared_workspace_view(TEXT) TO anon;
