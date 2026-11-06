import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { setup as companySetup, identity, claims } from './fixtures/companyCreationDatabase.mjs';
const old = readFileSync(new URL('../supabase/migration_workspace_documents.sql',import.meta.url),'utf8');
const tableSQL = old.match(/CREATE TABLE IF NOT EXISTS workspace_documents[\s\S]+?\n\);/)[0];
const migration = readFileSync(new URL('../supabase/migrations/20261106021938_add_workspace_document_timing.sql',import.meta.url),'utf8');
const setup = companySetup + tableSQL + `
CREATE FUNCTION update_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.updated_at=NOW();RETURN NEW;END$$;
CREATE TRIGGER trg_workspace_documents_updated_at BEFORE UPDATE ON workspace_documents FOR EACH ROW EXECUTE FUNCTION update_updated_at();
ALTER TABLE workspace_documents ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON workspace_documents TO authenticated;
CREATE POLICY member_select ON workspace_documents FOR SELECT USING(auth.email() IN(SELECT email FROM admin_users) AND is_workspace_member(company_id));
CREATE POLICY member_insert ON workspace_documents FOR INSERT WITH CHECK(auth.email() IN(SELECT email FROM admin_users) AND is_workspace_member(company_id,ARRAY['owner','member']));
CREATE POLICY member_update ON workspace_documents FOR UPDATE USING(auth.email() IN(SELECT email FROM admin_users) AND is_workspace_member(company_id,ARRAY['owner','member'])) WITH CHECK(auth.email() IN(SELECT email FROM admin_users) AND is_workspace_member(company_id,ARRAY['owner','member']));
INSERT INTO workspace_documents(company_id,document_type,status) VALUES(1,'corporate_tax_return','registered'),(2,'corporate_tax_return','registered');
`;
const snapshot = async db => (await db.query('select *,updated_at::text as exact_version from workspace_documents order by company_id,document_type')).rows;
test('document timing migration, atomic row saves, version conflicts and existing access controls',async t=>{
 const db=new PGlite();
 try {
  await db.exec(setup);const before=await snapshot(db);await db.exec(migration);
  await t.test('migration preserves existing status and original timestamps with null metadata',async()=>{const after=await snapshot(db);assert.deepEqual(after.map(row=>Object.fromEntries(Object.entries(row).filter(([key])=>!['period_start','period_end','document_date'].includes(key)))),before);assert.ok(after.every(r=>r.period_start===null&&r.period_end===null&&r.document_date===null));});
  await identity(db);const version=(await snapshot(db))[0].exact_version;
  const update=(v=version,start='2025-04-01',end='2026-03-31',company=1,expectedStart=null,expectedEnd=null,expectedStatus='registered')=>db.query("update workspace_documents set status='needs_update',period_start=$1,period_end=$2 where company_id=$3 and document_type='corporate_tax_return' and updated_at=$4::timestamptz and period_start is not distinct from $5::date and period_end is not distinct from $6::date and status=$7 returning *, updated_at::text as exact_version",[start,end,company,v,expectedStart,expectedEnd,expectedStatus]);
  for(const [a,b] of [['2026-01-01',null],[null,'2026-12-31'],['2026-12-31','2026-01-01'],['2026-02-30','2026-03-01']])await t.test('invalid period rolls back entire status/date save '+a+'/'+b,async()=>{const s=await snapshot(db);await assert.rejects(update(version,a,b));assert.deepEqual(await snapshot(db),s)});
  await t.test('normal save changes status and both endpoints together',async()=>{const r=await update();assert.equal(r.rows.length,1);assert.equal(r.rows[0].status,'needs_update');assert.notEqual(r.rows[0].exact_version,version)});
  await t.test('simultaneous stale submissions have one winner and no overwrite',async()=>{const v=(await snapshot(db))[0].exact_version;const r=await Promise.all([update(v,'2024-04-01','2025-03-31',1,'2025-04-01','2026-03-31','needs_update'),update(v,'2023-04-01','2024-03-31',1,'2025-04-01','2026-03-31','needs_update')]);assert.deepEqual(r.map(x=>x.rows.length).sort(),[0,1]);});
  await t.test('late resend after response loss cannot change version or duplicate row',async()=>{const s=await snapshot(db);assert.equal((await update(version)).rows.length,0);assert.deepEqual(await snapshot(db),s)});
  await t.test('concurrent insertion never overwrites an existing row',async()=>{const insert=()=>db.query("insert into workspace_documents(company_id,document_type,status,document_date) values(1,'certificate_of_registered_matters','registered','2026-10-20') returning *");const r=await Promise.allSettled([insert(),insert()]);assert.equal(r.filter(r=>r.status==='fulfilled').length,1);assert.equal(r.find(r=>r.status==='rejected').reason.code,'23505')});
  await t.test('status-only edit keeps all recorded dates',async()=>{await db.query("update workspace_documents set status='not_registered' where company_id=1 and document_type='certificate_of_registered_matters'");assert.equal((await db.query("select document_date::text as d from workspace_documents where document_type='certificate_of_registered_matters'")).rows[0].d,'2026-10-20')});
  await t.test('database failure rolls back status and dates as one row',async()=>{await db.exec("reset role;create trigger synthetic_document_failure after update on workspace_documents for each row execute function synthetic_create_failure();");await identity(db);const s=await snapshot(db);await db.query("select set_config('trial.fail','workspace_documents.UPDATE',false)");const row=s.find(r=>r.document_type==='corporate_tax_return');await assert.rejects(update(row.exact_version,'2022-04-01','2023-03-31',1,'2024-04-01','2025-03-31','needs_update'));await db.query("select set_config('trial.fail','',false)");assert.deepEqual(await snapshot(db),s)});
  await db.exec('reset role');const all=await snapshot(db);
  for(const [label,jwt,role] of [['anon',{},'anon'],['nonadmin',{...claims,email:'nobody@example.invalid'},'authenticated'],['nonmember',{...claims,email:'other@example.invalid'},'authenticated'],['viewer',{...claims,email:'viewer@example.invalid'},'authenticated']])await t.test('existing RLS refuses writes: '+label,async()=>{
   await identity(db,jwt,role);
   await assert.rejects(db.query("insert into workspace_documents(company_id,document_type,status) values(1,'articles_of_incorporation','registered')"));
   try {assert.equal((await db.query("update workspace_documents set document_date='2026-01-01' where company_id=1 returning *")).rows.length,0)} catch(e){assert.equal(e.code,'42501')}
   await db.exec('reset role');assert.deepEqual(await snapshot(db),all);
  });
  await identity(db);assert.equal((await db.query('select * from workspace_documents where company_id=2')).rows.length,0);await db.exec('reset role');assert.deepEqual(await snapshot(db),all);
 } finally {await db.close()}
});
