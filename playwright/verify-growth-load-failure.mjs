import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { chromium } from 'playwright-core';

// 認証・専用会社の読み取り以外は合成データを使用。DBへの書き込みは禁止。
process.loadEnvFile('.env.local');
const companyId = Number(process.env.GROWTH_TEST_COMPANY_ID);
assert.ok(Number.isInteger(companyId) && companyId > 0, 'Dedicated test company ID is required');
const origin = 'http://127.0.0.1:3109';
const controlFile = path.resolve('test-results/growth-load-control.json');
const tables = ['workspace_monthly_sales', 'workspace_weekly_sales_activities', 'workspace_daily_sales_activities', 'workspace_tax_payment_plans'];
const yearMonth = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit' }).format(new Date());
const rows = Object.fromEntries(tables.map(table => [table, []]));
rows.workspace_monthly_sales = [{ year_month: yearMonth + '-01', target_revenue: 1000000, actual_revenue: 650000, action_goal: 'E2Eの架空行動目標', revenue_model: 'sales_funnel', cash_balance: 300000 }];
const setFailure = failTable => writeFile(controlFile, JSON.stringify({ companyId, rows, failTable }));
let server;
let browser;
let browserMutations = 0;
let logs = '';
try {
  await mkdir('test-results', { recursive: true });
  await setFailure(null);
  server = spawn(process.execPath, ['--import', path.resolve('playwright/growth-load-failure-fetch.mjs'), 'node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3109'], { env: { ...process.env, GROWTH_FAILURE_CONTROL_FILE: controlFile }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', chunk => { logs += chunk; });
  server.stderr.on('data', chunk => { logs += chunk; });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    assert.equal(server.exitCode, null, 'Local test server exited');
    try { if ((await fetch(origin + '/admin/login', { signal: AbortSignal.timeout(10000) })).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, 'Local test server did not start');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const saved = JSON.parse(readFileSync(process.env.GROWTH_TEST_AUTH_PATH ?? 'playwright/.auth/share-expiry-session.json', 'utf8'));
  await context.addCookies(saved.cookies.map(({ name, value }) => ({ name, value, url: origin, sameSite: 'Lax' })));
  await context.addInitScript(() => localStorage.setItem('sunboo:analytics-consent', 'denied'));
  await context.route('**/rest/v1/**', route => {
    if (!['GET', 'HEAD'].includes(route.request().method())) { browserMutations++; return route.abort(); }
    return route.continue();
  });
  const page = await context.newPage();
  const growthPath = `/admin/workspaces/${companyId}/growth`;
  await page.goto(origin + growthPath, { waitUntil: 'networkidle' });
  assert.ok(!page.url().includes('/admin/login'), 'Admin session unavailable');
  const save = page.getByRole('button', { name: '売上計画を保存', exact: true });
  await save.waitFor();
  assert.equal(await page.getByLabel('今月の行動目標', { exact: true }).inputValue(), 'E2Eの架空行動目標');
  assert.equal((await page.getByRole('textbox', { name: '現在の売上実績', exact: true }).inputValue()).replaceAll(',', ''), '650000');
  for (const table of tables) {
    await setFailure(table);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('alert').filter({ hasText: '既存の情報を保護するため' }).waitFor();
    assert.equal(await save.count(), 0);
    assert.equal(await page.getByRole('textbox').count(), 0);
    assert.equal(await page.getByRole('button', { name: /保存|実行計画を作る/ }).count(), 0);
    assert.equal(await page.getByRole('link', { name: '再読み込み', exact: true }).getAttribute('href'), growthPath);
  }
  await page.screenshot({ path: 'test-results/growth-load-failure.png', fullPage: true });
  await setFailure(null);
  await page.getByRole('link', { name: '再読み込み', exact: true }).click();
  await save.waitFor();
  assert.equal(await page.getByLabel('今月の行動目標', { exact: true }).inputValue(), 'E2Eの架空行動目標');
  assert.equal((await page.getByRole('textbox', { name: '現在の売上実績', exact: true }).inputValue()).replaceAll(',', ''), '650000');
  // 全件0行の正常な未登録状態では、作成フォームを表示する。
  rows.workspace_monthly_sales = [];
  await setFailure(null);
  await page.reload({ waitUntil: 'networkidle' });
  await save.waitFor();
  assert.equal(await page.getByLabel('今月の行動目標', { exact: true }).inputValue(), '');
  assert.equal(browserMutations, 0);
  assert.equal(existsSync(controlFile + '.mutations'), false);
  console.log('PASS: four read failures hide all editing/saving; retry restores existing values; valid empty data remains editable; zero DB writes.');
} finally {
  await browser?.close();
  if (server?.pid) { try { process.kill(-server.pid, 'SIGTERM'); } catch {} }
  await writeFile('test-results/growth-load-server.log', logs);
}
