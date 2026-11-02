import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const schema=readFileSync(new URL('../supabase/migration_workspace_tax_returns.sql',import.meta.url),'utf8');
const table=schema.slice(schema.indexOf('CREATE TABLE IF NOT EXISTS workspace_tax_return_profiles'),schema.indexOf('CREATE INDEX IF NOT EXISTS'));
test('existing tax return constraints and single-row persistence',async t=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE TABLE workspace_companies(id integer primary key);INSERT INTO workspace_companies VALUES(23),(24);${table}
  CREATE FUNCTION update_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.updated_at=clock_timestamp();RETURN NEW;END$$;
  CREATE TRIGGER updated BEFORE UPDATE ON workspace_tax_return_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();`);
  async function insert(company=23){return (await db.query(`INSERT INTO workspace_tax_return_profiles(company_id,fiscal_year,fiscal_year_end_date,consumption_tax_status,invoice_registration_status,corporate_tax_interim_filing_actual,consumption_tax_interim_frequency_actual,corporate_tax_amount) VALUES($1,'synthetic','2025-03-31','exempt','not_registered','none','none','{"precision":"exact","exactValue":0,"rangeBucketId":null}') RETURNING *`,[company])).rows[0];}
  const row=await insert();
  await t.test('duplicate company/end-date refused; original amounts preserved',async()=>{await assert.rejects(insert(),e=>e.code==='23505');const r=(await db.query('SELECT * FROM workspace_tax_return_profiles WHERE company_id=23')).rows;assert.equal(r.length,1);assert.equal(r[0].corporate_tax_amount.exactValue,0);assert.equal(r[0].consumption_tax_amount,null);});
  await t.test('same fiscal end in another company does not overwrite',async()=>{const other=await insert(24);assert.notEqual(other.id,row.id);});
  await t.test('company predicate prevents changing another company row',async()=>{const r=await db.query("UPDATE workspace_tax_return_profiles SET fiscal_year='wrong' WHERE id=$1 AND company_id=24 RETURNING id",[row.id]);assert.equal(r.rows.length,0);});
  await t.test('stale timestamp cannot overwrite or delete confirmed save',async()=>{const r=await db.query("UPDATE workspace_tax_return_profiles SET fiscal_year='new' WHERE id=$1 AND company_id=23 AND updated_at=$2 RETURNING updated_at",[row.id,row.updated_at]);assert.equal(r.rows.length,1);assert.equal((await db.query("UPDATE workspace_tax_return_profiles SET fiscal_year='stale' WHERE id=$1 AND company_id=23 AND updated_at=$2 RETURNING id",[row.id,row.updated_at])).rows.length,0);assert.equal((await db.query("DELETE FROM workspace_tax_return_profiles WHERE id=$1 AND company_id=23 AND updated_at=$2 RETURNING id",[row.id,row.updated_at])).rows.length,0);});
  await t.test('failed single-row save retains entire original row',async()=>{const before=(await db.query('SELECT * FROM workspace_tax_return_profiles WHERE id=$1',[row.id])).rows;await assert.rejects(db.query("UPDATE workspace_tax_return_profiles SET fiscal_year='partial',consumption_tax_status='invalid' WHERE id=$1",[row.id]),e=>e.code==='23514');assert.deepEqual((await db.query('SELECT * FROM workspace_tax_return_profiles WHERE id=$1',[row.id])).rows,before);});
 }finally{await db.close();}
});
