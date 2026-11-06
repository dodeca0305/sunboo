import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { chromium } from 'playwright-core';

process.loadEnvFile('.env.local');
const companyId = 900023; // 本番に存在しない合成会社。DB行は全てローカルで合成。
const origin = 'http://127.0.0.1:3112';
const controlFile = path.resolve('test-results/roadmap-tax-load-control.json');
let control = { companyId, mode: 'loaded', rows: [] };
const setControl = async (updates) => { control = { ...control, ...updates }; await writeFile(controlFile, JSON.stringify(control)); };
let server;
let browser;
let logs = '';
let unexpectedWrites = 0;
const writes = [];
let saveMode = 'success';
try {
  await mkdir('test-results', { recursive: true });
  await setControl({});
  assert.equal(existsSync(controlFile + '.mutations'), false, 'Use a fresh test run without blocked server writes');
  server = spawn(process.execPath, ['--import', path.resolve('playwright/roadmap-tax-load-failure-fetch.mjs'), 'node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3112'], { env: { ...process.env, ROADMAP_TAX_CONTROL_FILE: controlFile }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', c => { logs += c; });
  server.stderr.on('data', c => { logs += c; });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    assert.equal(server.exitCode, null, 'Server exited');
    try { if ((await fetch(origin + '/admin/login', { signal: AbortSignal.timeout(10000) })).ok) { ready = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  assert.ok(ready, 'Local server did not start');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const saved = JSON.parse(readFileSync('playwright/.auth/share-expiry-session.json', 'utf8'));
  await context.addCookies(saved.cookies.map(({ name, value }) => ({ name, value, url: origin, sameSite: 'Lax' })));
  await context.addInitScript(() => localStorage.setItem('sunboo:analytics-consent', 'denied'));
  // ブラウザからの全REST通信も合成。実DBへ書き込まない。
  await context.route('**/rest/v1/**', async route => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST, GET, HEAD, OPTIONS', 'access-control-allow-headers': req.headers()['access-control-request-headers'] ?? '*', 'access-control-max-age': '0' } });
    if (['GET', 'HEAD'].includes(req.method())) return route.fulfill({ json: [] });
    if (!req.url().includes('/workspace_tax_payment_plans') || req.method() !== 'POST') { unexpectedWrites++; return route.abort(); }
    const body = req.postDataJSON();
    assert.equal(body.company_id, companyId);
    writes.push(body);
    if (saveMode === 'abort') return route.abort('failed');
    if (saveMode === 'error') return route.fulfill({ status: 400, json: { message: 'Synthetic save failure' }, headers: { 'access-control-allow-origin': origin } });
    return route.fulfill({ status: 201, body: '', headers: { 'access-control-allow-origin': origin } });
  });
  const page = await context.newPage();
  page.on('pageerror', e => console.log('Page error:', e.message));
  const url = origin + `/admin/workspaces/${companyId}/roadmap`;
  await page.goto(url, { waitUntil: 'networkidle' });
  assert.ok(!page.url().includes('/admin/login'), 'Authentication unavailable');
  const input = page.getByRole('textbox', { name: '合成納税手続きの支払う予定額（円）', exact: true }).first();
  const save = page.getByRole('button', { name: 'この金額を保存', exact: true }).first();
  await input.waitFor();
  assert.equal(await input.inputValue(), ''); // 正常な未登録は入力可
  const cardId = await input.locator('xpath=ancestor::li').getAttribute('id');
  const dueDate = cardId.slice(-10);
  const rows = [{ procedure_id: 90001, due_date: dueDate, amount: 500000 }];
  await setControl({ rows });
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal((await input.inputValue()).replaceAll(',', ''), '500000');
  for (const mode of ['error', 'throw', 'null']) {
    await setControl({ mode });
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText('税金の支払予定を取得できませんでした', { exact: true }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: /の支払う予定額（円）$/ }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'この金額を保存', exact: true }).count(), 0);
    assert.equal(writes.length, 0);
    await setControl({ mode: 'loaded' });
    await page.getByRole('link', { name: '再読み込み', exact: true }).click();
    await page.waitForLoadState('networkidle');
    await input.waitFor();
    assert.equal((await input.inputValue()).replaceAll(',', ''), '500000');
  }
  await page.screenshot({ path: 'test-results/roadmap-tax-recovered.png', fullPage: true });
  // 既存額の保存payloadと、明示的な0の保存は維持。
  await page.waitForLoadState('networkidle');
  await save.click();
  await page.getByText('保存しました', { exact: true }).waitFor();
  assert.equal(writes.at(-1).amount, 500000);
  await input.fill('0'); await input.blur();
  await save.click();
  await page.getByText('保存しました', { exact: true }).waitFor();
  assert.equal(writes.at(-1).amount, 0);
  // 通信切断/エラー後は再送を止め、再取得で登録値に戻る。
  for (const mode of ['abort', 'error']) {
    saveMode = mode;
    await input.fill('123456'); await input.blur();
    await save.click();
    await page.getByRole('link', { name: '再読み込み', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: /保存中|この金額を保存/ }).count(), 0);
    assert.equal(await page.getByRole('textbox', { name: /の支払う予定額（円）$/ }).count(), 0);
    saveMode = 'success';
    await page.getByRole('link', { name: '再読み込み', exact: true }).click();
    await page.waitForLoadState('networkidle');
    await input.waitFor();
    assert.equal((await input.inputValue()).replaceAll(',', ''), '500000');
  }
  assert.equal(unexpectedWrites, 0);
  assert.equal(existsSync(controlFile + '.mutations'), false);
  assert.equal(writes.length, 4);
  console.log('PASS: loaded amounts preserved; failed/null/throw reads hide tax inputs and saves; reload restores values; valid empty stays editable; explicit zero preserved; ambiguous/error save recovers; all writes synthetic, zero DB writes.');
} finally {
  await browser?.close();
  if (server?.pid) { try { process.kill(-server.pid, 'SIGTERM'); } catch {} }
  await writeFile('test-results/roadmap-tax-load-server.log', logs);
}
