-- Only this function and its EXECUTE privileges are added. No table/column/RLS changes.
CREATE FUNCTION public.save_admin_rule(
  p_rule_id integer,
  p_expected_updated_at timestamptz,
  p_rule jsonb,
  p_conditions jsonb,
  p_actions jsonb
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_rule_id integer;
  v_updated_at timestamptz;
  v_row jsonb;
BEGIN
  -- Authentication alone is insufficient: keep the existing admin_users authorization.
  IF auth.uid() IS NULL OR COALESCE(auth.jwt()->>'is_anonymous', 'false') = 'true'
     OR NOT EXISTS (SELECT 1 FROM public.admin_users a WHERE a.email = auth.email()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Administrator access required';
  END IF;

  IF jsonb_typeof(p_rule) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_rule->'name') IS DISTINCT FROM 'string' OR btrim(p_rule->>'name') = ''
     OR jsonb_typeof(p_rule->'priority') IS DISTINCT FROM 'number'
     OR (p_rule->>'priority') !~ '^-?[0-9]+$'
     OR jsonb_typeof(p_rule->'is_active') IS DISTINCT FROM 'boolean'
     OR (p_rule ? 'description' AND jsonb_typeof(p_rule->'description') NOT IN ('string', 'null'))
     OR jsonb_typeof(p_conditions) IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_actions) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid rule payload';
  END IF;
  IF jsonb_array_length(p_actions) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'At least one action is required';
  END IF;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_conditions) LOOP
    IF jsonb_typeof(v_row) IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_row->'field') IS DISTINCT FROM 'string' OR btrim(v_row->>'field') = ''
       OR NOT (v_row ? 'value')
       OR (v_row->>'operator') IS NULL
       OR (v_row->>'operator') NOT IN ('eq','neq','in','not_in','gt','gte','lt','lte') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid condition payload';
    END IF;
  END LOOP;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_actions) LOOP
    IF jsonb_typeof(v_row) IS DISTINCT FROM 'object'
       OR (v_row->>'action_type') IS NULL
       OR (v_row->>'action_type') NOT IN ('add_procedure','show_warning','change_office','change_deadline') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid action payload';
    END IF;
    IF v_row->>'action_type' = 'show_warning' THEN
      IF jsonb_typeof(v_row->'payload'->'message') IS DISTINCT FROM 'string'
         OR btrim(v_row->'payload'->>'message') = '' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Warning message is required';
      END IF;
    ELSIF jsonb_typeof(v_row->'procedure_id') IS DISTINCT FROM 'number'
       OR (v_row->>'procedure_id') !~ '^[1-9][0-9]*$' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Procedure is required';
    END IF;
  END LOOP;

  IF p_rule_id IS NULL THEN
    IF p_expected_updated_at IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Unexpected version for new rule';
    END IF;
    INSERT INTO public.rules(name, description, priority, is_active)
    VALUES (btrim(p_rule->>'name'), nullif(btrim(p_rule->>'description'), ''),
            (p_rule->>'priority')::integer, (p_rule->>'is_active')::boolean)
    RETURNING id INTO v_rule_id;
  ELSE
    SELECT r.updated_at INTO v_updated_at FROM public.rules r WHERE r.id = p_rule_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Rule not found';
    END IF;
    IF p_expected_updated_at IS NULL OR v_updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Rule changed; reload before saving';
    END IF;
    v_rule_id := p_rule_id;
    UPDATE public.rules SET name = btrim(p_rule->>'name'),
      description = nullif(btrim(p_rule->>'description'), ''),
      priority = (p_rule->>'priority')::integer, is_active = (p_rule->>'is_active')::boolean,
      updated_at = clock_timestamp()
    WHERE id = v_rule_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Rule update denied';
    END IF;
  END IF;

  DELETE FROM public.rule_conditions WHERE rule_id = v_rule_id;
  DELETE FROM public.rule_actions WHERE rule_id = v_rule_id;
  IF EXISTS (SELECT 1 FROM public.rule_conditions WHERE rule_id = v_rule_id)
     OR EXISTS (SELECT 1 FROM public.rule_actions WHERE rule_id = v_rule_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Rule replacement denied';
  END IF;
  INSERT INTO public.rule_conditions(rule_id, field, operator, value, sort_order)
    SELECT v_rule_id, btrim(c.value->>'field'), c.value->>'operator', c.value->'value', (c.ordinality - 1)::integer
    FROM jsonb_array_elements(p_conditions) WITH ORDINALITY AS c(value, ordinality);
  INSERT INTO public.rule_actions(rule_id, action_type, procedure_id, payload, sort_order)
    SELECT v_rule_id, a.value->>'action_type',
      CASE WHEN a.value->>'action_type' = 'show_warning' THEN NULL ELSE (a.value->>'procedure_id')::integer END,
      nullif(a.value->'payload', 'null'::jsonb), (a.ordinality - 1)::integer
    FROM jsonb_array_elements(p_actions) WITH ORDINALITY AS a(value, ordinality);

  -- No exception handler: any failure rolls back the parent and both child sets.
  SELECT r.updated_at INTO v_updated_at FROM public.rules r WHERE r.id = v_rule_id;
  RETURN jsonb_build_object('id', v_rule_id, 'updated_at', v_updated_at);
END;
$function$;
REVOKE ALL ON FUNCTION public.save_admin_rule(integer,timestamptz,jsonb,jsonb,jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.save_admin_rule(integer,timestamptz,jsonb,jsonb,jsonb) TO authenticated;
