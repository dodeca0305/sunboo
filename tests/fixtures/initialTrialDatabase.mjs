// Local-only reproduction of existing tables/RLS/shared RPC plus the two approved migrations.
import{readFileSync}from'node:fs';import{setup as profileSetup}from'./companyProfileDatabase.mjs';
export{identity,claims}from'./companyProfileDatabase.mjs';
const read=n=>readFileSync(new URL('../../supabase/'+n,import.meta.url),'utf8');
const shareTable=read('migration_workspace_mvp.sql').match(/CREATE TABLE IF NOT EXISTS workspace_share_links[\s\S]+?\n\);/)[0].replace(" DEFAULT encode(gen_random_bytes(32), 'hex')",'');
const financialTable=read('migration_workspace_tax_returns.sql').match(/CREATE TABLE IF NOT EXISTS workspace_tax_return_profiles[\s\S]+?\n\);/)[0];
export const setup=profileSetup+shareTable+financialTable+`
CREATE TABLE public.workspace_procedure_statuses(company_id int REFERENCES workspace_companies(id),procedure_id int,occurrence_key text,status text CHECK(status IN('not_started','in_progress','done','on_hold')),PRIMARY KEY(company_id,procedure_id,occurrence_key));
`+['workspace_share_links','workspace_tax_return_profiles','workspace_procedure_statuses'].map(table=>`
 ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;
 GRANT SELECT,INSERT,UPDATE,DELETE ON public.${table} TO authenticated;
 CREATE POLICY member_select ON public.${table} FOR SELECT USING(auth.email() IN(SELECT email FROM admin_users) AND public.is_workspace_member(company_id));
 CREATE POLICY member_insert ON public.${table} FOR INSERT WITH CHECK(auth.email() IN(SELECT email FROM admin_users) AND public.is_workspace_member(company_id,ARRAY['owner','member']));
 CREATE POLICY member_update ON public.${table} FOR UPDATE USING(auth.email() IN(SELECT email FROM admin_users) AND public.is_workspace_member(company_id,ARRAY['owner','member'])) WITH CHECK(auth.email() IN(SELECT email FROM admin_users) AND public.is_workspace_member(company_id,ARRAY['owner','member']));
`).join('\n')+`GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;`+read('migration_shared_workspace_view_hardening.sql');
export async function readShared(db,token){await db.exec('reset role;set role anon');try{return(await db.query('select public.get_shared_workspace_view($1) as value',[token])).rows[0].value}finally{await db.exec('reset role');}}
