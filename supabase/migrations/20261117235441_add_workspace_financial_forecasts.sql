-- Approved scope (2026-11-18): ONE forecast-only table, its guard trigger, one invoker save function,
-- narrow authenticated grants and RLS. No backfill, no legacy SQL, no other table grants, no SECURITY DEFINER.
-- Forecast values are accounting-simulation inputs. They are never tax-return, actual, monthly or shared data.
CREATE TABLE public.workspace_financial_forecasts (
  company_id integer NOT NULL REFERENCES public.workspace_companies(id) ON DELETE CASCADE,
  fiscal_start date NOT NULL,
  fiscal_end date NOT NULL,
  scenario_name text NOT NULL,
  is_fictional boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  sales bigint,
  cogs bigint,
  opex bigint,
  other_income bigint,
  other_expense bigint,
  special_gain bigint,
  special_loss bigint,
  tax_expense bigint,
  opening_cash bigint,
  opening_retained_earnings bigint,
  capital bigint,
  borrowing bigint,
  collections bigint,
  cogs_paid bigint,
  opex_paid bigint,
  tax_paid bigint,
  equipment bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, fiscal_start, fiscal_end, scenario_name),
  CONSTRAINT workspace_financial_forecasts_period_check CHECK (
    fiscal_start BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'
    AND fiscal_end BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'
    AND fiscal_start <= fiscal_end AND fiscal_end - fiscal_start <= 731),
  CONSTRAINT workspace_financial_forecasts_scenario_check CHECK (
    scenario_name = btrim(scenario_name) AND char_length(scenario_name) BETWEEN 1 AND 60
    AND scenario_name !~ '[[:cntrl:]]'),
  CONSTRAINT workspace_financial_forecasts_version_check CHECK (version >= 1),
  CONSTRAINT workspace_financial_forecasts_money_check CHECK (
    (sales IS NULL OR sales BETWEEN 0 AND 9007199254740991)
    AND (cogs IS NULL OR cogs BETWEEN 0 AND 9007199254740991)
    AND (opex IS NULL OR opex BETWEEN 0 AND 9007199254740991)
    AND (other_income IS NULL OR other_income BETWEEN 0 AND 9007199254740991)
    AND (other_expense IS NULL OR other_expense BETWEEN 0 AND 9007199254740991)
    AND (special_gain IS NULL OR special_gain BETWEEN 0 AND 9007199254740991)
    AND (special_loss IS NULL OR special_loss BETWEEN 0 AND 9007199254740991)
    AND (tax_expense IS NULL OR tax_expense BETWEEN 0 AND 9007199254740991)
    AND (opening_cash IS NULL OR opening_cash BETWEEN 0 AND 9007199254740991)
    AND (opening_retained_earnings IS NULL OR opening_retained_earnings BETWEEN -9007199254740991 AND 9007199254740991)
    AND (capital IS NULL OR capital BETWEEN 0 AND 9007199254740991)
    AND (borrowing IS NULL OR borrowing BETWEEN 0 AND 9007199254740991)
    AND (collections IS NULL OR collections BETWEEN 0 AND 9007199254740991)
    AND (cogs_paid IS NULL OR cogs_paid BETWEEN 0 AND 9007199254740991)
    AND (opex_paid IS NULL OR opex_paid BETWEEN 0 AND 9007199254740991)
    AND (tax_paid IS NULL OR tax_paid BETWEEN 0 AND 9007199254740991)
    AND (equipment IS NULL OR equipment BETWEEN 0 AND 9007199254740991))
);

-- Version/timestamps are server-controlled even for a direct (RLS-gated) write; the forecast key is immutable.
CREATE FUNCTION public.workspace_financial_forecasts_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.version := 1;
    NEW.created_at := clock_timestamp();
    NEW.updated_at := NEW.created_at;
  ELSE
    IF NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.fiscal_start IS DISTINCT FROM OLD.fiscal_start
      OR NEW.fiscal_end IS DISTINCT FROM OLD.fiscal_end OR NEW.scenario_name IS DISTINCT FROM OLD.scenario_name THEN
      RAISE EXCEPTION 'forecast key is immutable' USING ERRCODE = '22023';
    END IF;
    NEW.created_at := OLD.created_at;
    NEW.version := OLD.version + 1;
    NEW.updated_at := clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.workspace_financial_forecasts_guard() FROM PUBLIC, anon;
CREATE TRIGGER workspace_financial_forecasts_guard BEFORE INSERT OR UPDATE ON public.workspace_financial_forecasts
  FOR EACH ROW EXECUTE FUNCTION public.workspace_financial_forecasts_guard();

ALTER TABLE public.workspace_financial_forecasts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspace_financial_forecasts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.workspace_financial_forecasts TO authenticated;

-- authenticated is not authorization: existing admin AND workspace membership, non-anonymous, are required.
CREATE POLICY workspace_financial_forecasts_select ON public.workspace_financial_forecasts
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) = false
    AND EXISTS (SELECT 1 FROM public.admin_users a WHERE a.email = auth.email())
    AND public.is_workspace_member(company_id) IS TRUE);
CREATE POLICY workspace_financial_forecasts_insert ON public.workspace_financial_forecasts
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) = false
    AND EXISTS (SELECT 1 FROM public.admin_users a WHERE a.email = auth.email())
    AND public.is_workspace_member(company_id, ARRAY['owner','member']) IS TRUE);
CREATE POLICY workspace_financial_forecasts_update ON public.workspace_financial_forecasts
  FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL AND COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) = false
    AND EXISTS (SELECT 1 FROM public.admin_users a WHERE a.email = auth.email())
    AND public.is_workspace_member(company_id, ARRAY['owner','member']) IS TRUE)
  WITH CHECK (auth.uid() IS NOT NULL AND COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) = false
    AND EXISTS (SELECT 1 FROM public.admin_users a WHERE a.email = auth.email())
    AND public.is_workspace_member(company_id, ARRAY['owner','member']) IS TRUE);

-- Atomic compare-and-set save. p_expected: JSON null (create) or {"version":n,"values":{flat values}}.
-- p_values: flat object with is_fictional and the 17 money keys (number or null).
CREATE FUNCTION public.save_workspace_financial_forecast(
  p_company_id integer, p_fiscal_start text, p_fiscal_end text, p_scenario_name text, p_expected jsonb, p_values jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE
  v_money text[] := ARRAY['sales','cogs','opex','other_income','other_expense','special_gain','special_loss','tax_expense','opening_cash','opening_retained_earnings','capital','borrowing','collections','cogs_paid','opex_paid','tax_paid','equipment'];
  v_all text[];
  v_strip text[] := ARRAY['company_id','fiscal_start','fiscal_end','scenario_name','version','created_at','updated_at'];
  v_start date;
  v_end date;
  v_row public.workspace_financial_forecasts%ROWTYPE;
  v_desired public.workspace_financial_forecasts%ROWTYPE;
  v_vals jsonb;
  v_key text;
  v_num numeric;
  v_min numeric;
  v_create boolean;
BEGIN
  IF auth.uid() IS NULL OR COALESCE((auth.jwt()->>'is_anonymous')::boolean,false)
    OR NOT EXISTS(SELECT 1 FROM public.admin_users a WHERE a.email=auth.email())
    OR public.is_workspace_member(p_company_id,ARRAY['owner','member']) IS NOT TRUE THEN
    RAISE EXCEPTION 'forecast permission denied' USING ERRCODE='42501';
  END IF;
  IF p_company_id IS NULL OR p_company_id<=0 OR current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'invalid forecast request' USING ERRCODE='22023';
  END IF;
  v_all := v_money || ARRAY['is_fictional'];
  IF p_fiscal_start IS NULL OR p_fiscal_end IS NULL OR p_fiscal_start !~ '^\d{4}-\d{2}-\d{2}$' OR p_fiscal_end !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'invalid forecast period' USING ERRCODE='22023';
  END IF;
  BEGIN
    v_start := p_fiscal_start::date; v_end := p_fiscal_end::date;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'invalid forecast period' USING ERRCODE='22023';
  END;
  IF to_char(v_start,'YYYY-MM-DD')<>p_fiscal_start OR to_char(v_end,'YYYY-MM-DD')<>p_fiscal_end
    OR v_start NOT BETWEEN DATE '2000-01-01' AND DATE '2100-12-31' OR v_end NOT BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'
    OR v_start>v_end OR v_end-v_start>731 THEN
    RAISE EXCEPTION 'invalid forecast period' USING ERRCODE='22023';
  END IF;
  IF p_scenario_name IS NULL OR p_scenario_name<>btrim(p_scenario_name) OR char_length(p_scenario_name) NOT BETWEEN 1 AND 60
    OR p_scenario_name ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'invalid scenario name' USING ERRCODE='22023';
  END IF;
  v_create := p_expected IS NULL OR p_expected='null'::jsonb;
  IF NOT v_create AND (jsonb_typeof(p_expected) IS DISTINCT FROM 'object' OR NOT p_expected ?& ARRAY['version','values']
    OR p_expected-ARRAY['version','values']<>'{}'::jsonb OR jsonb_typeof(p_expected->'version') IS DISTINCT FROM 'number'
    OR (p_expected->>'version')::numeric<1 OR trunc((p_expected->>'version')::numeric)<>(p_expected->>'version')::numeric) THEN
    RAISE EXCEPTION 'invalid expected state' USING ERRCODE='22023';
  END IF;
  FOR v_vals IN SELECT p_values UNION ALL SELECT p_expected->'values' WHERE NOT v_create LOOP
    IF jsonb_typeof(v_vals) IS DISTINCT FROM 'object' OR NOT v_vals ?& v_all OR v_vals-v_all<>'{}'::jsonb
      OR jsonb_typeof(v_vals->'is_fictional') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'invalid forecast values' USING ERRCODE='22023';
    END IF;
    FOREACH v_key IN ARRAY v_money LOOP
      IF jsonb_typeof(v_vals->v_key) NOT IN ('number','null') THEN
        RAISE EXCEPTION 'invalid forecast number' USING ERRCODE='22023';
      END IF;
      IF jsonb_typeof(v_vals->v_key)='number' THEN
        v_num := (v_vals->>v_key)::numeric;
        v_min := CASE WHEN v_key='opening_retained_earnings' THEN -9007199254740991 ELSE 0 END;
        IF trunc(v_num)<>v_num OR v_num NOT BETWEEN v_min AND 9007199254740991 THEN
          RAISE EXCEPTION 'invalid forecast number' USING ERRCODE='22023';
        END IF;
      END IF;
    END LOOP;
  END LOOP;
  v_desired := jsonb_populate_record(NULL::public.workspace_financial_forecasts,
    p_values || jsonb_build_object('company_id',p_company_id,'fiscal_start',p_fiscal_start,'fiscal_end',p_fiscal_end,'scenario_name',p_scenario_name));

  SELECT f.* INTO v_row FROM public.workspace_financial_forecasts f
   WHERE f.company_id=p_company_id AND f.fiscal_start=v_start AND f.fiscal_end=v_end AND f.scenario_name=p_scenario_name FOR UPDATE;
  IF FOUND THEN
    -- Idempotent acknowledgement: an already committed identical save (e.g. after response loss) changes nothing.
    IF to_jsonb(v_row)-v_strip = p_values THEN
      RETURN jsonb_build_object('result_status','saved','snapshot',to_jsonb(v_row)-'created_at');
    END IF;
    IF v_create OR v_row.version<>(p_expected->>'version')::integer OR to_jsonb(v_row)-v_strip<>p_expected->'values' THEN
      RAISE EXCEPTION 'forecast edit conflict' USING ERRCODE='40001';
    END IF;
    UPDATE public.workspace_financial_forecasts f SET is_fictional=v_desired.is_fictional,
      sales=v_desired.sales,cogs=v_desired.cogs,opex=v_desired.opex,other_income=v_desired.other_income,other_expense=v_desired.other_expense,
      special_gain=v_desired.special_gain,special_loss=v_desired.special_loss,tax_expense=v_desired.tax_expense,opening_cash=v_desired.opening_cash,
      opening_retained_earnings=v_desired.opening_retained_earnings,capital=v_desired.capital,borrowing=v_desired.borrowing,collections=v_desired.collections,
      cogs_paid=v_desired.cogs_paid,opex_paid=v_desired.opex_paid,tax_paid=v_desired.tax_paid,equipment=v_desired.equipment
     WHERE f.company_id=p_company_id AND f.fiscal_start=v_start AND f.fiscal_end=v_end AND f.scenario_name=p_scenario_name;
    IF NOT FOUND THEN RAISE EXCEPTION 'forecast update denied' USING ERRCODE='42501'; END IF;
  ELSE
    IF NOT v_create THEN RAISE EXCEPTION 'forecast edit conflict' USING ERRCODE='40001'; END IF;
    INSERT INTO public.workspace_financial_forecasts(company_id,fiscal_start,fiscal_end,scenario_name,is_fictional,
      sales,cogs,opex,other_income,other_expense,special_gain,special_loss,tax_expense,opening_cash,opening_retained_earnings,capital,borrowing,collections,cogs_paid,opex_paid,tax_paid,equipment)
    VALUES(p_company_id,v_start,v_end,p_scenario_name,v_desired.is_fictional,
      v_desired.sales,v_desired.cogs,v_desired.opex,v_desired.other_income,v_desired.other_expense,v_desired.special_gain,v_desired.special_loss,v_desired.tax_expense,
      v_desired.opening_cash,v_desired.opening_retained_earnings,v_desired.capital,v_desired.borrowing,v_desired.collections,v_desired.cogs_paid,v_desired.opex_paid,v_desired.tax_paid,v_desired.equipment)
    ON CONFLICT (company_id,fiscal_start,fiscal_end,scenario_name) DO NOTHING;
    IF NOT FOUND THEN
      -- A concurrent create won the race: acknowledge only if it holds exactly these values.
      SELECT f.* INTO v_row FROM public.workspace_financial_forecasts f
       WHERE f.company_id=p_company_id AND f.fiscal_start=v_start AND f.fiscal_end=v_end AND f.scenario_name=p_scenario_name FOR UPDATE;
      IF NOT FOUND OR to_jsonb(v_row)-v_strip IS DISTINCT FROM p_values THEN
        RAISE EXCEPTION 'forecast edit conflict' USING ERRCODE='40001';
      END IF;
      RETURN jsonb_build_object('result_status','saved','snapshot',to_jsonb(v_row)-'created_at');
    END IF;
  END IF;
  SELECT f.* INTO v_row FROM public.workspace_financial_forecasts f
   WHERE f.company_id=p_company_id AND f.fiscal_start=v_start AND f.fiscal_end=v_end AND f.scenario_name=p_scenario_name;
  IF NOT FOUND OR to_jsonb(v_row)-v_strip IS DISTINCT FROM p_values THEN
    RAISE EXCEPTION 'forecast save acknowledgement mismatch';
  END IF;
  RETURN jsonb_build_object('result_status','saved','snapshot',to_jsonb(v_row)-'created_at');
END;
$$;
REVOKE ALL ON FUNCTION public.save_workspace_financial_forecast(integer,text,text,text,jsonb,jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.save_workspace_financial_forecast(integer,text,text,text,jsonb,jsonb) TO authenticated;
