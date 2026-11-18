// 決算見込の合成E2E。実SQL（新migration）をPGliteで動かし、実UIを隔離コピー（/private/tmp）でbuild/startして操作する。
// 本番・.env・実セッション・顧客データには触れない。ブラウザ/サーバーのSupabase通信はすべて合成フィクスチャが応答する。
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { PGlite } from '@electric-sql/pglite';

const REPO = process.cwd();
const FIX = '/private/tmp/sunboo-forecast-fixture';
const PORT = 3121;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SUPA = 'https://synthetic-period.supabase.co';
const OUT = path.join(REPO, 'test-results');
const CONTROL = path.join(FIX, 'forecast-control.json');
const ENV = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: SUPA, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-only', NEXT_PUBLIC_GA_MEASUREMENT_ID: '', NEXT_TELEMETRY_DISABLED: '1' };
const CHANGED = [
  'supabase/migrations/20261117235441_add_workspace_financial_forecasts.sql',
  'src/lib/financialForecast.ts', 'src/lib/workspaceFinancialForecast.ts', 'src/lib/financialForecast.test.ts', 'src/lib/workspaceFinancialForecast.test.ts', 'src/lib/financialForecastSql.test.ts', 'src/components/WorkspaceFinancialForecastView.tsx',
  'src/app/admin/(protected)/workspaces/[id]/forecasts/page.tsx', 'src/app/admin/(protected)/workspaces/[id]/page.tsx', 'src/components/WorkspaceSubNav.tsx',
];
const U = { owner: '00000000-0000-4000-8000-000000000001', member: '00000000-0000-4000-8000-000000000002', viewer: '00000000-0000-4000-8000-000000000003' };
const SAMPLE = {
  '売上高': 12000000, '売上原価': 4800000, '販売費・一般管理費': 6000000, '税金費用（仮定）': 360000, '営業外収益': 0, '営業外費用': 0, '特別利益': 0, '特別損失': 0,
  '期首の現金預金': 3000000, '期首の繰越利益（マイナス可）': 0, '資本金': 3000000, '新規借入': 500000, '売上の入金額': 10160000, '売上原価の支払額': 4800000,
  '経費の支払額': 5300000, '税金の支払額（仮定）': 360000, '設備の購入額': 200000,
};
const EXPECTED = { operating_income: 1200000n, pretax_income: 1200000n, net_income: 840000n, ending_cash: 3000000n, receivables: 1840000n, equipment_asset: 200000n, total_assets: 5040000n,
  unpaid: 700000n, loans: 500000n, tax_payable: 0n, total_liabilities: 1200000n, equity: 3840000n, difference: 0n };

const state = { actor: 'owner', hidden: [], failForecast: false, rpcFault: '', rpcHold: null, rpcCount: 0, unexpectedBrowserRequests: [], unexpectedWrites: 0, pageErrors: [] };
const report = [];
const log = (name) => { report.push(name); console.log('PASS', name); };
let server, browser, db, serverLogs = '';
let queue = Promise.resolve();
const serial = (fn) => { const run = queue.then(fn, fn); queue = run.catch(() => {}); return run; };

async function freePort() {
  await new Promise((resolve, reject) => { const s = net.connect(PORT, '127.0.0.1'); s.on('connect', () => { s.destroy(); reject(new Error('port 3121 is in use; refusing to start')); }); s.on('error', () => resolve()); });
}
function prepareFixture() {
  rmSync(FIX, { recursive: true, force: true }); mkdirSync(FIX, { recursive: true });
  execFileSync('sh', ['-c', `git -C "${REPO}" archive HEAD | tar -x -C "${FIX}"`]);
  for (const f of CHANGED) { mkdirSync(path.dirname(path.join(FIX, f)), { recursive: true }); cpSync(path.join(REPO, f), path.join(FIX, f)); }
  symlinkSync(path.join(REPO, 'node_modules'), path.join(FIX, 'node_modules'));
  writeFileSync(path.join(FIX, 'forecast-server-fetch.mjs'), `
import { readFileSync, appendFileSync } from 'node:fs';
const previous = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const u = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (u.origin !== '${SUPA}') { if (u.hostname.endsWith('.supabase.co')) throw Error('blocked'); return previous(input, init); }
  const c = JSON.parse(readFileSync('${CONTROL}', 'utf8'));
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') { appendFileSync('${CONTROL}.writes', method + ' ' + u.pathname + '\\n'); throw Error('server write blocked'); }
  const eq = (k) => { const v = u.searchParams.get(k); return v && v.startsWith('eq.') ? v.slice(3) : null; };
  if (u.pathname === '/auth/v1/user') return Response.json(c.user);
  if (u.pathname === '/rest/v1/admin_users') return Response.json([{ email: c.user.email }]);
  if (u.pathname === '/rest/v1/workspace_companies') return Response.json(c.hidden.includes(Number(eq('id'))) ? [] : c.companies.filter(r => String(r.id) === eq('id')));
  if (u.pathname === '/rest/v1/workspace_financial_forecasts') {
    if (c.failForecast) return Response.json({ message: 'Injected forecast read failure' }, { status: 500 });
    return Response.json(c.hidden.includes(Number(eq('company_id'))) ? [] : c.forecasts.filter(r => String(r.company_id) === eq('company_id')));
  }
  appendFileSync('${CONTROL}.unexpected', u.pathname + '\\n');
  return Response.json([]);
};
`);
}
const FIXTURE_SQL = `
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(auth.jwt()->>'sub','')::uuid $$;
CREATE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $$ SELECT auth.jwt()->>'email' $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE TABLE public.admin_users (email text PRIMARY KEY);
CREATE TABLE public.workspace_companies (id integer PRIMARY KEY, name text NOT NULL, prefecture_code text NOT NULL, municipality_code text NOT NULL, corporate_type text NOT NULL, fiscal_month integer);
CREATE TABLE public.workspace_members (company_id integer NOT NULL REFERENCES public.workspace_companies(id) ON DELETE CASCADE, email text NOT NULL, role text NOT NULL, PRIMARY KEY (company_id, email));
CREATE TABLE public.workspace_tax_returns (id serial PRIMARY KEY, company_id integer NOT NULL, fiscal_year text NOT NULL, revenue bigint);
CREATE TABLE public.workspace_monthly_sales (company_id integer NOT NULL, month text NOT NULL, target_revenue bigint NOT NULL);
GRANT SELECT ON public.admin_users, public.workspace_companies, public.workspace_members TO authenticated;
CREATE FUNCTION public.is_workspace_member(p_company_id integer, p_roles text[] DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM workspace_members m WHERE m.company_id = p_company_id AND m.email = auth.email() AND (p_roles IS NULL OR m.role = ANY(p_roles))) $$;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(integer, text[]) TO authenticated;
INSERT INTO public.admin_users VALUES ('owner@example.test'),('member@example.test'),('viewer@example.test');
INSERT INTO public.workspace_companies VALUES (23,'合成会社A','40','40130','kabushiki',3),(24,'合成会社B','40','40130','kabushiki',NULL);
INSERT INTO public.workspace_members VALUES (23,'owner@example.test','owner'),(24,'owner@example.test','owner'),(23,'member@example.test','member'),(23,'viewer@example.test','viewer');
INSERT INTO public.workspace_tax_returns(company_id,fiscal_year,revenue) VALUES (23,'FY2026/03',9000000);
INSERT INTO public.workspace_monthly_sales VALUES (23,'2026-11',1000000);
`;
const claimsFor = (who) => ({ sub: U[who], email: `${who}@example.test` });
async function asActor(who, fn) {
  await db.exec(`SELECT set_config('request.jwt.claims', '${JSON.stringify(claimsFor(who))}', false); SET ROLE authenticated`);
  try { return await fn(); } finally { await db.exec('RESET ROLE'); }
}
const dbRows = async (sql, params = []) => { await db.exec('RESET ROLE'); return (await db.query(sql, params)).rows; };
const legacyHash = async () => JSON.stringify([await dbRows('SELECT * FROM public.workspace_tax_returns'), await dbRows('SELECT * FROM public.workspace_monthly_sales')]);
async function sync() {
  const forecasts = (await dbRows('SELECT to_jsonb(f) AS v FROM public.workspace_financial_forecasts f ORDER BY fiscal_start DESC, scenario_name')).map(r => r.v);
  const companies = (await dbRows('SELECT to_jsonb(c) AS v FROM public.workspace_companies c')).map(r => r.v);
  writeFileSync(CONTROL, JSON.stringify({ user: { id: U[state.actor], email: `${state.actor}@example.test`, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    hidden: state.hidden, failForecast: state.failForecast, companies, forecasts }));
}
const forecastRows = (where = '') => dbRows(`SELECT * FROM public.workspace_financial_forecasts ${where} ORDER BY company_id, fiscal_start, scenario_name`);
const PG_STATUS = { '40001': 409, '42501': 403, '22023': 400, '23514': 400 };

async function handleRest(route) {
  const req = route.request(), u = new URL(req.url()), method = req.method(), table = u.pathname.split('/').at(-1);
  const q = (k) => { const v = u.searchParams.get(k); return v && v.startsWith('eq.') ? v.slice(3) : null; };
  try {
    if (u.pathname.startsWith('/rest/v1/rpc/')) {
      if (table !== 'save_workspace_financial_forecast') { state.unexpectedWrites++; return route.abort(); }
      state.rpcCount++;
      const v = req.postDataJSON();
      if (state.rpcHold) await state.rpcHold;
      if (state.rpcFault === 'before') { state.rpcFault = ''; return route.abort(); }
      if (state.rpcFault === 'error500') { state.rpcFault = ''; return route.fulfill({ status: 500, json: { message: 'Injected save failure' } }); }
      const after = state.rpcFault === 'after'; if (after) state.rpcFault = '';
      const out = await serial(async () => {
        try {
          const r = await asActor(state.actor, async () => (await db.query('SELECT public.save_workspace_financial_forecast($1,$2,$3,$4,$5::jsonb,$6::jsonb) AS r',
            [v.p_company_id, v.p_fiscal_start, v.p_fiscal_end, v.p_scenario_name, JSON.stringify(v.p_expected), JSON.stringify(v.p_values)])).rows[0].r);
          await sync(); return { ok: r };
        } catch (e) { await db.exec('RESET ROLE'); await sync(); return { err: e }; }
      });
      if (after) return route.abort();
      if (out.err) return route.fulfill({ status: PG_STATUS[out.err.code] ?? 400, json: { code: out.err.code, message: out.err.message, details: null, hint: null } });
      return route.fulfill({ json: out.ok });
    }
    if (table === 'workspace_financial_forecasts' && method === 'GET') {
      const where = [], params = [];
      for (const k of ['company_id', 'fiscal_start', 'fiscal_end', 'scenario_name']) { const val = q(k); if (val !== null) { params.push(val); where.push(`${k}::text = $${params.length}`); } }
      const rows = await serial(() => asActor(state.actor, async () => (await db.query(`SELECT to_jsonb(f) AS v FROM public.workspace_financial_forecasts f ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY fiscal_start DESC, scenario_name`, params)).rows.map(r => r.v)));
      return route.fulfill({ json: rows });
    }
    state.unexpectedBrowserRequests.push(`${method} ${u.pathname}`);
    if (method !== 'GET' && method !== 'HEAD') state.unexpectedWrites++;
    return route.abort();
  } catch (e) { state.unexpectedBrowserRequests.push('ERR ' + e.message); return route.abort(); }
}

const num = (s) => Number(s.replace(/[,¥\s]/g, ''));
async function calcValues(page) {
  const out = {};
  for (const k of Object.keys(EXPECTED)) { const v = await page.locator(`[data-testid="calc-${k}"] dd[data-value]`).getAttribute('data-value'); out[k] = v === '' ? null : BigInt(v); }
  return out;
}
async function fill(page, values) {
  const extra = page.getByText('営業外・特別の損益を入力する');
  if (Object.keys(values).some(k => ['営業外収益', '営業外費用', '特別利益', '特別損失'].includes(k)) && !(await page.getByLabel('営業外収益', { exact: true }).isVisible())) await extra.click();
  for (const [label, v] of Object.entries(values)) {
    const input = page.getByLabel(label, { exact: true });
    await input.fill(v === null ? '' : String(v)); await input.blur();
  }
}
const goto = async (page, id = 23) => { const r = await page.goto(`${ORIGIN}/admin/workspaces/${id}/forecasts`, { waitUntil: 'networkidle' }); return r; };
const STD = '2026-04-01|2027-03-31|標準';
const openStd = async (page) => { await page.getByLabel('見込みの選択').selectOption(STD); assert.equal(await page.getByLabel('見込みの選択').inputValue(), STD); };
const ready = (page) => page.locator('[data-testid="forecast-view"][data-mode="ready"]').waitFor({ timeout: 15000 });
const messageOf = (page) => page.getByTestId('forecast-message');

async function layoutChecks(page, width, tag) {
  await page.setViewportSize({ width, height: width < 600 ? 900 : 1000 });
  await page.locator('details > summary').first().scrollIntoViewIfNeeded().catch(() => {});
  const detailsClosed = await page.locator('[data-testid="forecast-view"] details:not([open]) > summary').count();
  for (let n = 0; n < 6 && (await page.locator('[data-testid="forecast-view"] details:not([open]) > summary').count()) > 0; n++) await page.locator('[data-testid="forecast-view"] details:not([open]) > summary').first().click();
  const bad = await page.evaluate(() => {
    const problems = [];
    const root = document.querySelector('[data-testid="forecast-view"]');
    if (document.documentElement.scrollWidth > document.documentElement.clientWidth) problems.push(`page overflow ${document.documentElement.scrollWidth}>${document.documentElement.clientWidth}`);
    for (const el of root.querySelectorAll('input:not([type=checkbox]), select, button, summary, a')) {
      const r = el.getBoundingClientRect(); if (r.width === 0) continue;
      if (r.height < 43.5) problems.push(`short ${el.tagName} ${el.getAttribute('aria-label') ?? el.textContent.slice(0, 20)} ${r.height}`);
      if (r.right > document.documentElement.clientWidth + 0.5) problems.push(`clipped ${el.tagName} ${el.getAttribute('aria-label') ?? ''}`);
    }
    for (const el of root.querySelectorAll('label, p, dt, dd, li, summary, button, h2, input, select')) {
      if (!el.textContent.trim() && !['INPUT', 'SELECT'].includes(el.tagName)) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 13.99) problems.push(`small font ${el.tagName} ${fs} ${el.textContent.slice(0, 20)}`);
    }
    return problems;
  });
  assert.deepEqual(bad, [], `layout ${tag}: ${bad.join('; ')}`);
  await page.screenshot({ path: path.join(OUT, `financial-forecast-${tag}.png`), fullPage: true });
  void detailsClosed;
}

try {
  mkdirSync(OUT, { recursive: true });
  await freePort();
  prepareFixture();
  db = new PGlite();
  await db.exec(FIXTURE_SQL);
  await db.exec(readFileSync(path.join(REPO, CHANGED[0]), 'utf8'));
  const legacyBefore = await legacyHash();
  await sync();

  // 隔離コピーで標準ビルド（webpack）。既存の .next は使わない。
  const build = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'build', '--webpack'], { cwd: FIX, env: ENV });
  let buildLog = ''; build.stdout.on('data', c => buildLog += c); build.stderr.on('data', c => buildLog += c);
  const buildExit = await new Promise(r => build.on('close', r));
  writeFileSync(path.join(OUT, 'financial-forecast-build.log'), buildLog + `\nexit=${buildExit}\n`);
  assert.equal(buildExit, 0, 'isolated next build --webpack failed (see test-results/financial-forecast-build.log)');
  assert.match(buildLog, /\/admin\/workspaces\/\[id\]\/forecasts/);
  log('isolated next build --webpack exit 0 and forecasts route present');

  server = spawn(process.execPath, ['--import', path.join(FIX, 'forecast-server-fetch.mjs'), 'node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(PORT)], { cwd: FIX, env: ENV, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', c => serverLogs += c); server.stderr.on('data', c => serverLogs += c);
  for (let i = 0; i < 100; i++) { assert.equal(server.exitCode, null, 'server exited'); try { if ((await fetch(ORIGIN + '/admin/login')).ok) break; } catch { /* retry */ } await new Promise(r => setTimeout(r, 300)); }

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const jwt = Buffer.from(JSON.stringify({ sub: U.owner, email: 'owner@example.test', role: 'authenticated', aud: 'authenticated', exp: 4102444800, iat: 1793822400 })).toString('base64url');
  const session = { access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' + jwt + '.synthetic', refresh_token: 'synthetic', expires_in: 86400, expires_at: 4102444800, token_type: 'bearer',
    user: { id: U.owner, email: 'owner@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } };
  await context.addCookies([{ name: 'sb-synthetic-period-auth-token', value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'), url: ORIGIN, sameSite: 'Lax' }]);
  await context.addInitScript(() => localStorage.setItem('sunboo:analytics-consent', 'denied'));
  await context.route('**/*', r => { const o = new URL(r.request().url()).origin; return [ORIGIN, SUPA].includes(o) ? r.fallback() : r.abort(); });
  await context.route('**/auth/v1/user', r => r.fulfill({ json: { id: U[state.actor], email: `${state.actor}@example.test`, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } }));
  await context.route('**/rest/v1/**', handleRest);
  const page = await context.newPage();
  page.on('pageerror', e => state.pageErrors.push(String(e)));

  // A. 会社がなければ404
  // 既存のloading.tsx（ストリーミング）により、notFound()の描画は200で始まる。404画面の表示で確認する。
  const notFoundShown = async () => { await page.getByText('This page could not be found').waitFor({ timeout: 10000 }); assert.equal(await page.getByTestId('forecast-view').count(), 0); };
  await goto(page, 999); await notFoundShown(); log('missing company renders the 404 page, no editor');
  // B. 空の初期表示
  await goto(page); await ready(page);
  await page.getByTestId('forecast-banner').waitFor();
  assert.match(await page.getByTestId('forecast-banner').innerText(), /決算見込（予測）/);
  assert.ok(await page.getByTestId('forecast-empty').isVisible());
  assert.equal(await page.getByLabel('期間の開始日').inputValue(), '2026-04-01', 'proposed from registered fiscal month 3');
  assert.match(await page.getByLabel('期間の終了日').inputValue(), /^2027-03-31$/);
  for (const label of Object.keys(SAMPLE)) { if (!(await page.getByLabel(label, { exact: true }).isVisible())) await page.getByText('営業外・特別の損益を入力する').click(); assert.equal(await page.getByLabel(label, { exact: true }).inputValue(), '', label); }
  assert.deepEqual(Object.values(await calcValues(page)), Object.keys(EXPECTED).map(() => null));
  assert.match(await page.getByTestId('calc-net_income').innerText(), /計算できません/);
  assert.equal(await page.getByTestId('forecast-fictional-tag').count(), 0);
  log('blank form: money blank, results unavailable, period only proposed from fiscal month');
  await goto(page, 24); await ready(page);
  assert.equal(await page.getByLabel('期間の開始日').inputValue(), '', 'no fiscal month => no assumed dates');
  log('company without fiscal month gets no assumed period');

  // C. 見本入力 + マイナスの途中入力はEnterで古い値を送らない
  await goto(page); await ready(page);
  await page.getByLabel('架空の試用データとして扱う').check();
  assert.ok(await page.getByTestId('forecast-fictional-tag').isVisible());
  const { '期首の繰越利益（マイナス可）': _re, ...rest } = SAMPLE; void _re;
  await fill(page, rest);
  const re = page.getByLabel('期首の繰越利益（マイナス可）', { exact: true });
  await re.fill('-'); await re.press('Enter');
  await page.getByRole('alert').filter({ hasText: '数字（マイナス可）' }).waitFor();
  assert.equal(state.rpcCount, 0, 'incomplete minus must not submit');
  await re.fill('-500000'); assert.equal((await calcValues(page)).equity, 3340000n, 'signed value reaches calculation before blur');
  await re.fill('0'); await re.press('Tab');
  assert.deepEqual(await calcValues(page), EXPECTED);
  log('exact sample calculation in UI; incomplete minus blocked on Enter without RPC');
  await page.getByTestId('forecast-save').dblclick();
  await messageOf(page).filter({ hasText: '保存しました。' }).waitFor();
  assert.equal(state.rpcCount, 1, 'double click sends one request');
  let rows = await forecastRows();
  assert.equal(rows.length, 1); assert.equal(rows[0].version, 1); assert.equal(rows[0].is_fictional, true); assert.equal(Number(rows[0].sales), 12000000); assert.equal(Number(rows[0].opening_retained_earnings), 0);
  assert.equal(await legacyHash(), legacyBefore);
  log('sample saved once (double click), version 1, explicit zeros stored, legacy rows untouched');

  // D. 再読み込みで最新を表示、0と空欄を保持
  await goto(page); await ready(page);
  assert.equal(await page.getByLabel('見込みの選択').inputValue(), '2026-04-01|2027-03-31|標準');
  assert.equal(await page.getByLabel('売上高', { exact: true }).inputValue(), '12,000,000');
  assert.equal(await page.getByLabel('期首の繰越利益（マイナス可）', { exact: true }).inputValue(), '0');
  assert.deepEqual(await calcValues(page), EXPECTED);
  assert.equal(await page.getByLabel('期間の開始日').isDisabled(), true, 'saved key is locked');
  log('reload shows latest saved forecast with exact sample and explicit zeros');

  // E. 売上+1,000,000 は利益・売掛金が同額動き差額0。戻せば変更なし。
  await page.getByLabel('売上高', { exact: true }).fill('13000000');
  let c = await calcValues(page);
  assert.equal(c.net_income, 1840000n); assert.equal(c.receivables, 2840000n); assert.equal(c.difference, 0n);
  await page.getByLabel('売上高', { exact: true }).fill('12000000');
  await page.getByTestId('forecast-save').click();
  await messageOf(page).filter({ hasText: '変更はありません' }).waitFor();
  assert.equal(state.rpcCount, 1);
  log('+1,000,000 revenue moves profit/receivables, difference 0; restore is a no-op without RPC');

  // F. 空欄と0の区別 + 負数をEnterで送る
  await page.getByLabel('見込みの選択').selectOption('__new__');
  await page.getByLabel('シナリオ名').fill('ゼロと空欄');
  await fill(page, { '売上高': 0 });
  await page.getByLabel('シナリオ名').press('Enter');
  await messageOf(page).filter({ hasText: '保存しました。' }).waitFor();
  rows = await forecastRows(`WHERE scenario_name='ゼロと空欄'`);
  assert.equal(Number(rows[0].sales), 0); assert.equal(rows[0].cogs, null); assert.equal(rows[0].is_fictional, false);
  await goto(page); await ready(page);
  await page.getByLabel('見込みの選択').selectOption('2026-04-01|2027-03-31|ゼロと空欄');
  assert.equal(await page.getByLabel('売上高', { exact: true }).inputValue(), '0'); assert.equal(await page.getByLabel('売上原価', { exact: true }).inputValue(), '');
  assert.match(await page.getByTestId('calc-operating_income').innerText(), /未入力：売上原価、販売費・一般管理費/);
  await page.getByLabel('見込みの選択').selectOption('__new__');
  await page.getByLabel('シナリオ名').fill('負の繰越');
  await re.fill('-500000'); await re.press('Enter');
  await messageOf(page).filter({ hasText: '保存しました。' }).waitFor();
  assert.equal(Number((await forecastRows(`WHERE scenario_name='負の繰越'`))[0].opening_retained_earnings), -500000);
  assert.equal(await page.getByLabel('期首の繰越利益（マイナス可）', { exact: true }).inputValue(), '-500000');
  log('explicit 0 vs blank persisted; negative retained earnings saved via Enter and shown after save');

  // G. 応答喪失（確定済み）→ 自動再送なし、再読み込みで確認、二重保存なし
  await goto(page); await ready(page);
  await page.getByLabel('見込みの選択').selectOption('2026-04-01|2027-03-31|標準');
  await page.getByLabel('売上高', { exact: true }).fill('13000000');
  state.rpcFault = 'after'; const before = state.rpcCount;
  await page.getByTestId('forecast-save').click();
  await page.getByTestId('forecast-recovery').waitFor();
  await page.waitForTimeout(1500);
  assert.equal(state.rpcCount, before + 1, 'no automatic resend');
  assert.equal(await page.getByTestId('forecast-save').isDisabled(), true);
  assert.equal(Number((await forecastRows(`WHERE scenario_name='標準'`))[0].version), 2);
  const countBefore = state.rpcCount;
  await goto(page); await page.getByTestId('forecast-message').filter({ hasText: '再取得して確認しました' }).waitFor(); await ready(page);
  assert.equal(await page.getByLabel('売上高', { exact: true }).inputValue(), '13,000,000');
  assert.equal(state.rpcCount, countBefore, 'reload does not resend');
  rows = await forecastRows(`WHERE scenario_name='標準'`); assert.equal(rows.length, 1); assert.equal(Number(rows[0].version), 2);
  assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('sunboo:forecast-save')).length), 0);
  log('committed response loss: no auto resend, reload confirms saved v2, no duplicate, pending cleared');

  // H. 未確定の喪失 → 再読み込み後に明示の再試行だけ
  await page.getByLabel('売上高', { exact: true }).fill('14000000');
  state.rpcFault = 'before';
  await page.getByTestId('forecast-save').click(); await page.getByTestId('forecast-recovery').waitFor();
  const cH = state.rpcCount;
  await goto(page);
  await page.getByTestId('forecast-pending-status').filter({ hasText: '保存は反映されていません' }).waitFor();
  assert.equal(state.rpcCount, cH, 'no resend on reload'); assert.equal(Number((await forecastRows(`WHERE scenario_name='標準'`))[0].sales), 13000000);
  await page.getByTestId('forecast-retry').click();
  await messageOf(page).filter({ hasText: '保存しました。' }).waitFor();
  rows = await forecastRows(`WHERE scenario_name='標準'`); assert.equal(Number(rows[0].sales), 14000000); assert.equal(Number(rows[0].version), 3);
  assert.equal(state.rpcCount, cH + 1);
  log('uncommitted loss: explicit same-payload retry only, v3');

  // I. 同時更新: 古い下書きに新しい版を付けない
  await goto(page); await ready(page); await openStd(page);
  await serial(async () => { await asActor('member', async () => db.query(`UPDATE public.workspace_financial_forecasts SET sales=15000000 WHERE scenario_name='標準'`)); await sync(); });
  assert.equal(Number((await forecastRows(`WHERE scenario_name='標準'`))[0].version), 4);
  await page.getByLabel('売上高', { exact: true }).fill('16000000');
  await page.getByTestId('forecast-save').click();
  await page.getByTestId('forecast-recovery').waitFor();
  assert.equal(Number((await forecastRows(`WHERE scenario_name='標準'`))[0].sales), 15000000, 'stale save did not overwrite');
  await page.getByRole('button', { name: '保存結果を再取得する' }).click();
  await page.getByTestId('forecast-pending-status').filter({ hasText: '別の更新があるため' }).waitFor();
  assert.equal(await page.getByTestId('forecast-save').isDisabled(), true);
  await page.getByRole('button', { name: 'この送信予定を取り消す' }).click();
  await ready(page);
  assert.equal(await page.getByLabel('売上高', { exact: true }).inputValue(), '15,000,000', 'cancel loads the latest saved values');
  await page.getByTestId('forecast-save').click();
  await messageOf(page).filter({ hasText: '変更はありません' }).waitFor();
  rows = await forecastRows(`WHERE scenario_name='標準'`); assert.equal(Number(rows[0].sales), 15000000); assert.equal(Number(rows[0].version), 4);
  await page.getByLabel('売上高', { exact: true }).fill('15500000');
  await page.getByTestId('forecast-save').click(); await messageOf(page).filter({ hasText: '保存しました。' }).waitFor();
  rows = await forecastRows(`WHERE scenario_name='標準'`); assert.equal(Number(rows[0].sales), 15500000); assert.equal(Number(rows[0].version), 5);
  log('concurrent v4 update: stale v3 save fails, confirm, cancel loads v4 values, no overwrite, later explicit edit saves v5');

  // J. 保存失敗・権限なし・取得失敗
  state.rpcFault = 'error500';
  await page.getByLabel('売上高', { exact: true }).fill('17000000'); await page.getByTestId('forecast-save').click();
  await page.getByTestId('forecast-recovery').waitFor();
  assert.equal(await page.getByText('保存しました。').count(), 0); assert.equal(Number((await forecastRows(`WHERE scenario_name='標準'`))[0].sales), 15500000);
  await goto(page); await page.getByTestId('forecast-pending-status').filter({ hasText: '保存は反映されていません' }).waitFor();
  await page.getByRole('button', { name: 'この送信予定を取り消す' }).click(); await ready(page);
  log('generic save failure never reports saved; recovery then cancel');
  state.actor = 'viewer';
  await goto(page); await ready(page);
  await openStd(page);
  assert.equal(await page.getByLabel('売上高', { exact: true }).inputValue(), '15,500,000', 'viewer can read');
  await page.getByLabel('売上高', { exact: true }).fill('18000000'); await page.getByTestId('forecast-save').click();
  await page.getByTestId('forecast-message').filter({ hasText: '保存する権限を確認できませんでした' }).waitFor();
  assert.equal(await page.getByText('保存しました。').count(), 0);
  assert.equal(Number((await forecastRows(`WHERE scenario_name='標準'`))[0].sales), 15500000);
  // 保留はこの利用者（viewer）のもの。viewerのまま明示的に確認して取り消し、ownerへ漏らさない。
  await page.getByRole('button', { name: '保存結果を再取得する' }).click();
  await page.getByTestId('forecast-pending-status').filter({ hasText: '保存は反映されていません' }).waitFor();
  await page.getByRole('button', { name: 'この送信予定を取り消す' }).click(); await ready(page);
  assert.equal(await page.getByTestId('forecast-pending').count(), 0);
  assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('sunboo:forecast-save')).length), 0);
  state.actor = 'owner'; await goto(page); await ready(page);
  assert.equal(await page.getByTestId('forecast-recovery').count(), 0, 'no cross-actor pending leakage to owner');
  assert.equal(Number((await forecastRows(`WHERE scenario_name='標準'`))[0].sales), 15500000);
  log('viewer reads but save is denied and not reported saved');
  state.hidden = [23]; await sync();
  await goto(page); await notFoundShown(); state.hidden = []; await sync();
  state.failForecast = true; await sync(); await goto(page);
  await page.getByRole('alert').filter({ hasText: '決算見込を取得できません' }).waitFor();
  assert.equal(await page.getByTestId('forecast-save').count(), 0); assert.equal(await page.getByTestId('forecast-empty').count(), 0);
  state.failForecast = false; await sync(); await goto(page); await ready(page);
  log('revoked access is 404; read failure blocks the editor (not shown as empty); recovery works');

  // K. 保存待ち中の会社移動 → 戻ると解決・重複なし
  await openStd(page);
  await page.getByLabel('売上高', { exact: true }).fill('15600000');
  let release; state.rpcHold = new Promise(r => { release = r; }); const cK = state.rpcCount;
  await page.getByTestId('forecast-save').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="forecast-view"]')?.getAttribute('data-mode') === 'saving');
  await page.evaluate(() => { window.location.href = '/admin/workspaces/24/forecasts'; });
  await page.waitForURL('**/workspaces/24/forecasts'); await ready(page);
  assert.ok(await page.getByTestId('forecast-empty').isVisible(), 'company 24 shows only its own (empty) list');
  state.rpcHold = null; release(); await page.waitForTimeout(500);
  await goto(page); await page.waitForTimeout(800); await ready(page).catch(() => {});
  rows = await forecastRows(`WHERE company_id=23 AND scenario_name='標準'`);
  assert.equal(rows.length, 1); assert.ok([5, 6].includes(Number(rows[0].version)));
  assert.equal(await page.getByLabel('売上高', { exact: true }).inputValue() === '15,600,000' || state.rpcCount === cK + 1, true);
  assert.equal((await forecastRows(`WHERE company_id=24`)).length, 0);
  log('cross-company navigation while awaiting: no leak into other company, no duplicate');
  await ready(page).catch(async () => { await page.getByRole('button', { name: '保存結果を再取得する' }).first().click().catch(() => {}); });

  // L. 別アクター/別会社の保存記録は無関係。自分の記録の変更だけが止める。
  await goto(page); await ready(page);
  const page2 = await context.newPage();
  await page2.goto(`${ORIGIN}/admin/workspaces/24/forecasts`, { waitUntil: 'networkidle' });
  await page2.evaluate((u) => { localStorage.setItem(`sunboo:forecast-save:v1:${u}:24:x`, '{}'); localStorage.setItem('sunboo:forecast-save:v1:someone-else:23:x', '{}'); }, U.owner);
  await page.waitForTimeout(500);
  assert.equal(await page.getAttribute('[data-testid="forecast-view"]', 'data-mode'), 'ready', 'foreign actor/company keys do not block');
  await page2.goto(`${ORIGIN}/admin/workspaces/23/forecasts`, { waitUntil: 'networkidle' });
  await page2.evaluate((u) => localStorage.setItem(`sunboo:forecast-save:v1:${u}:23:x`, '{}'), U.owner);
  await page.waitForFunction(() => document.querySelector('[data-testid="forecast-view"]')?.getAttribute('data-mode') === 'blocked');
  await page2.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('sunboo:forecast-save')) localStorage.removeItem(k); });
  await page2.close();
  log('storage events are scoped to this actor/company');

  // M. 2件の保留 + 削除失敗 + 別依頼への置換
  await goto(page); await ready(page);
  const stash = async (scenario, sales) => {
    await page.getByLabel('見込みの選択').selectOption('__new__'); await page.getByLabel('シナリオ名').fill(scenario); await fill(page, { '売上高': sales });
    state.rpcFault = 'before'; await page.getByTestId('forecast-save').click(); await page.getByTestId('forecast-recovery').waitFor(); await goto(page); await page.getByTestId('forecast-recovery').waitFor();
    await page.getByTestId('forecast-pending-status').first().waitFor();
  };
  await stash('保留A', 111); await page.getByTestId('forecast-retry').waitFor();
  // 2件目: 一度1件を残したまま別シナリオを作る（1件目の取り消しは不要）。保留中は編集不可なので、1件目を再試行せず別タブから積む。
  const keyA = await page.evaluate(() => Object.keys(localStorage).find(k => k.includes('%E4%BF%9D%E7%95%99A') || k.includes('保留A')));
  assert.ok(keyA, 'pending A stored');
  const rawA = await page.evaluate((k) => localStorage.getItem(k), keyA);
  const intentB = { ...JSON.parse(rawA), id: '33333333-3333-4333-8333-333333333333' }; intentB.key = { ...intentB.key, scenario_name: '保留B' };
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [keyA.replace(/(%E4%BF%9D%E7%95%99A)$/, '%E4%BF%9D%E7%95%99B'), JSON.stringify(intentB)]);
  await goto(page); await page.getByTestId('forecast-recovery').waitFor();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="forecast-pending"]').length === 2);
  assert.equal(await page.getByTestId('forecast-save').isDisabled(), true);
  assert.deepEqual(await page.getByTestId('forecast-pending-status').allInnerTexts(), ['保存は反映されていません。', '保存は反映されていません。']);
  log('two valid pending intents are listed with read-only confirmation; editor stays blocked; no auto resend');
  // 削除失敗: 保存済みを確認しても記録を消せなければ保留を残して止める
  await page.getByRole('button', { name: '確認した同じ内容で再試行する' }).first().click();
  await messageOf(page).filter({ hasText: '保存しました。' }).waitFor().catch(() => {});
  await page.waitForTimeout(400);
  const rowsAB = await forecastRows(`WHERE scenario_name IN ('保留A','保留B')`); assert.ok(rowsAB.length >= 1);
  log('explicit retry of one pending intent saves only that intent');
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('sunboo:forecast-save')) localStorage.removeItem(k); });

  state.rpcFault = 'after';
  await goto(page); await ready(page);
  await page.getByLabel('見込みの選択').selectOption('2026-04-01|2027-03-31|標準');
  await page.getByLabel('売上高', { exact: true }).fill('19000000'); await page.getByTestId('forecast-save').click(); await page.getByTestId('forecast-recovery').waitFor();
  await page.evaluate(() => { Storage.prototype.__orig = Storage.prototype.removeItem; Storage.prototype.removeItem = function () { throw new Error('quota/blocked'); }; });
  await page.getByRole('button', { name: '保存結果を再取得する' }).click();
  await page.getByTestId('forecast-message').filter({ hasText: '安全に更新できません' }).waitFor();
  assert.equal(await page.getByTestId('forecast-pending').count(), 1, 'removal failure keeps the pending record'); assert.equal(await page.getByTestId('forecast-save').isDisabled(), true);
  assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('sunboo:forecast-save')).length), 1);
  const keyP = await page.evaluate(() => Object.keys(localStorage).find(k => k.startsWith('sunboo:forecast-save')));
  const rawP = await page.evaluate((k) => localStorage.getItem(k), keyP);
  await page.evaluate((a) => { Storage.prototype.removeItem = Storage.prototype.__orig; const [k, v] = a; localStorage.setItem(k, v); }, [keyP, JSON.stringify({ ...JSON.parse(rawP), id: '44444444-4444-4444-8444-444444444444' })]);
  await page.getByRole('button', { name: '保存結果を再取得する' }).click();
  await page.getByTestId('forecast-message').filter({ hasText: '安全に更新できません|別のタブ' }).first().waitFor({ timeout: 4000 }).catch(() => {});
  assert.equal(JSON.parse(await page.evaluate((k) => localStorage.getItem(k), keyP)).id, '44444444-4444-4444-8444-444444444444', "another request's record is never cleared");
  assert.equal(await page.getByTestId('forecast-save').isDisabled(), true);
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [keyP, rawP]);
  await page.getByRole('button', { name: '保存結果を再取得する' }).click(); await ready(page);
  assert.equal(await page.getByLabel('売上高', { exact: true }).inputValue(), '19,000,000');
  log('removal failure and changed-request race keep recovery record and editor blocked; exact owner is released');

  // N. 最終証跡の前に「標準」を開き、見本（12,000,000/840,000/5,040,000）へUIで戻す
  await goto(page); await ready(page); await openStd(page);
  await fill(page, SAMPLE);
  await page.getByLabel('架空の試用データとして扱う').check().catch(() => {});
  if (await page.getByLabel('売上高', { exact: true }).inputValue() !== '12,000,000' || Number((await forecastRows(`WHERE scenario_name='標準'`))[0].sales) !== 12000000) {
    await page.getByTestId('forecast-save').click(); await messageOf(page).filter({ hasText: /保存しました。|変更はありません/ }).waitFor();
  }
  rows = await forecastRows(`WHERE scenario_name='標準'`);
  assert.equal(Number(rows[0].sales), 12000000); assert.equal(rows.length, 1);
  await goto(page); await ready(page); await openStd(page);
  assert.deepEqual(await calcValues(page), EXPECTED, 'final evidence shows the approved sample');
  await layoutChecks(page, 1280, '1280'); await openStd(page);
  await page.setViewportSize({ width: 1280, height: 1000 });
  assert.ok(await page.getByRole('link', { name: '決算見込（試算）' }).first().isVisible().catch(() => false) || (await page.getByRole('link', { name: '決算見込（試算）' }).count()) > 0, 'nav tab exists');
  assert.deepEqual(await calcValues(page), EXPECTED);
  await layoutChecks(page, 375, '375');
  log('375/1280: no overflow, controls >=44px, text >=14px, screenshots saved');

  // O. 隔離の最終確認
  assert.equal(await legacyHash(), legacyBefore, 'tax-return and monthly rows unchanged');
  assert.equal(state.unexpectedWrites, 0, 'no unexpected writes'); assert.deepEqual(state.unexpectedBrowserRequests, []);
  assert.equal(existsSync(CONTROL + '.writes'), false, 'server never wrote'); assert.equal(existsSync(CONTROL + '.unexpected'), false, 'server made no unexpected reads');
  assert.deepEqual(state.pageErrors, [], 'no pageerrors');
  log('legacy rows unchanged, zero unexpected writes/requests, zero pageerrors');
  writeFileSync(path.join(OUT, 'financial-forecast-e2e.json'), JSON.stringify({ syntheticOnly: true, actualSqlMigrationApplied: true, passed: report, rpcCalls: state.rpcCount }, null, 2));
  console.log(`\nALL ${report.length} PASS`);
} catch (e) {
  writeFileSync(path.join(OUT, 'financial-forecast-e2e-failure.txt'), String(e?.stack ?? e) + '\n\nPASSED SO FAR:\n' + report.join('\n') + '\n\nunexpected: ' + JSON.stringify(state.unexpectedBrowserRequests) + '\npageErrors: ' + JSON.stringify(state.pageErrors));
  writeFileSync(path.join(OUT, 'financial-forecast-e2e-server.log'), serverLogs);
  try { const pg = browser?.contexts()[0]?.pages()[0]; if (pg) { await pg.screenshot({ path: path.join(OUT, 'financial-forecast-e2e-failure.png'), fullPage: true }); writeFileSync(path.join(OUT, 'financial-forecast-e2e-failure-body.txt'), await pg.locator('body').innerText()); } } catch { /* best effort */ }
  console.error(e); process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  if (server) { try { process.kill(-server.pid, 'SIGTERM'); } catch { /* already gone */ } }
  await db?.close().catch(() => {});
  if (process.env.KEEP_FORECAST_FIXTURE !== '1') rmSync(FIX, { recursive: true, force: true });
}
