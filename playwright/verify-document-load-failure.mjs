import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { chromium } from 'playwright-core';

process.loadEnvFile('.env.local');
const companyId = 900023;
const origin = 'http://127.0.0.1:3113';
const controlFile = path.resolve('test-results/document-load-control.json');
let control = {
  companyId, rows: [],
  workspace_documents: [{ document_type: 'articles_of_incorporation', status: 'registered' }, { document_type: 'corporate_tax_return', status: 'needs_update' }],
  workspace_required_document_statuses: [{ document_name: '合成必要書類', status: 'ready' }],
};
const update = async values => { control = { ...control, ...values }; await writeFile(controlFile, JSON.stringify(control)); };
let server;
let browser;
let logs = '';
const writes = [];
let unexpectedWrites = 0;
let saveMode = 'success';
let releaseSave;
try {
  await mkdir('test-results', { recursive: true });
  assert.equal(existsSync(controlFile + '.mutations'), false);
  await update({});
  server = spawn(process.execPath, ['--import', path.resolve('playwright/document-load-failure-fetch.mjs'), 'node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3113'], { env: { ...process.env, ROADMAP_TAX_CONTROL_FILE: controlFile }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', chunk => { logs += chunk; });
  server.stderr.on('data', chunk => { logs += chunk; });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    assert.equal(server.exitCode, null, 'Test server exited');
    try { if ((await fetch(origin + '/admin/login', { signal: AbortSignal.timeout(10000) })).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, 'Local test server did not start');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const auth = JSON.parse(readFileSync('playwright/.auth/share-expiry-session.json', 'utf8'));
  await context.addCookies(auth.cookies.map(({ name, value }) => ({ name, value, url: origin, sameSite: 'Lax' })));
  await context.addInitScript(() => localStorage.setItem('sunboo:analytics-consent', 'denied'));
  await context.route('**/rest/v1/**', async route => {
    const req = route.request();
    const headers = { 'access-control-allow-origin': origin };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...headers, 'access-control-allow-methods': 'POST, GET, HEAD, OPTIONS', 'access-control-allow-headers': req.headers()['access-control-request-headers'] ?? '*', 'access-control-max-age': '0' } });
    if (['GET', 'HEAD'].includes(req.method())) return route.fulfill({ json: [] });
    const table = new URL(req.url()).pathname.split('/').at(-1);
    if (req.method() !== 'POST' || !['workspace_documents', 'workspace_required_document_statuses'].includes(table)) { unexpectedWrites++; return route.abort(); }
    const payload = req.postDataJSON();
    assert.equal(payload.company_id, companyId);
    writes.push({ table, payload });
    if (saveMode === 'abort') return route.abort('failed');
    if (saveMode === 'error') return route.fulfill({ status: 400, json: { message: 'Synthetic save error' }, headers });
    if (saveMode === 'pending') await new Promise(resolve => { releaseSave = resolve; });
    return route.fulfill({ status: 201, body: '', headers });
  });
  const page = await context.newPage();
  await page.goto(origin + `/admin/workspaces/${companyId}/documents`, { waitUntil: 'networkidle' });
  assert.ok(!page.url().includes('/admin/login'), 'Authentication unavailable');
  const articles = page.getByRole('combobox', { name: '定款の登録状況', exact: true });
  const taxReturn = page.getByRole('combobox', { name: '法人税申告書の登録状況', exact: true });
  const required = page.getByRole('combobox', { name: '合成必要書類の準備状況', exact: true });
  async function assertExisting() {
    await articles.waitFor();
    assert.equal(await articles.inputValue(), 'registered');
    assert.equal(await taxReturn.inputValue(), 'needs_update');
    assert.equal(await required.inputValue(), 'ready');
    assert.ok(await page.getByText(/1\/5件登録済み/).count() > 0);
  }
  await assertExisting();
  for (const table of ['workspace_documents', 'workspace_required_document_statuses']) {
    for (const failure of ['error', 'throw', 'null']) {
      await update({ failTable: table, failure });
      await page.reload({ waitUntil: 'networkidle' });
      await page.getByRole('alert').filter({ hasText: /書類の登録状況を取得|書類の保存結果/ }).waitFor();
      assert.equal(await page.getByRole('combobox').count(), 0);
      assert.equal(await page.getByText(/0\/5件登録済み/).count(), 0);
      assert.equal(await page.getByText('現在のロードマップに未準備の必須書類はありません。', { exact: true }).count(), 0);
      assert.equal(writes.length, 0);
      if (table === 'workspace_documents' && failure === 'error') await page.screenshot({ path: 'test-results/document-load-failure.png', fullPage: true });
      await update({ failTable: null });
      await page.getByRole('link', { name: '再読み込み', exact: true }).click();
      await assertExisting();
    }
  }
  await page.screenshot({ path: 'test-results/document-load-recovered.png', fullPage: true });
  // 保存中は両方の操作を止め、保存成功後だけ表示を更新。
  saveMode = 'pending';
  await articles.selectOption('needs_update');
  await page.getByRole('status', { name: '' }).filter({ hasText: '保存中' }).waitFor();
  assert.ok(await articles.isDisabled()); assert.ok(await required.isDisabled());
  assert.equal(await articles.inputValue(), 'registered');
  for (let i = 0; !releaseSave && i < 200; i++) await new Promise(r => setTimeout(r, 10));
  assert.ok(releaseSave, 'Synthetic save did not reach the interceptor');
  releaseSave();
  await page.waitForFunction(() => !document.querySelector('select[aria-label="定款の登録状況"]').disabled);
  assert.equal(await articles.inputValue(), 'needs_update');
  assert.deepEqual(writes.at(-1), { table: 'workspace_documents', payload: { company_id: companyId, document_type: 'articles_of_incorporation', status: 'needs_update' } });
  saveMode = 'success';
  await required.selectOption('in_progress');
  await page.waitForFunction(() => document.querySelector('select[aria-label="合成必要書類の準備状況"]').value === 'in_progress');
  assert.deepEqual(writes.at(-1), { table: 'workspace_required_document_statuses', payload: { company_id: companyId, document_name: '合成必要書類', status: 'in_progress' } });
  // 2つの保存先ともerror/通信切断の後は再送を止め、登録状態の再取得で復帰。
  for (const target of [articles, required]) {
    for (const mode of ['error', 'abort']) {
      await page.reload({ waitUntil: 'networkidle' });
      await assertExisting();
      saveMode = mode;
      await target.selectOption(target === articles ? 'not_registered' : 'not_ready');
      await page.getByRole('alert').filter({ hasText: /書類の登録状況を取得|書類の保存結果/ }).waitFor();
      assert.ok(await articles.isDisabled()); assert.ok(await required.isDisabled());
      assert.equal(await page.getByText('保存中…', { exact: true }).count(), 0);
      assert.equal(await articles.inputValue(), 'registered'); assert.equal(await required.inputValue(), 'ready');
      saveMode = 'success';
      await page.getByRole('link', { name: '再読み込み', exact: true }).click();
      await assertExisting();
      assert.ok(await articles.isEnabled()); assert.ok(await required.isEnabled());
    }
  }
  await update({ workspace_documents: [], workspace_required_document_statuses: [] });
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await articles.inputValue(), 'not_registered');
  assert.equal(await required.inputValue(), 'not_ready');
  assert.ok(await articles.isEnabled()); assert.ok(await required.isEnabled());
  assert.ok(await page.getByText(/0\/5件登録済み/).count() > 0);
  assert.equal(writes.length, 6); assert.equal(unexpectedWrites, 0);
  assert.equal(existsSync(controlFile + '.mutations'), false);
  console.log('PASS: both read sources error/throw/null block all editing and false zero counts; reload restores registered/ready; empty success remains editable; pending writes lock controls; confirmed payloads preserved; save errors/unknown results stop retry and reload recovers; zero real DB writes.');
} finally {
  releaseSave?.();
  await browser?.close();
  if (server?.pid) { try { process.kill(-server.pid, 'SIGTERM'); } catch {} }
  await writeFile('test-results/document-load-server.log', logs);
}
