-- Emergency disable only the new RPC. Keep the protected app in place: saves will
-- fail safely. Do NOT restore the old non-atomic RuleForm while the RPC is disabled.
BEGIN;
REVOKE ALL ON FUNCTION public.save_admin_rule(integer,timestamptz,jsonb,jsonb,jsonb) FROM PUBLIC, anon, authenticated, service_role;
DROP FUNCTION public.save_admin_rule(integer,timestamptz,jsonb,jsonb,jsonb);
COMMIT;
-- To recover: reapply ONLY the reviewed migration for save_admin_rule, verify its
-- grants/admin checks, then verify the protected app. No existing table SQL.
