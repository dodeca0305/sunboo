-- Function and EXECUTE ACL only. No table, column, or RLS changes.
CREATE FUNCTION public.save_admin_office(p_office_id integer, p_expected jsonb, p_values jsonb, p_municipality_ids integer[])
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' SET lock_timeout = '5s' AS $function$
DECLARE v_office public.organization_offices; v_org public.organizations; v_regions jsonb; v_key text; v_id integer; v_org_id integer;
BEGIN
 IF auth.uid() IS NULL OR COALESCE(auth.jwt()->>'is_anonymous','false')='true'
 OR NOT EXISTS(SELECT 1 FROM public.admin_users a WHERE a.email=auth.email()) THEN
  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Administrator access required'; END IF;
 IF jsonb_typeof(p_values) IS DISTINCT FROM 'object' OR jsonb_typeof(p_values->'name') IS DISTINCT FROM 'string'
 OR btrim(p_values->>'name')='' OR jsonb_typeof(p_values->'organization_name') IS DISTINCT FROM 'string'
 OR btrim(p_values->>'organization_name')='' OR (p_values->>'organization_type_id') IS NULL
 OR (p_values->>'organization_type_id') !~ '^[1-9][0-9]*$' OR p_municipality_ids IS NULL
 OR EXISTS(SELECT 1 FROM unnest(p_municipality_ids) x WHERE x IS NULL OR x<=0)
 OR cardinality(p_municipality_ids)<>(SELECT count(DISTINCT x) FROM unnest(p_municipality_ids) x)
 OR (p_values->>'official_url_status') IS NULL OR (p_values->>'official_url_status') NOT IN ('unchecked','ok','redirected','broken') THEN
  RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid office payload'; END IF;
 FOR v_key IN SELECT unnest(ARRAY['postal_code','address','phone','fax','email','website_url','official_url','fallback_url','e_filing_url','download_page_url','map_url','business_hours','notes']) LOOP
 IF jsonb_typeof(p_values->v_key) IS DISTINCT FROM 'string' THEN
 RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid text field'; END IF; END LOOP;
 -- Short admin-only transactions serialize writers, including legacy direct writes.
 -- Plain readers remain unblocked. Do not lock or modify option/master tables.
 LOCK TABLE public.organizations, public.organization_offices, public.jurisdictions IN SHARE ROW EXCLUSIVE MODE;
 IF p_office_id IS NOT NULL THEN
  SELECT * INTO v_office FROM public.organization_offices WHERE id=p_office_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='Office not found'; END IF;
  SELECT * INTO v_org FROM public.organizations WHERE id=v_office.organization_id;
  SELECT COALESCE(jsonb_agg(to_jsonb(j) ORDER BY j.id),'[]'::jsonb) INTO v_regions FROM public.jurisdictions j WHERE organization_office_id=p_office_id;
  IF p_expected IS DISTINCT FROM jsonb_build_object('office',to_jsonb(v_office),'organization',to_jsonb(v_org),'jurisdictions',v_regions) THEN
   RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='Office configuration changed; reload'; END IF;
 ELSIF p_expected IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Unexpected new office baseline'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.organization_types WHERE id=(p_values->>'organization_type_id')::integer AND is_active)
 OR EXISTS(SELECT 1 FROM unnest(p_municipality_ids) x WHERE NOT EXISTS(SELECT 1 FROM public.municipalities m WHERE m.id=x)) THEN
 RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Option unavailable'; END IF;
 -- Never move a jurisdiction away from another office.
 IF EXISTS(SELECT 1 FROM public.jurisdictions WHERE municipality_id=ANY(p_municipality_ids)
 AND organization_type_id=(p_values->>'organization_type_id')::integer
 AND organization_office_id IS DISTINCT FROM p_office_id) THEN
 RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='Municipality belongs to another office'; END IF;
 SELECT id INTO v_org_id FROM public.organizations WHERE organization_type_id=(p_values->>'organization_type_id')::integer AND name=btrim(p_values->>'organization_name');
 IF v_org_id IS NULL THEN
 INSERT INTO public.organizations(organization_type_id,name) VALUES((p_values->>'organization_type_id')::integer,btrim(p_values->>'organization_name')) RETURNING id INTO v_org_id;
 END IF;
 -- Existing organizations are reused verbatim; changing this office's association never renames a shared organization.
 IF p_office_id IS NULL THEN
 INSERT INTO public.organization_offices(organization_id,name,official_url_status,postal_code,address,phone,fax,email,website_url,official_url,fallback_url,e_filing_url,download_page_url,map_url,business_hours,notes) VALUES(v_org_id,btrim(p_values->>'name'),p_values->>'official_url_status',nullif(p_values->>'postal_code',''),nullif(p_values->>'address',''),nullif(p_values->>'phone',''),nullif(p_values->>'fax',''),nullif(p_values->>'email',''),nullif(p_values->>'website_url',''),nullif(p_values->>'official_url',''),nullif(p_values->>'fallback_url',''),nullif(p_values->>'e_filing_url',''),nullif(p_values->>'download_page_url',''),nullif(p_values->>'map_url',''),nullif(p_values->>'business_hours',''),nullif(p_values->>'notes','')) RETURNING id INTO v_id;
 ELSE
 UPDATE public.organization_offices SET organization_id=v_org_id,name=btrim(p_values->>'name'),official_url_status=p_values->>'official_url_status',postal_code=nullif(p_values->>'postal_code',''),address=nullif(p_values->>'address',''),phone=nullif(p_values->>'phone',''),fax=nullif(p_values->>'fax',''),email=nullif(p_values->>'email',''),website_url=nullif(p_values->>'website_url',''),official_url=nullif(p_values->>'official_url',''),fallback_url=nullif(p_values->>'fallback_url',''),e_filing_url=nullif(p_values->>'e_filing_url',''),download_page_url=nullif(p_values->>'download_page_url',''),map_url=nullif(p_values->>'map_url',''),business_hours=nullif(p_values->>'business_hours',''),notes=nullif(p_values->>'notes',''),updated_at=clock_timestamp() WHERE id=p_office_id RETURNING id INTO v_id;
 IF v_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Office update denied'; END IF;
 END IF;
 DELETE FROM public.jurisdictions WHERE organization_office_id=v_id;
 IF EXISTS(SELECT 1 FROM public.jurisdictions WHERE organization_office_id=v_id) THEN
 RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Jurisdiction replacement denied'; END IF;
 INSERT INTO public.jurisdictions(municipality_id,organization_type_id,organization_office_id)
 SELECT x,(p_values->>'organization_type_id')::integer,v_id FROM unnest(p_municipality_ids) x;
 SELECT * INTO v_office FROM public.organization_offices WHERE id=v_id;
 SELECT * INTO v_org FROM public.organizations WHERE id=v_office.organization_id;
 SELECT COALESCE(jsonb_agg(to_jsonb(j) ORDER BY j.id),'[]'::jsonb) INTO v_regions FROM public.jurisdictions j WHERE organization_office_id=v_id;
 RETURN jsonb_build_object('id',v_id,'snapshot',jsonb_build_object('office',to_jsonb(v_office),'organization',to_jsonb(v_org),'jurisdictions',v_regions));
END; $function$;
REVOKE ALL ON FUNCTION public.save_admin_office(integer,jsonb,jsonb,integer[]) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.save_admin_office(integer,jsonb,jsonb,integer[]) TO authenticated;
