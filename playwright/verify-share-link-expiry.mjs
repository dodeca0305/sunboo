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
export default function TestPage() {
  return <main className="p-8"><h1>共有リンク期限のテスト</h1><Panel companyId={1} initialLinks={[
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
  let failNext = false;
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    if (url.origin !== supabaseOrigin) return route.abort();
    const headers = { 'access-control-allow-origin': origin, 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS', 'content-type': 'application/json' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (url.pathname === '/auth/v1/user') return route.fulfill({ headers, json: user });
    if (url.pathname === '/rest/v1/workspace_share_links' && route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      inserts.push(body);
      if (failNext) { failNext = false; return route.fulfill({ status: 500, headers, json: { message: 'テスト用発行失敗' } }); }
      return route.fulfill({ status: 201, headers, json: { ...body, id: inserts.length + 10, token: `test-${inserts.length}`, created_at: now.toISOString(), revoked_at: null, last_accessed_at: null } });
    }
    throw new Error(`Unexpected Supabase request: ${url.pathname}`);
  });
  const page = await context.newPage();
  await page.clock.install({ time: now });
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
    const token = `test-${inserts.length + 1}`;
    await create.click();
    await page.locator(`input[value$="/${token}"]`).waitFor();
    const body = inserts.at(-1);
    assert.equal(body.company_id, 1);
    if (expiry === 'unlimited') assert.equal(body.expires_at, null);
    else assert.ok(Math.abs(Date.parse(body.expires_at) - (start + Number(expiry) * 86400000)) < 2000);
  }
  failNext = true;
  await create.click();
  await page.getByText('発行に失敗しました: テスト用発行失敗', { exact: true }).waitFor();
  assert.equal(await create.isEnabled(), true);
  await create.click();
  await page.locator(`input[value$="/test-5"]`).waitFor();
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/share-link-expiry.png', fullPage: true });
  console.log('PASS: default 30 days; 7/30/unlimited persisted; existing unlimited; expired/revoked copy disabled; automatic expiry; failure and retry. No live DB writes.');
} finally {
  await browser?.close();
  if (server?.pid) { try { process.kill(-server.pid, 'SIGTERM'); } catch {} }
  await rm(fixtureDir, { recursive: true, force: true });
  // 一時ページへの参照が次の本番ビルドに残らないようにする。
  await rm('.next/dev/types', { recursive: true, force: true });
}
