BEGIN;
REVOKE ALL ON FUNCTION public.save_admin_office(integer,jsonb,jsonb,integer[]) FROM PUBLIC, anon, authenticated, service_role;
DROP FUNCTION public.save_admin_office(integer,jsonb,jsonb,integer[]);
COMMIT;
