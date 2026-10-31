import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

// 一時的な画面で実コンポーネントを動かし、Supabase通信だけをモックする。
// 本番データ・管理者セッションは使用しない。
const fixtureDir = 'src/app/test-share-expiry';
const port = 3107;
const origin = `http://127.0.0.1:${port}`;
const now = new Date('2026-10-31T03:00:00Z');
if (existsSync(fixtureDir)) throw new Error(`${fixtureDir} already exists; refusing to overwrite`);
process.loadEnvFile('.env.local');
const supabaseOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin;
const project = new URL(supabaseOrigin).hostname.split('.')[0];
let server;
let browser;
let logs = '';
try {
  await mkdir(fixtureDir);
  await writeFile(`${fixtureDir}/page.tsx`, `
import Panel from '../admin/(protected)/workspaces/[id]/share/WorkspaceShareLinksPanel';
const common = {shared_sections: ['company', 'profile', 'roadmap'], revoked_at: null, last_accessed_at: null, created_at: '${now.toISOString()}'};
export default async function TestPage({searchParams}: {searchParams: Promise<{failed?: string; empty?: string}>}) {
  const query = await searchParams;
  return <main className="p-8"><h1>共有リンク期限のテスト</h1><Panel companyId={1} initialLinks={query.failed ? null : query.empty ? [] : [
    {...common, id: 1, token: 'legacy-unlimited', expires_at: null},
    {...common, id: 2, token: 'expired', expires_at: '${now.toISOString()}'},
    {...common, id: 3, token: 'revoked', expires_at: null, revoked_at: '${now.toISOString()}'},
    {...common, id: 4, token: 'soon-expired', expires_at: '${new Date(+now + 2000).toISOString()}'},
  ]} /></main>;
}
`);
  server = spawn('npm', ['run', 'dev', '--', '--webpack', '--hostname', '127.0.0.1', '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  server.stdout.on('data', chunk => { logs += chunk; });
  server.stderr.on('data', chunk => { logs += chunk; });
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (server.exitCode !== null) throw new Error(`Dev server failed: ${logs}`);
    try { if ((await fetch(origin + '/test-share-expiry', { signal: AbortSignal.timeout(10000) })).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, `Server did not become ready: ${logs}`);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const payload = Buffer.from(JSON.stringify({ sub: '00000000-0000-4000-8000-000000000001', exp: 4102444800, iat: 1793415600, role: 'authenticated' })).toString('base64url');
  const user = { id: '00000000-0000-4000-8000-000000000001', email: 'test@example.invalid', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: now.toISOString() };
  const session = { access_token: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${payload}.test`, refresh_token: 'test', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user };
  await context.addCookies([{ name: `sb-${project}-auth-token`, value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'), url: origin }]);
  const inserts = [];
  let failure = '';
  let lookupFails = false;
  const records = new Map();
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    if (url.origin !== supabaseOrigin) return route.abort();
    const headers = { 'access-control-allow-origin': origin, 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS', 'content-type': 'application/json' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (url.pathname === '/auth/v1/user') return route.fulfill({ headers, json: user });
    if (url.pathname === '/rest/v1/workspace_share_links' && route.request().method() === 'GET') {
      if (lookupFails) return route.fulfill({status: 500, headers, json: {message: 'lookup failed'}});
      const token = url.searchParams.get('token')?.replace(/^eq\./, '');
      const row = records.get(token);
      return route.fulfill({headers, json: row ? [row] : []});
    }
    if (url.pathname === '/rest/v1/workspace_share_links' && route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      inserts.push(body);
      const mode = failure;
      failure = '';
      if (mode === 'before-commit') return route.abort();
      if (records.has(body.token)) return route.fulfill({status:409,headers,json:{code:'23505'}});
      const row = { ...body, id: inserts.length + 10, created_at: now.toISOString(), revoked_at: null, last_accessed_at: null };
      records.set(body.token, row);
      if (mode === 'after-commit') return route.abort();
      return route.fulfill({ status: 201, headers, json: row });
    }
    throw new Error(`Unexpected Supabase request: ${url.pathname}`);
  });
  const page = await context.newPage();
  await page.clock.install({ time: now });
  await page.goto(origin + '/test-share-expiry?failed=1');
  await page.getByRole('alert').filter({hasText:'発行済みリンクを確認できない'}).waitFor();
  assert.equal(await page.getByRole('button', {name:'新しい共有リンクを発行',exact:true}).isDisabled(), true);
  assert.equal(await page.getByText('まだ共有リンクがありません。', {exact:false}).count(), 0);
  assert.equal(inserts.length, 0);
  assert.ok(await page.getByRole('link',{name:'再読み込み',exact:true}).getAttribute('href'));
  await page.goto(origin + '/test-share-expiry?empty=1');
  await page.getByText('まだ共有リンクがありません。', {exact:false}).waitFor();
  assert.equal(await page.getByRole('button', {name:'新しい共有リンクを発行',exact:true}).isEnabled(), true);
  await page.goto(origin + '/test-share-expiry');
  const select = page.getByLabel('有効期限', { exact: true });
  await select.waitFor();
  assert.equal(await select.inputValue(), '30');
  assert.deepEqual(await select.locator('option').allTextContents(), ['7日', '30日', '無期限']);
  const card = token => page.locator('.card').filter({ has: page.locator(`input[value$="/${token}"]`) });
  assert.equal(await card('expired').getByRole('button', { name: 'コピー', exact: true }).isDisabled(), true);
  assert.equal(await card('revoked').getByRole('button', { name: 'コピー', exact: true }).isDisabled(), true);
  assert.equal(await card('legacy-unlimited').getByRole('button', { name: 'コピー', exact: true }).isEnabled(), true);
  await page.clock.fastForward(3000);
  assert.equal(await card('soon-expired').getByRole('button', { name: 'コピー', exact: true }).isDisabled(), true);
  const create = page.getByRole('button', { name: '新しい共有リンクを発行', exact: true });
  for (const expiry of ['30', '7', 'unlimited']) {
    await select.selectOption(expiry);
    const start = await page.evaluate(() => Date.now());
    const count = inserts.length;
    await create.click();
    await page.waitForFunction(previous => document.querySelectorAll('input[readonly]').length > previous, 4 + count);
    const token = inserts.at(-1).token;
    await page.locator(`input[value$="/${token}"]`).waitFor();
    const body = inserts.at(-1);
    assert.equal(body.company_id, 1);
    if (expiry === 'unlimited') assert.equal(body.expires_at, null);
    else assert.ok(Math.abs(Date.parse(body.expires_at) - (start + Number(expiry) * 86400000)) < 2000);
  }
  // 同一イベント内の連打も、通信前のロックで1件だけ発行する。
  const doubleClickAttempts = inserts.length;
  await create.evaluate(button => { button.click(); button.click(); });
  await page.waitForFunction(previous => document.querySelectorAll('input[readonly]').length > previous, 7);
  assert.equal(inserts.length, doubleClickAttempts + 1);

  // DB確定後に応答喪失。再読み込み後も既存行を確認するだけで、新規INSERTしない。
  failure = 'after-commit';
  await create.click();
  await page.getByRole('alert').filter({hasText:'発行結果を確認できませんでした'}).waitFor();
  const committedToken = inserts.at(-1).token;
  const attempts = inserts.length;
  assert.equal(await create.count(), 0);
  await page.goto(origin + '/test-share-expiry?failed=1');
  await page.getByRole('alert').filter({hasText:'発行済みリンクを確認できない'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'発行状況を確認・再試行',exact:true}).isDisabled(), true);
  assert.equal(inserts.length, attempts);
  await page.goto(origin + '/test-share-expiry');
  const retry = page.getByRole('button',{name:'発行状況を確認・再試行',exact:true});
  await retry.waitFor();
  lookupFails = true;
  await retry.click();
  await page.getByRole('alert').filter({hasText:'発行結果を確認できませんでした'}).waitFor();
  assert.equal(inserts.length, attempts);
  lookupFails = false;
  await retry.click();
  await page.locator(`input[value$="/${committedToken}"]`).waitFor();
  assert.equal(inserts.length, attempts);

  // DB未確定の通信エラーも、再読み込み後は同じトークン・期限で再試行する。
  failure = 'before-commit';
  await create.click();
  await page.getByRole('alert').filter({hasText:'発行結果を確認できませんでした'}).waitFor();
  const uncommitted = inserts.at(-1);
  const retryAttempts = inserts.length;
  await page.goto(origin + '/test-share-expiry');
  await retry.click();
  await page.locator(`input[value$="/${uncommitted.token}"]`).waitFor();
  assert.equal(inserts.length, retryAttempts + 1);
  assert.deepEqual(inserts.at(-1), uncommitted);
  assert.equal(records.size, 6);

  // ブラウザ保存が使えなければ、応答不明の要求を失わないため発行しない。
  const blockedContext = await browser.newContext();
  await blockedContext.addInitScript(() => Object.defineProperty(window, 'sessionStorage', {get(){throw new Error('blocked');}}));
  const blocked = await blockedContext.newPage();
  await blocked.goto(origin + '/test-share-expiry');
  await blocked.getByRole('alert').filter({hasText:'前回の発行情報をブラウザで確認できない'}).waitFor();
  assert.equal(await blocked.getByRole('button',{name:'新しい共有リンクを発行',exact:true}).isDisabled(), true);
  await blockedContext.close();
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/share-link-expiry.png', fullPage: true });
  console.log('PASS: expiry regressions; failed versus empty listing; creation blocked until loaded; storage failure; lost responses before/after commit; reload and same-request retry; lookup failure; zero duplicate records. No live DB writes.');
} finally {
  await browser?.close();
  if (server?.pid) { try { process.kill(-server.pid, 'SIGTERM'); } catch {} }
  await rm(fixtureDir, { recursive: true, force: true });
  // 一時ページへの参照が次の本番ビルドに残らないようにする。
  await rm('.next/dev/types', { recursive: true, force: true });
}
