import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// 合成フィクスチャだけに「新しいmigration1本」を適用する。既存SQL・本番・.envには触れない。
const MIGRATION = readFileSync(new URL('../../supabase/migrations/20261117235441_add_workspace_financial_forecasts.sql', import.meta.url), 'utf8');
const FIXTURE = `
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(auth.jwt()->>'sub','')::uuid $$;
CREATE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $$ SELECT auth.jwt()->>'email' $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE TABLE public.admin_users (email text PRIMARY KEY);
CREATE TABLE public.workspace_companies (id integer PRIMARY KEY, name text NOT NULL);
CREATE TABLE public.workspace_members (company_id integer NOT NULL REFERENCES public.workspace_companies(id) ON DELETE CASCADE, email text NOT NULL, role text NOT NULL, PRIMARY KEY (company_id, email));
CREATE TABLE public.workspace_tax_returns (id serial PRIMARY KEY, company_id integer NOT NULL, fiscal_year text NOT NULL);
CREATE TABLE public.workspace_monthly_sales (company_id integer NOT NULL, month text NOT NULL, target_revenue bigint NOT NULL);
GRANT SELECT ON public.admin_users TO authenticated;
GRANT SELECT ON public.workspace_companies, public.workspace_members TO authenticated;
CREATE FUNCTION public.is_workspace_member(p_company_id integer, p_roles text[] DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM workspace_members m WHERE m.company_id = p_company_id AND m.email = auth.email() AND (p_roles IS NULL OR m.role = ANY(p_roles))) $$;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(integer, text[]) TO authenticated;
INSERT INTO public.admin_users VALUES ('owner@example.test'),('member@example.test'),('viewer@example.test'),('other@example.test');
INSERT INTO public.workspace_companies VALUES (23,'合成会社A'),(24,'合成会社B');
INSERT INTO public.workspace_members VALUES (23,'owner@example.test','owner'),(23,'member@example.test','member'),(23,'viewer@example.test','viewer'),(24,'other@example.test','owner'),(23,'nonadmin@example.test','owner');
INSERT INTO public.workspace_tax_returns(company_id,fiscal_year) VALUES (23,'FY2026/03');
INSERT INTO public.workspace_monthly_sales VALUES (23,'2026-11',1000000);
`;
const U = { owner: '00000000-0000-4000-8000-000000000001', member: '00000000-0000-4000-8000-000000000002', viewer: '00000000-0000-4000-8000-000000000003', other: '00000000-0000-4000-8000-000000000004', nonadmin: '00000000-0000-4000-8000-000000000005' };
type Who = 'owner' | 'member' | 'viewer' | 'other' | 'nonadmin' | 'anon' | 'anonjwt' | 'none';
const ZERO = { sales: 0 };
const SAMPLE = { is_fictional: true, sales: 12000000, cogs: 4800000, opex: 6000000, other_income: 0, other_expense: 0, special_gain: 0, special_loss: 0, tax_expense: 360000,
  opening_cash: 3000000, opening_retained_earnings: 0, capital: 3000000, borrowing: 500000, collections: 10160000, cogs_paid: 4800000, opex_paid: 5300000, tax_paid: 360000, equipment: 200000 };
const BLANK = Object.fromEntries(Object.keys(SAMPLE).filter(k => k !== 'is_fictional').map(k => [k, null]));
const P = { s: '2026-04-01', e: '2027-03-31', n: '標準' };

const db = new PGlite();
await db.exec(FIXTURE);
await db.exec(MIGRATION);
after(async () => { await db.close(); });

async function as<T>(who: Who, fn: () => Promise<T>): Promise<T> {
  const claims = who === 'none' || who === 'anon' ? {} : { sub: U[who as keyof typeof U] ?? U.owner, email: who === 'anonjwt' ? 'owner@example.test' : `${who}@example.test`, ...(who === 'anonjwt' ? { is_anonymous: true, sub: U.owner } : {}) };
  await db.exec(`SELECT set_config('request.jwt.claims', '${JSON.stringify(claims)}', false); SET ROLE ${who === 'anon' || who === 'none' ? 'anon' : 'authenticated'}`);
  try { return await fn(); } finally { await db.exec('RESET ROLE'); }
}
async function save(who: Who, company: number, expected: unknown, values: unknown, p = P) {
  return as(who, async () => (await db.query('SELECT public.save_workspace_financial_forecast($1,$2,$3,$4,$5::jsonb,$6::jsonb) AS r', [company, p.s, p.e, p.n, JSON.stringify(expected), JSON.stringify(values)])).rows[0] as { r: { result_status: string; snapshot: Record<string, unknown> } });
}
async function code(promise: Promise<unknown>) { try { await promise; return 'ok'; } catch (e) { return (e as { code?: string }).code ?? String(e); } }
const rows = async (sql = 'SELECT * FROM public.workspace_financial_forecasts ORDER BY company_id, scenario_name') => (await db.query(sql)).rows as Record<string, unknown>[];
const flat = (r: Record<string, unknown>) => { const { company_id, fiscal_start, fiscal_end, scenario_name, version, created_at, updated_at, ...rest } = r; void company_id; void fiscal_start; void fiscal_end; void scenario_name; void version; void created_at; void updated_at; return rest; };
const legacy = async () => JSON.stringify([await rows('SELECT * FROM public.workspace_tax_returns'), await rows('SELECT * FROM public.workspace_monthly_sales')]);
const legacyBefore = await legacy();

test('owner creates the exact sample; blank and zero are stored separately and read back', async () => {
  const r = await save('owner', 23, null, SAMPLE);
  assert.equal(r.r.result_status, 'saved');
  assert.equal(r.r.snapshot.version, 1);
  assert.equal(r.r.snapshot.sales, 12000000);
  const [row] = await rows();
  assert.equal(Number(row.version), 1);
  assert.deepEqual(flat(row), SAMPLE as unknown as Record<string, unknown>);
  assert.equal(await legacy(), legacyBefore);
  const blank = await save('member', 23, null, { is_fictional: false, ...BLANK }, { ...P, n: '空欄' });
  assert.equal(blank.r.snapshot.sales, null);
  const zero = await save('member', 23, null, { is_fictional: false, ...BLANK, ...ZERO }, { ...P, n: 'ゼロ' });
  assert.equal(zero.r.snapshot.sales, 0);
  const read = await as('owner', async () => (await db.query<{ scenario_name: string; sales: number | null; cogs: number | null }>('SELECT scenario_name, sales, cogs FROM public.workspace_financial_forecasts WHERE company_id=23 ORDER BY scenario_name')).rows);
  assert.equal(read.length, 3);
  assert.deepEqual(read.find(x => x.scenario_name === '空欄'), { scenario_name: '空欄', sales: null, cogs: null });
  assert.deepEqual(read.find(x => x.scenario_name === 'ゼロ'), { scenario_name: 'ゼロ', sales: 0, cogs: null });
});
test('CAS update bumps version; idempotent resend after response loss does not duplicate or bump', async () => {
  const [cur] = await rows("SELECT * FROM public.workspace_financial_forecasts WHERE scenario_name='標準'");
  const next = { ...SAMPLE, sales: 13000000 };
  const ok = await save('owner', 23, { version: 1, values: flat(cur) }, next);
  assert.equal(ok.r.snapshot.version, 2);
  const again = await save('owner', 23, { version: 1, values: flat(cur) }, next);
  assert.equal(again.r.snapshot.version, 2);
  assert.equal(again.r.snapshot.updated_at, ok.r.snapshot.updated_at);
  assert.equal((await rows("SELECT * FROM public.workspace_financial_forecasts WHERE scenario_name='標準'")).length, 1);
  const retry = await save('owner', 23, null, next);
  assert.equal(retry.r.snapshot.version, 2, 'create-resend after committed create is acknowledged, not duplicated');
});
test('stale version, stale values, existing-on-create and vanished-on-update all fail with no mutation', async () => {
  const before = JSON.stringify(await rows());
  const [cur] = await rows("SELECT * FROM public.workspace_financial_forecasts WHERE scenario_name='標準'");
  const other = { ...SAMPLE, sales: 14000000 };
  assert.equal(await code(save('owner', 23, { version: 1, values: flat(cur) }, other)), '40001');
  assert.equal(await code(save('owner', 23, { version: 2, values: { ...flat(cur), cogs: 1 } }, other)), '40001');
  assert.equal(await code(save('owner', 23, null, other)), '40001');
  assert.equal(await code(save('owner', 23, { version: 1, values: flat(cur) }, other, { ...P, n: '存在しない' })), '40001');
  assert.equal(JSON.stringify(await rows()), before);
});
test('permission matrix: unauthenticated, anonymous JWT, non-admin, non-member, viewer and other company are denied', async () => {
  const before = JSON.stringify(await rows());
  for (const who of ['none', 'anon', 'anonjwt', 'nonadmin', 'other', 'viewer'] as Who[]) {
    assert.notEqual(await code(save(who, 23, null, SAMPLE, { ...P, n: 'denied-' + who })), 'ok', who);
  }
  assert.equal(await code(save('owner', 24, null, SAMPLE, { ...P, n: 'cross' })), '42501', 'owner of A cannot write company B');
  assert.equal(await code(save('other', 23, { version: 2, values: SAMPLE }, SAMPLE)), '42501');
  assert.equal(JSON.stringify(await rows()), before);
});
test('direct table access follows RLS: viewer reads but cannot write; others see nothing; no DELETE/TRUNCATE/anon', async () => {
  const count = (who: Who) => as(who, async () => (await db.query('SELECT count(*)::int AS c FROM public.workspace_financial_forecasts')).rows[0] as { c: number });
  assert.equal((await count('owner')).c, 3);
  assert.equal((await count('viewer')).c, 3);
  assert.equal((await count('other')).c, 0);
  assert.equal((await count('nonadmin')).c, 0);
  assert.equal((await count('anonjwt')).c, 0);
  assert.notEqual(await code(count('anon')), 'ok');
  const ins = (who: Who, company: number) => as(who, () => db.query(`INSERT INTO public.workspace_financial_forecasts(company_id,fiscal_start,fiscal_end,scenario_name) VALUES (${company},'2026-04-01','2027-03-31','direct-${who}')`));
  assert.notEqual(await code(ins('viewer', 23)), 'ok');
  assert.notEqual(await code(ins('other', 23)), 'ok');
  assert.notEqual(await code(ins('anon', 23)), 'ok');
  assert.equal(await code(ins('member', 23)), 'ok');
  const upd = (who: Who, company = 23) => as(who, async () => (await db.query(`UPDATE public.workspace_financial_forecasts SET sales=5 WHERE company_id=${company} AND scenario_name='direct-member'`)).affectedRows);
  assert.equal(await upd('viewer'), 0);
  assert.equal(await upd('other'), 0);
  assert.equal(await upd('member'), 1);
  assert.equal(Number((await rows("SELECT version FROM public.workspace_financial_forecasts WHERE scenario_name='direct-member'"))[0].version), 2, 'trigger bumps version');
  for (const sql of ['DELETE FROM public.workspace_financial_forecasts', 'TRUNCATE public.workspace_financial_forecasts']) assert.equal(await code(as('owner', () => db.exec(sql))), '42501');
  assert.equal(await code(as('member', () => db.exec("UPDATE public.workspace_financial_forecasts SET company_id=24 WHERE scenario_name='direct-member'"))), '22023', 'cross-company reassignment');
  assert.equal(await code(as('member', () => db.exec("UPDATE public.workspace_financial_forecasts SET scenario_name='renamed' WHERE scenario_name='direct-member'"))), '22023');
  await db.exec("DELETE FROM public.workspace_financial_forecasts WHERE scenario_name='direct-member'");
  assert.equal(await code(as('anon', () => db.exec('SELECT 1 FROM public.workspace_tax_returns'))), '42501', 'no grants leaked to other tables');
  assert.equal(await code(as('authenticated' as Who, () => db.exec('SELECT 1 FROM public.workspace_monthly_sales'))), '42501');
});
test('ACL: table grants are narrow and the RPC is invoker-only for authenticated', async () => {
  const grants = (await rows("SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_name='workspace_financial_forecasts' AND grantee NOT IN ('postgres') ORDER BY 1,2")).map(r => `${r.grantee}:${r.privilege_type}`);
  assert.deepEqual(grants, ['authenticated:INSERT', 'authenticated:SELECT', 'authenticated:UPDATE']);
  const fn = (await rows("SELECT prosecdef, proacl::text AS acl FROM pg_proc WHERE proname='save_workspace_financial_forecast'"))[0];
  assert.equal(fn.prosecdef, false);
  assert.match(String(fn.acl), /authenticated=X/);
  assert.doesNotMatch(String(fn.acl), /(^|[{,])=X|anon=|service_role=/);
  assert.equal((await rows("SELECT relrowsecurity FROM pg_class WHERE relname='workspace_financial_forecasts'"))[0].relrowsecurity, true);
});
test('malformed dates, scenarios, numbers and JSON are rejected and mutate nothing', async () => {
  const before = JSON.stringify(await rows());
  const bad = (p: Partial<typeof P>, v: unknown, e: unknown = null) => code(save('owner', 23, e, v, { ...P, n: 'bad', ...p }));
  for (const p of [{ s: '2027-02-30' }, { e: '2027-13-01' }, { s: '2027-04-01', e: '2026-04-01' }, { s: '2026-4-1' }, { s: '1999-01-01', e: '1999-12-31' }, { s: '2026-04-01', e: '2029-03-31' }, { n: '' }, { n: ' pad' }, { n: 'x'.repeat(61) }, { n: 'a\nb' }])
    assert.equal(await bad(p, SAMPLE), '22023', JSON.stringify(p));
  for (const v of [{ ...SAMPLE, sales: -1 }, { ...SAMPLE, sales: 1.5 }, { ...SAMPLE, sales: '1' }, { ...SAMPLE, sales: 9007199254740992 }, { ...SAMPLE, opening_retained_earnings: -9007199254740992 },
    { ...SAMPLE, extra: 1 }, { ...SAMPLE, is_fictional: 'true' }, { ...SAMPLE, sales: 1e300 }, [1], 'x', null]) assert.equal(await bad({}, v), '22023', JSON.stringify(v));
  const { sales, ...missing } = SAMPLE; void sales;
  assert.equal(await bad({}, missing), '22023');
  assert.equal(await bad({}, SAMPLE, { version: 0, values: SAMPLE }), '22023');
  assert.equal(await bad({}, SAMPLE, { version: 1 }), '22023');
  assert.equal(await bad({}, SAMPLE, 'x'), '22023');
  assert.equal(await code(as('owner', () => db.exec("INSERT INTO public.workspace_financial_forecasts(company_id,fiscal_start,fiscal_end,scenario_name,sales) VALUES (23,'2026-04-01','2027-03-31','raw',-5)"))), '23514');
  assert.equal(await code(as('owner', () => db.exec("INSERT INTO public.workspace_financial_forecasts(company_id,fiscal_start,fiscal_end,scenario_name) VALUES (23,'2027-02-30','2027-03-31','raw')"))), '22008');
  assert.equal(JSON.stringify(await rows()), before);
  assert.equal(await legacy(), legacyBefore, 'tax-return and monthly rows are unchanged');
});
test('signed opening retained earnings and bounds are accepted', async () => {
  const r = await save('owner', 23, null, { ...SAMPLE, opening_retained_earnings: -9007199254740991, sales: 9007199254740991 }, { ...P, n: '境界' });
  assert.equal(r.r.snapshot.opening_retained_earnings, -9007199254740991);
  assert.equal(r.r.snapshot.sales, 9007199254740991);
});
test('concurrent first creates race safely: one wins, the same payload is acknowledged, a different one conflicts', async () => {
  const p = { ...P, n: '競合' };
  const results = await Promise.allSettled([save('owner', 23, null, SAMPLE, p), save('member', 23, null, SAMPLE, p), save('owner', 23, null, { ...SAMPLE, sales: 1 }, p)]);
  // PGlite is single-connection (serialised); semantics are still verified by sequential outcome.
  const ok = results.filter(r => r.status === 'fulfilled');
  assert.ok(ok.length >= 2);
  assert.equal((await rows("SELECT * FROM public.workspace_financial_forecasts WHERE scenario_name='競合'")).length, 1);
  const rejected = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[];
  assert.ok(rejected.every(r => (r.reason as { code?: string }).code === '40001'));
});
test('company deletion cascades only forecasts of that company; forecast period/scenario uniqueness is a key', async () => {
  assert.equal(await code(as('owner', () => db.exec("INSERT INTO public.workspace_financial_forecasts(company_id,fiscal_start,fiscal_end,scenario_name) VALUES (23,'2026-04-01','2027-03-31','標準')"))), '23505');
  await save('other', 24, null, SAMPLE, { ...P, n: 'B社' });
  await db.exec('DELETE FROM public.workspace_companies WHERE id=24');
  assert.equal((await rows('SELECT * FROM public.workspace_financial_forecasts WHERE company_id=24')).length, 0);
  assert.ok((await rows('SELECT * FROM public.workspace_financial_forecasts WHERE company_id=23')).length > 0);
});
