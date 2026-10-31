import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
import { createServerClient } from '@supabase/ssr';

// 専用会社のIDと名称を両方指定し、一致しなければ書き込まない。
// 例: SHARE_TEST_COMPANY_ID=2 SHARE_TEST_COMPANY_NAME=... npm run test:e2e:share-link-expiry:live
// URL・トークン・セッションは出力しない。発行したリンクはfinallyで失効させる。
process.loadEnvFile('.env.local');
const companyId = Number(process.env.SHARE_TEST_COMPANY_ID);
const expectedName = process.env.SHARE_TEST_COMPANY_NAME;
assert.ok(Number.isInteger(companyId) && companyId > 0 && expectedName && /テスト|検証|test/i.test(expectedName), 'Dedicated test company ID and name are required');
const appUrl = process.env.PREVIEW_APP_URL ?? 'http://localhost:3108';
const origin = new URL(appUrl).origin;
const authPath = process.env.SHARE_TEST_AUTH_PATH ?? 'playwright/.auth/share-expiry-session.json';
const invalidMessage = 'このリンクは無効か、有効期限が切れています。共有元にお問い合わせください。';
let browser;
let server;
let adminContext;
let supabase;
let testUser;
const issued = new Map();
const observations = [];
const result = { companyId, checks: [], issued: 0, revoked: 0 };
let failure;
try {
  if (!process.env.PREVIEW_APP_URL) {
    server = spawn('npm', ['run', 'start', '--', '--hostname', '127.0.0.1', '--port', '3108'], { stdio: 'ignore', detached: true });
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`${origin}/admin/login`, { signal: AbortSignal.timeout(2000) })).ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.ok(ready, 'Local production server did not start');
  }
  browser = await chromium.launch({ headless: true });
  adminContext = await browser.newContext();
  const saved = JSON.parse(readFileSync(authPath, 'utf8'));
  await adminContext.addCookies(saved.cookies.map(({ name, value }) => ({ name, value, url: origin, secure: origin.startsWith('https:'), sameSite: 'Lax' })));
  supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookies: {
    getAll: async () => (await adminContext.cookies(origin)).map(({ name, value }) => ({ name, value })),
    setAll: async updates => { await adminContext.addCookies(updates.map(({ name, value }) => ({ name, value, url: origin, secure: origin.startsWith('https:'), sameSite: 'Lax' }))); },
  } });
  const auth = await supabase.auth.getUser();
  assert.ok(!auth.error && auth.data.user?.email, 'Admin session is unavailable');
  testUser = auth.data.user;
  const company = await supabase.from('workspace_companies').select('id,name').eq('id', companyId).single();
  assert.ok(!company.error && company.data?.name === expectedName, 'Dedicated test company did not match');
  const page = await adminContext.newPage();
  // DBのINSERT成功直後からIDを保持し、描画失敗時でもcleanup対象を失わない。
  page.on('response', response => {
    const request = response.request();
    if (!response.url().includes('/rest/v1/workspace_share_links') || request.method() !== 'POST' || !response.ok()) return;
    const body = request.postDataJSON();
    if (body.company_id !== companyId || body.created_by !== testUser.email) return;
    observations.push(response.json().then(row => { if (row.id && row.token) issued.set(row.id, row); }));
  });
  await page.goto(`${origin}/admin/workspaces/${companyId}/share`, { waitUntil: 'networkidle' });
  assert.ok(!page.url().includes('/admin/login'), 'Admin session did not reach the share page');
  const select = page.getByLabel('有効期限', { exact: true });
  await select.waitFor();
  assert.equal(await select.inputValue(), '30');
  result.checks.push('default-30-days');
  const anon = await browser.newContext();
  const publicPage = await anon.newPage();
  const rows = [];
  for (const expiry of ['30', '7', 'unlimited']) {
    await select.selectOption(expiry);
    const before = new Set(issued.keys());
    const start = Date.now();
    const response = page.waitForResponse(response => response.url().includes('/rest/v1/workspace_share_links') && response.request().method() === 'POST');
    await page.getByRole('button', { name: '新しい共有リンクを発行', exact: true }).click();
    await response;
    await Promise.all(observations);
    const row = [...issued.values()].find(link => !before.has(link.id));
    assert.ok(row, 'New test link was not returned by the database');
    const persisted = await supabase.from('workspace_share_links').select('id,expires_at,revoked_at').eq('company_id', companyId).eq('id', row.id).single();
    assert.ok(!persisted.error && persisted.data, 'New test link could not be read back');
    if (expiry === 'unlimited') assert.equal(persisted.data.expires_at, null);
    else assert.ok(Math.abs(Date.parse(persisted.data.expires_at) - (start + Number(expiry) * 86400000)) < 60000, 'Persisted expiry did not match selected duration');
    rows.push(row);
    await publicPage.goto(`${origin}/share/${row.token}`, { waitUntil: 'networkidle' });
    await publicPage.getByRole('heading', { name: expectedName, exact: true }).waitFor();
    result.checks.push(`${expiry}-persisted-and-anonymous-allowed`);
  }
  // 手動失効ではなく、有効期限だけで匿名アクセスが拒否されることを確認する。
  const expired = rows[1];
  const update = await supabase.from('workspace_share_links').update({ expires_at: new Date(Date.now() - 60000).toISOString() }).eq('company_id', companyId).eq('id', expired.id).select('id,revoked_at,expires_at').single();
  assert.ok(!update.error && update.data && update.data.revoked_at === null, 'Could not set expiry on the dedicated test link');
  await publicPage.goto(`${origin}/share/${expired.token}`, { waitUntil: 'networkidle' });
  await publicPage.getByText(invalidMessage, { exact: true }).waitFor();
  assert.equal(await publicPage.getByRole('heading', { name: expectedName, exact: true }).count(), 0);
  await page.reload({ waitUntil: 'networkidle' });
  const expiredCard = page.locator('.card').filter({ has: page.locator(`input[value$="/${expired.token}"]`) });
  await expiredCard.getByText('期限切れ', { exact: true }).waitFor();
  assert.equal(await expiredCard.getByRole('button', { name: 'コピー', exact: true }).isDisabled(), true);
  result.checks.push('expired-not-revoked-anonymous-denied-and-admin-expired');
  // 管理画面の手動失効も実行する。
  const activeCard = page.locator('.card').filter({ has: page.locator(`input[value$="/${rows[0].token}"]`) });
  page.once('dialog', dialog => dialog.accept());
  await activeCard.getByRole('button', { name: '失効させる', exact: true }).click();
  await activeCard.getByText('失効済み', { exact: true }).waitFor();
  await publicPage.goto(`${origin}/share/${rows[0].token}`, { waitUntil: 'networkidle' });
  await publicPage.getByText(invalidMessage, { exact: true }).waitFor();
  result.checks.push('manual-revoke-anonymous-denied');
} catch (error) {
  // Playwrightのエラーには対象URLが含まれるため、例外本文をログへ出さない。
  failure = error;
} finally {
  await Promise.allSettled(observations);
  result.issued = issued.size;
  if (supabase && issued.size) {
    const cleanup = await supabase.from('workspace_share_links').update({ revoked_at: new Date().toISOString() }).eq('company_id', companyId).eq('created_by', testUser.email).in('id', [...issued.keys()]).select('id,revoked_at');
    if (cleanup.error || cleanup.data?.length !== issued.size || cleanup.data.some(row => !row.revoked_at)) failure = new Error('Test link revocation was not confirmed');
    else result.revoked = cleanup.data.length;
  }
  if (adminContext) await adminContext.storageState({ path: authPath });
  await browser?.close();
  if (server?.pid) { try { process.kill(-server.pid, 'SIGTERM'); } catch {} }
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/share-link-expiry-live-result.json', JSON.stringify({ ...result, passed: !failure }, null, 2));
  if (failure) {
    console.error(JSON.stringify({ ...result, passed: false, reason: 'Live verification failed; see completed check names. No URLs/tokens are logged.' }));
    process.exitCode = 1;
  } else console.log(JSON.stringify({ ...result, passed: true }));
}
