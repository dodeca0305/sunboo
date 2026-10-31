import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { chromium } from 'playwright-core';

// 認証・専用会社の読み取り以外は合成データを使用。DBへの書き込みは禁止。
process.loadEnvFile('.env.local');
const companyId = Number(process.env.PROFILE_TEST_COMPANY_ID);
assert.ok(Number.isInteger(companyId) && companyId > 0, 'Dedicated test company ID is required');
const origin = 'http://127.0.0.1:3110';
const controlFile = path.resolve('test-results/profile-load-control.json');
const tables = ['workspace_company_profiles', 'prefectures', 'municipalities'];
const rows = {
  workspace_company_profiles: [{
    company_id: companyId, employee_count: 7, capital: 5000000, established_date: '2020-04-01', stage: 'second_term_or_later',
    consumption_tax_status: 'taxable', invoice_registration_status: 'registered', taxation_method: 'principle',
    corporate_tax_interim_filing: 'has', consumption_tax_interim_frequency: '3', withholding_tax_cycle: 'monthly',
    local_tax_collection_method: 'special_collection', resident_tax_payment_cycle: 'monthly', next_officer_change_date: '2027-04-01',
    address: 'E2E用の架空住所', e_tax_enabled: true, e_ltax_enabled: true,
    advisors: { taxAccountant: true, laborConsultant: true, judicialScrivener: false, administrativeScrivener: false },
  }],
  prefectures: [{ name: '東京都' }], municipalities: [{ name: '渋谷区' }],
};
const setFailure = failTable => writeFile(controlFile, JSON.stringify({ companyId, rows, failTable }));
let server;
let browser;
let browserMutations = 0;
let logs = '';
try {
  await mkdir('test-results', { recursive: true });
  await setFailure(null);
  server = spawn(process.execPath, ['--import', path.resolve('playwright/profile-load-failure-fetch.mjs'), 'node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3110'], { env: { ...process.env, PROFILE_FAILURE_CONTROL_FILE: controlFile }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
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
  const saved = JSON.parse(readFileSync(process.env.PROFILE_TEST_AUTH_PATH ?? 'playwright/.auth/share-expiry-session.json', 'utf8'));
  await context.addCookies(saved.cookies.map(({ name, value }) => ({ name, value, url: origin, sameSite: 'Lax' })));
  await context.addInitScript(() => localStorage.setItem('sunboo:analytics-consent', 'denied'));
  await context.route('**/rest/v1/**', route => {
    if (!['GET', 'HEAD'].includes(route.request().method())) { browserMutations++; return route.abort(); }
    return route.continue();
  });
  const page = await context.newPage();
  const profilePath = `/admin/workspaces/${companyId}/profile`;
  await page.goto(origin + profilePath, { waitUntil: 'networkidle' });
  assert.ok(!page.url().includes('/admin/login'), 'Admin session unavailable');
  const save = page.getByRole('button', { name: '保存する', exact: true });
  await save.waitFor();
  const employees = page.getByRole('textbox', { name: '従業員数', exact: true });
  const capital = page.getByRole('textbox', { name: '資本金', exact: true });
  const address = page.getByPlaceholder('例: 1丁目2番3号 ○○ビル4階', { exact: true });
  async function assertExisting() {
    assert.equal(await employees.inputValue(), '7');
    assert.equal((await capital.inputValue()).replaceAll(',', ''), '5000000');
    assert.equal(await address.inputValue(), 'E2E用の架空住所');
  }
  await assertExisting();
  for (const table of tables) {
    await setFailure(table);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('alert').filter({ hasText: '登録済みの情報を確認できないため' }).waitFor();
    assert.equal(await save.count(), 0);
    assert.equal(await page.getByRole('textbox').count(), 0);
    assert.equal(await page.getByRole('button', { name: /保存|実行計画を作る/ }).count(), 0);
    assert.equal(await page.getByRole('link', { name: '再読み込み', exact: true }).getAttribute('href'), profilePath);
  }
  await page.screenshot({ path: 'test-results/profile-load-failure.png', fullPage: true });
  await setFailure(null);
  await page.getByRole('link', { name: '再読み込み', exact: true }).click();
  await save.waitFor();
  await assertExisting();
  // 全件0行の正常な未登録状態では、作成フォームを表示する。
  rows.workspace_company_profiles = [];
  await setFailure(null);
  await page.reload({ waitUntil: 'networkidle' });
  await save.waitFor();
  assert.equal(await employees.inputValue(), '0');
  assert.equal(await capital.inputValue(), '');
  assert.equal(await address.inputValue(), '');
  assert.equal(browserMutations, 0);
  assert.equal(existsSync(controlFile + '.mutations'), false);
  console.log('PASS: profile and geographic read failures hide editing/saving; retry restores all existing values; valid missing profile remains editable; zero DB writes.');
} finally {
  await browser?.close();
  if (server?.pid) { try { process.kill(-server.pid, 'SIGTERM'); } catch {} }
  await writeFile('test-results/profile-load-server.log', logs);
}
