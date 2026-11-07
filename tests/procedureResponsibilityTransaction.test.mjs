import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { setup, identity, claims, readShared } from './fixtures/initialTrialDatabase.mjs';
const migration=readFileSync(new URL('../supabase/migrations/20261107120608_add_procedure_responsible_role.sql',import.meta.url),'utf8');
test('approved role column preserves status, enforces RLS/CHECK, CAS and existing shared projection',async()=>{
 const db=new PGlite();try{
  await db.exec(setup+`ALTER TABLE workspace_procedure_statuses ALTER COLUMN status SET DEFAULT 'not_started';
   ALTER TABLE workspace_procedure_statuses ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
   CREATE FUNCTION test_stamp() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.updated_at=clock_timestamp();RETURN NEW;END;$$;
   CREATE TRIGGER test_stamp BEFORE UPDATE ON workspace_procedure_statuses FOR EACH ROW EXECUTE FUNCTION test_stamp();`);
  const policyBefore=(await db.query("select policyname,qual,with_check from pg_policies where tablename='workspace_procedure_statuses' order by policyname")).rows;
  await db.exec(migration);assert.deepEqual((await db.query("select policyname,qual,with_check from pg_policies where tablename='workspace_procedure_statuses' order by policyname")).rows,policyBefore);
  await identity(db);
  const inserted=(await db.query("insert into workspace_procedure_statuses(company_id,procedure_id,occurrence_key,responsible_role) values(1,61,'2027-05-31','tax_accountant') returning *,updated_at::text as stamp")).rows[0];
  assert.equal(inserted.status,'not_started');
  // Same columns as the existing PostgREST status-upsert payload; omitted role is not part of DO UPDATE.
  await db.query("insert into workspace_procedure_statuses(company_id,procedure_id,occurrence_key,status) values(1,61,'2027-05-31','done') on conflict(company_id,procedure_id,occurrence_key) do update set company_id=excluded.company_id,procedure_id=excluded.procedure_id,occurrence_key=excluded.occurrence_key,status=excluded.status");
  let current=(await db.query("select *,updated_at::text as stamp from workspace_procedure_statuses where company_id=1")).rows[0];
  assert.equal(current.responsible_role,'tax_accountant');assert.equal(current.status,'done');
  assert.equal((await db.query("update workspace_procedure_statuses set responsible_role='in_house_admin' where company_id=1 and procedure_id=61 and occurrence_key='2027-05-31' and updated_at=$1 returning status",[inserted.stamp])).rows.length,0);
  assert.equal((await db.query("update workspace_procedure_statuses set responsible_role='outsourced_provider' where company_id=1 and procedure_id=61 and occurrence_key='2027-05-31' and updated_at=$1 returning status",[current.stamp])).rows[0].status,'done');
  assert.equal((await db.query("update workspace_procedure_statuses set responsible_role='other' where company_id=1 and procedure_id=61 and occurrence_key='2027-05-31' and updated_at=$1 returning status",[current.stamp])).rows.length,0);
  await assert.rejects(db.query("insert into workspace_procedure_statuses(company_id,procedure_id,occurrence_key,responsible_role) values(1,61,'2027-05-31','other')"),/duplicate key/);
  await assert.rejects(db.query("update workspace_procedure_statuses set responsible_role='admin' where company_id=1"),/check constraint/);
  assert.equal((await db.query("select responsible_role from workspace_procedure_statuses where company_id=1")).rows[0].responsible_role,'outsourced_provider');
  const token='r'.repeat(64);await db.query("insert into workspace_share_links(company_id,token,shared_sections,created_by) values(1,$1,'[\"company\",\"roadmap\"]',$2)",[token,claims.email]);
  const shared=await readShared(db,token);assert.deepEqual(shared.statuses,[{procedure_id:61,occurrence_key:'2027-05-31',status:'done'}]);assert.equal(JSON.stringify(shared).includes('responsible_role'),false);
  await identity(db,{...claims,email:'other@example.invalid'});assert.equal((await db.query('select * from workspace_procedure_statuses where company_id=1')).rows.length,0);
  assert.equal((await db.query("update workspace_procedure_statuses set responsible_role='other' where company_id=1 returning company_id")).rows.length,0);
  await assert.rejects(db.query("insert into workspace_procedure_statuses(company_id,procedure_id,occurrence_key,responsible_role) values(1,62,'2027-05-31','other')"));
  await identity(db,{...claims,email:'viewer@example.invalid'});assert.equal((await db.query("update workspace_procedure_statuses set responsible_role='other' where company_id=1 returning company_id")).rows.length,0);
  await db.exec("reset role;insert into workspace_members(company_id,email,role) values(1,'notadmin@example.invalid','member')");
  await identity(db,{...claims,email:'notadmin@example.invalid'});assert.equal((await db.query('select * from workspace_procedure_statuses where company_id=1')).rows.length,0);
  await db.exec('reset role;set role anon');await assert.rejects(db.query('select responsible_role from workspace_procedure_statuses'));
  await db.exec('reset role');await identity(db);assert.equal((await db.query("select status from workspace_procedure_statuses where company_id=1")).rows[0].status,'done');
 }finally{await db.close()}
});

test('nullable addition preserves existing rows and a failed statement rolls back the whole transaction',async()=>{
 const db=new PGlite();try{
  await db.exec("create table workspace_procedure_statuses(company_id int,procedure_id int,occurrence_key text,status text default 'not_started',updated_at timestamptz default now(),primary key(company_id,procedure_id,occurrence_key));insert into workspace_procedure_statuses(company_id,procedure_id,occurrence_key,status) values(1,61,'2027-05-31','done')");
  const before=(await db.query('select * from workspace_procedure_statuses')).rows[0];await db.exec(migration);
  const after=(await db.query('select * from workspace_procedure_statuses')).rows[0];assert.equal(after.responsible_role,null);delete after.responsible_role;assert.deepEqual(after,before);
  await db.exec('begin');await db.query("update workspace_procedure_statuses set responsible_role='tax_accountant'");
  await assert.rejects(db.query("update workspace_procedure_statuses set responsible_role='unknown'"),/check constraint/);await db.exec('rollback');
  const final=(await db.query('select * from workspace_procedure_statuses')).rows[0];assert.equal(final.responsible_role,null);assert.equal(final.status,'done');
 }finally{await db.close()}
});
