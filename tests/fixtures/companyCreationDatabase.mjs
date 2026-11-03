import{readFileSync}from'node:fs';
export const migration=readFileSync(new URL('../../supabase/migrations/20261103040320_create_workspace_company_atomic.sql',import.meta.url),'utf8');
const old=readFileSync(new URL('../../supabase/migration_workspace_access_control.sql',import.meta.url),'utf8');
const helper=name=>old.match(new RegExp('CREATE OR REPLACE FUNCTION '+name+'[\\s\\S]+?\\$\\$;'))[0];
export const claims={sub:'00000000-0000-0000-0000-000000000001',email:'owner@example.invalid',is_anonymous:false};
export const request='11111111-1111-4111-8111-111111111111';
export const values={name:'synthetic trial',prefecture_code:'13',municipality_code:'131130',corporate_type:'kabushiki',fiscal_month:3};
export const setup=`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT (auth.jwt()->>'sub')::uuid$$;
CREATE FUNCTION auth.email() RETURNS text LANGUAGE sql AS $$SELECT auth.jwt()->>'email'$$;
CREATE TABLE public.admin_users(email text primary key);INSERT INTO public.admin_users VALUES('owner@example.invalid'),('other@example.invalid'),('viewer@example.invalid');
CREATE TABLE public.prefectures(id integer primary key,code text unique);INSERT INTO public.prefectures VALUES(13,'13'),(40,'40');
CREATE TABLE public.municipalities(id integer primary key,code text unique,prefecture_id integer references prefectures);INSERT INTO public.municipalities VALUES(1,'131130',13),(2,'401315',40);
CREATE TABLE public.workspace_companies(id serial primary key,name text,prefecture_code text,municipality_code text,corporate_type text,fiscal_month int);
CREATE TABLE public.workspace_members(company_id integer references workspace_companies on delete cascade,email text,role text,unique(company_id,email));
INSERT INTO public.workspace_companies VALUES(1,'existing own','13','131130','kabushiki',3),(2,'existing other','40','401315','godo',3),(3,'old orphan','13','131130','godo',3);SELECT setval('workspace_companies_id_seq',3);
INSERT INTO public.workspace_members VALUES(1,'owner@example.invalid','owner'),(1,'viewer@example.invalid','viewer'),(2,'other@example.invalid','owner');
${helper('is_workspace_member')}${helper('workspace_has_any_member')}
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated;
GRANT SELECT ON public.admin_users,public.prefectures,public.municipalities TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.workspace_companies,public.workspace_members TO authenticated;GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
ALTER TABLE public.workspace_companies ENABLE ROW LEVEL SECURITY;ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_insert ON public.workspace_companies FOR INSERT WITH CHECK(auth.email() IN(SELECT email FROM admin_users));
CREATE POLICY member_select ON public.workspace_companies FOR SELECT USING(auth.email() IN(SELECT email FROM admin_users) AND (is_workspace_member(id) OR NOT workspace_has_any_member(id)));
CREATE POLICY member_delete ON public.workspace_companies FOR DELETE USING(auth.email() IN(SELECT email FROM admin_users) AND (is_workspace_member(id,ARRAY['owner']) OR NOT workspace_has_any_member(id)));
CREATE POLICY member_update ON public.workspace_companies FOR UPDATE USING(auth.email() IN(SELECT email FROM admin_users) AND is_workspace_member(id,ARRAY['owner','member'])) WITH CHECK(auth.email() IN(SELECT email FROM admin_users) AND is_workspace_member(id,ARRAY['owner','member']));
CREATE POLICY member_select ON public.workspace_members FOR SELECT USING(auth.email() IN(SELECT email FROM admin_users) AND is_workspace_member(company_id));CREATE POLICY self_read ON public.workspace_members FOR SELECT USING(email=auth.email());
CREATE POLICY member_insert ON public.workspace_members FOR INSERT WITH CHECK(auth.email() IN(SELECT email FROM admin_users) AND (NOT workspace_has_any_member(company_id) OR is_workspace_member(company_id,ARRAY['owner'])));
CREATE POLICY member_update ON public.workspace_members FOR UPDATE USING(auth.email() IN(SELECT email FROM admin_users) AND is_workspace_member(company_id,ARRAY['owner'])) WITH CHECK(auth.email() IN(SELECT email FROM admin_users) AND is_workspace_member(company_id,ARRAY['owner']));
CREATE POLICY member_delete ON public.workspace_members FOR DELETE USING(auth.email() IN(SELECT email FROM admin_users) AND is_workspace_member(company_id,ARRAY['owner']));
${migration}
CREATE FUNCTION synthetic_create_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF current_setting('trial.fail',true)=TG_TABLE_NAME||'.'||TG_OP THEN RAISE EXCEPTION 'synthetic stage failure';END IF;RETURN NEW;END$$;
${['workspace_companies','workspace_members','workspace_company_creation_requests'].map(t=>`CREATE TRIGGER synthetic_failure AFTER INSERT OR UPDATE ON public.${t} FOR EACH ROW EXECUTE FUNCTION synthetic_create_failure();`).join('\n')}
`;
export async function identity(db,jwt=claims,role='authenticated'){await db.exec('RESET ROLE;SET ROLE '+role);await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(jwt)]);}
export const callSQL='select * from public.create_workspace_company($1,$2,$3)';
export const params=(id=request,v=values,mode='create')=>[id,JSON.stringify(v),mode];
export const snapshotSQL="select jsonb_build_object('companies',(select jsonb_agg(to_jsonb(t) order by id) from workspace_companies t),'members',(select jsonb_agg(to_jsonb(t) order by company_id,email) from workspace_members t),'requests',(select jsonb_agg(to_jsonb(t) order by request_id) from workspace_company_creation_requests t)) as data";
