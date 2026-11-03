-- Approved scope: one request ledger, one RPC, its ACL, four creation policies.
CREATE TABLE public.workspace_company_creation_requests (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  request_payload jsonb NOT NULL CHECK (jsonb_typeof(request_payload) = 'object'),
  company_id integer REFERENCES public.workspace_companies(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.workspace_company_creation_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.workspace_company_creation_requests FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.create_workspace_company(p_request_id uuid, p_values jsonb, p_mode text DEFAULT 'create')
RETURNS TABLE(request_id uuid, result_status text, company_id integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_email text := auth.email();
  v_payload jsonb;
  v_existing public.workspace_company_creation_requests%ROWTYPE;
  v_company integer;
  v_month integer;
BEGIN
  IF v_actor IS NULL OR COALESCE((auth.jwt()->>'is_anonymous')::boolean, false)
     OR NOT EXISTS (SELECT 1 FROM public.admin_users a WHERE a.email=v_email) THEN
    RAISE EXCEPTION 'company creation permission denied' USING ERRCODE='42501';
  END IF;
  IF p_request_id IS NULL OR p_mode NOT IN ('create','confirm') OR p_mode IS NULL THEN
    RAISE EXCEPTION 'invalid creation request';
  END IF;
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'company creation requires read committed isolation';
  END IF;
  IF jsonb_typeof(p_values) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_values->'name') IS DISTINCT FROM 'string'
     OR NULLIF(btrim(p_values->>'name'),'') IS NULL
     OR jsonb_typeof(p_values->'prefecture_code') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_values->'municipality_code') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_values->'corporate_type') IS DISTINCT FROM 'string'
     OR p_values->>'corporate_type' NOT IN ('kabushiki','godo')
     OR jsonb_typeof(p_values->'fiscal_month') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'invalid company fields' USING ERRCODE='22023';
  END IF;
  IF (p_values->>'fiscal_month')::numeric NOT BETWEEN 1 AND 12
     OR trunc((p_values->>'fiscal_month')::numeric) <> (p_values->>'fiscal_month')::numeric THEN
    RAISE EXCEPTION 'invalid fiscal month' USING ERRCODE='22023';
  END IF;
  v_month := (p_values->>'fiscal_month')::integer;
  v_payload := jsonb_build_object('name',btrim(p_values->>'name'),'prefecture_code',p_values->>'prefecture_code',
    'municipality_code',p_values->>'municipality_code','corporate_type',p_values->>'corporate_type','fiscal_month',v_month);
  IF p_values - ARRAY['name','prefecture_code','municipality_code','corporate_type','fiscal_month'] <> '{}'::jsonb THEN
    RAISE EXCEPTION 'unexpected company fields' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('sunboo:company-create:'||p_request_id::text,0));
  SELECT r.* INTO v_existing FROM public.workspace_company_creation_requests r WHERE r.request_id=p_request_id;
  IF FOUND THEN
    IF v_existing.actor_id <> v_actor THEN
      RAISE EXCEPTION 'creation request unavailable' USING ERRCODE='42501';
    END IF;
    IF v_existing.request_payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'creation request conflicts with different input' USING ERRCODE='22023';
    END IF;
    IF v_existing.company_id IS NULL THEN
      RETURN QUERY SELECT p_request_id,'deleted'::text,NULL::integer;
      RETURN;
    END IF;
    IF public.is_workspace_member(v_existing.company_id,ARRAY['owner','member']) IS NOT TRUE THEN
      RAISE EXCEPTION 'creation result permission denied' USING ERRCODE='42501';
    END IF;
    RETURN QUERY SELECT p_request_id,'existing'::text,v_existing.company_id;
    RETURN;
  END IF;
  IF p_mode='confirm' THEN
    RETURN QUERY SELECT p_request_id,'not_found'::text,NULL::integer;
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.municipalities m JOIN public.prefectures p ON p.id=m.prefecture_id
    WHERE m.code=v_payload->>'municipality_code' AND p.code=v_payload->>'prefecture_code') THEN
    RAISE EXCEPTION 'municipality does not belong to prefecture' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.workspace_company_creation_requests(request_id,actor_id,request_payload)
    VALUES(p_request_id,v_actor,v_payload);
  INSERT INTO public.workspace_companies(name,prefecture_code,municipality_code,corporate_type,fiscal_month)
    VALUES(v_payload->>'name',v_payload->>'prefecture_code',v_payload->>'municipality_code',v_payload->>'corporate_type',v_month)
    RETURNING id INTO v_company;
  INSERT INTO public.workspace_members(company_id,email,role) VALUES(v_company,v_email,'owner');
  UPDATE public.workspace_company_creation_requests r SET company_id=v_company WHERE r.request_id=p_request_id AND r.actor_id=v_actor;
  RETURN QUERY SELECT p_request_id,'created'::text,v_company;
END;
$$;
REVOKE ALL ON FUNCTION public.create_workspace_company(uuid,jsonb,text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_workspace_company(uuid,jsonb,text) TO authenticated;

DROP POLICY admin_insert ON public.workspace_companies;
DROP POLICY member_select ON public.workspace_companies;
CREATE POLICY member_select ON public.workspace_companies FOR SELECT
  USING (auth.email() IN (SELECT email FROM public.admin_users) AND public.is_workspace_member(id));
DROP POLICY member_delete ON public.workspace_companies;
CREATE POLICY member_delete ON public.workspace_companies FOR DELETE
  USING (auth.email() IN (SELECT email FROM public.admin_users) AND public.is_workspace_member(id,ARRAY['owner']));
DROP POLICY member_insert ON public.workspace_members;
CREATE POLICY member_insert ON public.workspace_members FOR INSERT
  WITH CHECK (auth.email() IN (SELECT email FROM public.admin_users) AND public.is_workspace_member(company_id,ARRAY['owner']));
