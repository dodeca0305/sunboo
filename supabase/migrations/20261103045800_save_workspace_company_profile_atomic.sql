-- Approved addition: one invoker function and its execution ACL only.
CREATE FUNCTION public.save_workspace_company_profile(p_company_id integer,p_expected jsonb,p_values jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE
 v_company public.workspace_companies%ROWTYPE;
 v_profile public.workspace_company_profiles%ROWTYPE;
 v_desired public.workspace_company_profiles%ROWTYPE;
 v_current jsonb;
 v_input jsonb;
 v_p jsonb;
 v_key text;
 v_keys text[] := ARRAY['employee_count','capital','established_date','stage','consumption_tax_status','invoice_registration_status','taxation_method','corporate_tax_interim_filing','consumption_tax_interim_frequency','withholding_tax_cycle','local_tax_collection_method','resident_tax_payment_cycle','next_officer_change_date','address','e_tax_enabled','e_ltax_enabled','advisors'];
BEGIN
 IF auth.uid() IS NULL OR COALESCE((auth.jwt()->>'is_anonymous')::boolean,false)
  OR NOT EXISTS(SELECT 1 FROM public.admin_users a WHERE a.email=auth.email())
  OR public.is_workspace_member(p_company_id,ARRAY['owner','member']) IS NOT TRUE THEN
  RAISE EXCEPTION 'profile permission denied' USING ERRCODE='42501';
 END IF;
 IF p_company_id IS NULL OR p_company_id<=0 OR current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'invalid profile request' USING ERRCODE='22023';
 END IF;
 FOR v_input IN SELECT p_expected UNION ALL SELECT p_values LOOP
  IF jsonb_typeof(v_input) IS DISTINCT FROM 'object' OR NOT v_input ?& ARRAY['companyFields','profileFields']
    OR v_input-ARRAY['companyFields','profileFields']<>'{}'::jsonb
    OR jsonb_typeof(v_input->'companyFields') IS DISTINCT FROM 'object'
    OR NOT (v_input->'companyFields') ?& ARRAY['corporate_type','fiscal_month']
    OR (v_input->'companyFields')-ARRAY['corporate_type','fiscal_month']<>'{}'::jsonb
    OR v_input->'companyFields'->>'corporate_type' NOT IN ('kabushiki','godo')
    OR jsonb_typeof(v_input->'companyFields'->'corporate_type') IS DISTINCT FROM 'string'
    OR jsonb_typeof(v_input->'companyFields'->'fiscal_month') NOT IN ('number','null') THEN
   RAISE EXCEPTION 'invalid company fields' USING ERRCODE='22023';
  END IF;
  IF v_input->'companyFields'->'fiscal_month'<>'null'::jsonb AND
    ((v_input->'companyFields'->>'fiscal_month')::numeric NOT BETWEEN 1 AND 12 OR
     trunc((v_input->'companyFields'->>'fiscal_month')::numeric)<>(v_input->'companyFields'->>'fiscal_month')::numeric) THEN
   RAISE EXCEPTION 'invalid fiscal month' USING ERRCODE='22023';
  END IF;
  v_p:=v_input->'profileFields';
  IF v_p='null'::jsonb THEN CONTINUE; END IF;
  IF jsonb_typeof(v_p) IS DISTINCT FROM 'object' OR NOT v_p ?& v_keys OR v_p-v_keys<>'{}'::jsonb THEN
   RAISE EXCEPTION 'incomplete profile fields' USING ERRCODE='22023';
  END IF;
  FOREACH v_key IN ARRAY ARRAY['employee_count','capital'] LOOP
   IF v_key='capital' AND v_p->v_key='null'::jsonb THEN CONTINUE; END IF;
   IF jsonb_typeof(v_p->v_key) IS DISTINCT FROM 'number' OR (v_p->>v_key)::numeric NOT BETWEEN 0 AND 9007199254740991
    OR trunc((v_p->>v_key)::numeric)<>(v_p->>v_key)::numeric THEN
    RAISE EXCEPTION 'invalid profile number' USING ERRCODE='22023';
   END IF;
  END LOOP;
  FOREACH v_key IN ARRAY ARRAY['e_tax_enabled','e_ltax_enabled'] LOOP
   IF jsonb_typeof(v_p->v_key) IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'invalid boolean' USING ERRCODE='22023'; END IF;
  END LOOP;
  FOREACH v_key IN ARRAY ARRAY['established_date','next_officer_change_date','address','taxation_method'] LOOP
   IF jsonb_typeof(v_p->v_key) NOT IN ('string','null') THEN RAISE EXCEPTION 'invalid optional value' USING ERRCODE='22023'; END IF;
  END LOOP;
  IF jsonb_typeof(v_p->'advisors') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid advisors' USING ERRCODE='22023'; END IF;
  FOREACH v_key IN ARRAY ARRAY['taxAccountant','laborConsultant','judicialScrivener','administrativeScrivener'] LOOP
   IF jsonb_typeof(v_p->'advisors'->v_key) IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'invalid advisors' USING ERRCODE='22023'; END IF;
  END LOOP;
 END LOOP;
 IF p_values->'profileFields'='null'::jsonb THEN RAISE EXCEPTION 'profile values required' USING ERRCODE='22023'; END IF;
 SELECT c.* INTO v_company FROM public.workspace_companies c WHERE c.id=p_company_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'company unavailable' USING ERRCODE='42501'; END IF;
 SELECT p.* INTO v_profile FROM public.workspace_company_profiles p WHERE p.company_id=p_company_id FOR UPDATE;
 v_current:=jsonb_build_object('companyFields',jsonb_build_object('corporate_type',v_company.corporate_type,'fiscal_month',v_company.fiscal_month),'profileFields',CASE WHEN v_profile.company_id IS NULL THEN 'null'::jsonb ELSE jsonb_build_object('employee_count',v_profile.employee_count,'capital',v_profile.capital,'established_date',v_profile.established_date,'stage',v_profile.stage,'consumption_tax_status',v_profile.consumption_tax_status,'invoice_registration_status',v_profile.invoice_registration_status,'taxation_method',v_profile.taxation_method,'corporate_tax_interim_filing',v_profile.corporate_tax_interim_filing,'consumption_tax_interim_frequency',v_profile.consumption_tax_interim_frequency,'withholding_tax_cycle',v_profile.withholding_tax_cycle,'local_tax_collection_method',v_profile.local_tax_collection_method,'resident_tax_payment_cycle',v_profile.resident_tax_payment_cycle,'next_officer_change_date',v_profile.next_officer_change_date,'address',v_profile.address,'e_tax_enabled',v_profile.e_tax_enabled,'e_ltax_enabled',v_profile.e_ltax_enabled,'advisors',v_profile.advisors) END);
 IF v_current=p_values THEN RETURN jsonb_build_object('company_id',p_company_id,'result_status','saved','snapshot',v_current); END IF;
 IF v_current IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'profile edit conflict' USING ERRCODE='40001'; END IF;
 v_desired:=jsonb_populate_record(NULL::public.workspace_company_profiles,p_values->'profileFields');
 UPDATE public.workspace_companies SET corporate_type=p_values->'companyFields'->>'corporate_type',
  fiscal_month=(p_values->'companyFields'->>'fiscal_month')::integer WHERE id=p_company_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'company update denied' USING ERRCODE='42501'; END IF;
 INSERT INTO public.workspace_company_profiles(company_id,employee_count,capital,established_date,stage,consumption_tax_status,invoice_registration_status,taxation_method,corporate_tax_interim_filing,consumption_tax_interim_frequency,withholding_tax_cycle,local_tax_collection_method,resident_tax_payment_cycle,next_officer_change_date,address,e_tax_enabled,e_ltax_enabled,advisors)
 VALUES(p_company_id,v_desired.employee_count,v_desired.capital,v_desired.established_date,v_desired.stage,v_desired.consumption_tax_status,v_desired.invoice_registration_status,v_desired.taxation_method,v_desired.corporate_tax_interim_filing,v_desired.consumption_tax_interim_frequency,v_desired.withholding_tax_cycle,v_desired.local_tax_collection_method,v_desired.resident_tax_payment_cycle,v_desired.next_officer_change_date,v_desired.address,v_desired.e_tax_enabled,v_desired.e_ltax_enabled,v_desired.advisors)
 ON CONFLICT(company_id) DO UPDATE SET employee_count=EXCLUDED.employee_count,capital=EXCLUDED.capital,established_date=EXCLUDED.established_date,stage=EXCLUDED.stage,consumption_tax_status=EXCLUDED.consumption_tax_status,invoice_registration_status=EXCLUDED.invoice_registration_status,taxation_method=EXCLUDED.taxation_method,corporate_tax_interim_filing=EXCLUDED.corporate_tax_interim_filing,consumption_tax_interim_frequency=EXCLUDED.consumption_tax_interim_frequency,withholding_tax_cycle=EXCLUDED.withholding_tax_cycle,local_tax_collection_method=EXCLUDED.local_tax_collection_method,resident_tax_payment_cycle=EXCLUDED.resident_tax_payment_cycle,next_officer_change_date=EXCLUDED.next_officer_change_date,address=EXCLUDED.address,e_tax_enabled=EXCLUDED.e_tax_enabled,e_ltax_enabled=EXCLUDED.e_ltax_enabled,advisors=EXCLUDED.advisors;
 SELECT c.* INTO v_company FROM public.workspace_companies c WHERE c.id=p_company_id;
 SELECT p.* INTO v_profile FROM public.workspace_company_profiles p WHERE p.company_id=p_company_id;
 v_current:=jsonb_build_object('companyFields',jsonb_build_object('corporate_type',v_company.corporate_type,'fiscal_month',v_company.fiscal_month),'profileFields',CASE WHEN v_profile.company_id IS NULL THEN 'null'::jsonb ELSE jsonb_build_object('employee_count',v_profile.employee_count,'capital',v_profile.capital,'established_date',v_profile.established_date,'stage',v_profile.stage,'consumption_tax_status',v_profile.consumption_tax_status,'invoice_registration_status',v_profile.invoice_registration_status,'taxation_method',v_profile.taxation_method,'corporate_tax_interim_filing',v_profile.corporate_tax_interim_filing,'consumption_tax_interim_frequency',v_profile.consumption_tax_interim_frequency,'withholding_tax_cycle',v_profile.withholding_tax_cycle,'local_tax_collection_method',v_profile.local_tax_collection_method,'resident_tax_payment_cycle',v_profile.resident_tax_payment_cycle,'next_officer_change_date',v_profile.next_officer_change_date,'address',v_profile.address,'e_tax_enabled',v_profile.e_tax_enabled,'e_ltax_enabled',v_profile.e_ltax_enabled,'advisors',v_profile.advisors) END);
 IF v_current IS DISTINCT FROM p_values THEN RAISE EXCEPTION 'profile save acknowledgement mismatch'; END IF;
 RETURN jsonb_build_object('company_id',p_company_id,'result_status','saved','snapshot',v_current);
END;
$$;
REVOKE ALL ON FUNCTION public.save_workspace_company_profile(integer,jsonb,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.save_workspace_company_profile(integer,jsonb,jsonb) TO authenticated;
