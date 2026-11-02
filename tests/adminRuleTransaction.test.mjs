import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration=readFileSync(new URL('../supabase/migrations/20261102061708_save_admin_rule_atomic.sql',import.meta.url),'utf8');
const legacy=readFileSync(new URL('../supabase/migration_rule_engine.sql',import.meta.url),'utf8');
const tables=legacy.slice(legacy.indexOf('CREATE TABLE IF NOT EXISTS rules'),legacy.indexOf('-- payload の形'));
const admin={sub:'00000000-0000-0000-0000-000000000001',email:'admin@example.invalid',is_anonymous:false};
const payload={name:'synthetic changed',description:'changed',priority:2,is_active:false};
const conditions=[{field:'event_type_code',operator:'eq',value:'new'}];
const actions=[{action_type:'show_warning',procedure_id:null,payload:{message:'new'}}];

test('PostgreSQL: save_admin_ruleの認可・正常系・全段階のロールバック',async t=>{
 const db=new PGlite();
 try{
  await db.exec(`
   CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
   CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT (auth.jwt()->>'sub')::uuid$$;
   CREATE FUNCTION auth.email() RETURNS text LANGUAGE sql AS $$SELECT auth.jwt()->>'email'$$;
   GRANT USAGE ON SCHEMA auth, public TO anon, authenticated;
   CREATE TABLE public.admin_users(email text PRIMARY KEY); INSERT INTO public.admin_users VALUES ('admin@example.invalid');
   ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
   GRANT SELECT ON public.admin_users TO authenticated;
   CREATE POLICY self_read ON public.admin_users FOR SELECT USING(email=auth.email());
   CREATE TABLE public.procedures(id integer PRIMARY KEY); INSERT INTO public.procedures VALUES (1);
   ${tables}
   GRANT SELECT ON public.procedures TO authenticated;
   GRANT SELECT,INSERT,UPDATE,DELETE ON public.rules,public.rule_conditions,public.rule_actions TO authenticated;
   GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
   CREATE FUNCTION public.update_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.updated_at=now(); RETURN NEW; END$$;
   CREATE TRIGGER trg_rules_updated_at BEFORE UPDATE ON public.rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
   ${['rules','rule_conditions','rule_actions'].map(table=>`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY; CREATE POLICY public_read ON public.${table} FOR SELECT USING(true); CREATE POLICY admin_write ON public.${table} FOR ALL USING(auth.email() IN (SELECT email FROM public.admin_users)) WITH CHECK(auth.email() IN (SELECT email FROM public.admin_users));`).join('\n')}
   CREATE FUNCTION public.synthetic_fail() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF current_setting('test.fail',true)=TG_TABLE_NAME||'.'||TG_OP THEN RAISE EXCEPTION 'synthetic stage failure'; END IF; RETURN NULL; END$$;
   ${['rules','rule_conditions','rule_actions'].map(table=>`CREATE TRIGGER synthetic_fail AFTER INSERT OR UPDATE OR DELETE ON public.${table} FOR EACH STATEMENT EXECUTE FUNCTION public.synthetic_fail();`).join('\n')}
  `);
  await db.exec(migration);
  async function identity(role='authenticated',claims=admin){await db.exec(`RESET ROLE; SET ROLE ${role};`);await db.query("SELECT set_config('request.jwt.claims',$1,false)",[JSON.stringify(claims)]);}
  async function reset(){
   await db.exec("RESET ROLE; SELECT set_config('test.fail','',false); TRUNCATE public.rules RESTART IDENTITY CASCADE;");
   await db.exec("INSERT INTO public.rules(id,name,description,priority,is_active,updated_at) VALUES(1,'synthetic original',null,1,false,'2026-01-01Z'); INSERT INTO public.rule_conditions(rule_id,field,operator,value) VALUES(1,'event_type_code','eq','\"old\"'); INSERT INTO public.rule_actions(rule_id,action_type,payload) VALUES(1,'show_warning','{\"message\":\"old\"}'); SELECT setval('public.rules_id_seq',1);");
   await identity();
  }
  async function snapshot(){await db.exec('RESET ROLE');const r=await db.query("SELECT jsonb_build_object('rules',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.rules r),'conditions',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM public.rule_conditions c),'actions',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM public.rule_actions a)) AS data");await identity();return r.rows[0].data;}
  async function call(id=1,version='2026-01-01Z',rule=payload,cond=conditions,acts=actions){return (await db.query('SELECT public.save_admin_rule($1,$2,$3,$4,$5) AS result',[id,version,JSON.stringify(rule),JSON.stringify(cond),JSON.stringify(acts)])).rows[0].result;}
  for(const stage of ['rules.UPDATE','rule_conditions.DELETE','rule_actions.DELETE','rule_conditions.INSERT','rule_actions.INSERT'])await t.test(`${stage}後に失敗しても3テーブルの全行を復元`,async()=>{
   await reset();const before=await snapshot();await db.query("SELECT set_config('test.fail',$1,false)",[stage]);await assert.rejects(call(),/synthetic stage failure/);assert.deepEqual(await snapshot(),before);
  });
  for(const stage of ['rules.INSERT','rule_conditions.DELETE','rule_actions.DELETE','rule_conditions.INSERT','rule_actions.INSERT'])await t.test(`新規作成: ${stage}失敗で不完全な親/子を残さない`,async()=>{
   await reset();const before=await snapshot();await db.query("SELECT set_config('test.fail',$1,false)",[stage]);await assert.rejects(call(null,null),/synthetic stage failure/);assert.deepEqual(await snapshot(),before);
  });
  await t.test('管理者の正常保存、空の条件、複数の実行内容を一括保存',async()=>{
   await reset();const result=await call(1,'2026-01-01Z',payload,[],[...actions,{action_type:'add_procedure',procedure_id:1,payload:null}]);assert.equal(result.id,1);assert.ok(result.updated_at);const s=await snapshot();assert.equal(s.rules[0].name,payload.name);assert.equal(s.conditions,null);assert.equal(s.actions.length,2);
  });
  await t.test('正常な新規保存と名称一意制約で重複作成を拒否',async()=>{
   await reset();const result=await call(null,null);assert.equal(result.id,2);const before=await snapshot();await assert.rejects(call(null,null),e=>e.code==='23505');assert.deepEqual(await snapshot(),before);
  });
  await t.test('古い更新時刻での再送を拒否し、直前の正常保存を維持',async()=>{
   await reset();await call();const before=await snapshot();await assert.rejects(call(),e=>e.code==='40001');assert.deepEqual(await snapshot(),before);
  });
  await t.test('実行内容の不正なFKで失敗しても削除前に戻る',async()=>{
   await reset();const before=await snapshot();await assert.rejects(call(1,'2026-01-01Z',payload,conditions,[{action_type:'add_procedure',procedure_id:999999,payload:null}]),e=>e.code==='23503');assert.deepEqual(await snapshot(),before);
  });
  for(const [label,role,claims]of[['匿名','anon',{}],['一般ユーザー','authenticated',{...admin,email:'other@example.invalid'}],['UIDなし','authenticated',{email:admin.email}],['匿名サインイン','authenticated',{...admin,is_anonymous:true}]])await t.test(`${label}を拒否し全データを維持`,async()=>{
   await reset();const before=await snapshot();await identity(role,claims);await assert.rejects(call(),e=>e.code==='42501');assert.deepEqual(await snapshot(),before);
  });
  await t.test('不正入力と更新時刻なしでは削除を始めない',async()=>{
   await reset();const before=await snapshot();
   for(const args of [[1,null,payload,conditions,actions],[1,'2026-01-01Z',payload,null,actions],[1,'2026-01-01Z',payload,conditions,[]],[1,'2026-01-01Z',{...payload,is_active:'true'},conditions,actions]])await assert.rejects(call(...args));
   assert.deepEqual(await snapshot(),before);
  });
  await t.test('RLSでDELETEが0件になっても混在保存を成功扱いにしない',async()=>{
   await reset();await db.exec('RESET ROLE; DROP POLICY admin_write ON public.rule_conditions; CREATE POLICY admin_insert ON public.rule_conditions FOR INSERT WITH CHECK(true); CREATE POLICY admin_update ON public.rule_conditions FOR UPDATE USING(true);');await identity();const before=await snapshot();await assert.rejects(call(),e=>e.code==='42501');assert.deepEqual(await snapshot(),before);
  });
  await t.test('安全な権限とsearch_path、単独の復旧SQLで関数だけ削除',async()=>{
   await db.exec('RESET ROLE');const r=await db.query("SELECT prosecdef,proconfig,has_function_privilege('anon',oid,'EXECUTE') AS anon,has_function_privilege('authenticated',oid,'EXECUTE') AS member,has_function_privilege('service_role',oid,'EXECUTE') AS service FROM pg_proc WHERE proname='save_admin_rule'");assert.equal(r.rows[0].prosecdef,false);assert.equal(r.rows[0].anon,false);assert.equal(r.rows[0].member,true);assert.equal(r.rows[0].service,false);assert.ok(r.rows[0].proconfig.includes('search_path=\"\"'));
   const before=await snapshot();await db.exec('RESET ROLE');await db.exec(readFileSync(new URL('../supabase/rollback/save_admin_rule_atomic.sql',import.meta.url),'utf8'));assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_proc WHERE proname='save_admin_rule'")).rows[0].n,0);assert.deepEqual(await snapshot(),before);
  });
 }finally{await db.close();}
});
