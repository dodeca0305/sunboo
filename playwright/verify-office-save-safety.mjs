import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { chromium } from 'playwright-core';
process.loadEnvFile('.env.local');
const origin = 'http://127.0.0.1:3116',
  id = 900001,
  file = path.resolve('test-results/office-save-control.json');
const fields =
  'postal_code address phone fax email website_url official_url fallback_url e_filing_url download_page_url map_url business_hours notes'.split(
    ' ',
  );
const initial = {
  companyId: 900023,
  rows: [],
  municipalities: [
    { id: 1, code: '001', name: '合成市', prefectures: { name: '合成県' } },
  ],
  organization_types: [{ id: 1, code: 'test', name: '合成種別' }],
  organization_offices: [
    {
      id,
      organization_id: 1,
      name: '合成窓口',
      official_url_status: 'unchecked',
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
      ...Object.fromEntries(fields.map((k) => [k, null])),
      organizations: { id: 1, organization_type_id: 1, name: '合成組織' },
    },
  ],
  jurisdictions: [
    {
      id: 1,
      municipality_id: 1,
      organization_type_id: 1,
      organization_office_id: id,
    },
  ],
};
let state = structuredClone(initial),
  mode = 'success',
  server,
  browser,
  logs = '',
  calls = 0,
  blocked = 0;
async function update(v = {}) {
  state = { ...state, ...v };
  await writeFile(file, JSON.stringify(state));
}
function rowsFor(u) {
  const t = u.pathname.split('/').at(-1);
  let rows = state[t] ?? [];
  for (const key of ['id', 'organization_office_id', 'name']) {
    const f = u.searchParams.get(key);
    if (f) rows = rows.filter((r) => String(r[key]) === f.slice(3));
  }
  return rows;
}
try {
  await mkdir('test-results', { recursive: true });
  await update();
  assert.equal(existsSync(file + '.mutations'), false);
  server = spawn(
    process.execPath,
    [
      '--import',
      path.resolve('playwright/office-save-safety-fetch.mjs'),
      'node_modules/next/dist/bin/next',
      'dev',
      '--webpack',
      '--hostname',
      '127.0.0.1',
      '--port',
      '3116',
    ],
    {
      env: { ...process.env, ROADMAP_TAX_CONTROL_FILE: file },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  server.stdout.on('data', (c) => (logs += c));
  server.stderr.on('data', (c) => (logs += c));
  let ready = false;
  for (let i = 0; i < 100; i++) {
    assert.equal(server.exitCode, null);
    try {
      if ((await fetch(origin + '/admin/login')).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.ok(ready);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(),
    auth = JSON.parse(
      readFileSync('playwright/.auth/share-expiry-session.json', 'utf8'),
    );
  await context.addCookies(
    auth.cookies.map(({ name, value }) => ({
      name,
      value,
      url: origin,
      sameSite: 'Lax',
    })),
  );
  await context.addInitScript(() =>
    localStorage.setItem('sunboo:analytics-consent', 'denied'),
  );
  await context.route('**/rest/v1/**', async (route) => {
    const req = route.request(),
      u = new URL(req.url()),
      headers = { 'access-control-allow-origin': origin };
    if (req.method() === 'OPTIONS')
      return route.fulfill({
        status: 204,
        headers: {
          ...headers,
          'access-control-allow-methods': 'POST, GET, OPTIONS',
          'access-control-allow-headers':
            req.headers()['access-control-request-headers'] ?? '*',
        },
      });
    if (req.method() === 'GET') {
      if (state.failTable === u.pathname.split('/').at(-1))
        return route.fulfill({
          status: 400,
          json: { message: 'synthetic error' },
          headers,
        });
      return route.fulfill({ json: rowsFor(u), headers });
    }
    if (
      req.method() !== 'POST' ||
      !u.pathname.endsWith('/rpc/save_admin_office')
    ) {
      blocked++;
      return route.abort();
    }
    calls++;
    const b = req.postDataJSON();
    assert.ok(b.p_office_id === id || b.p_office_id === null);
    if (mode === 'error')
      return route.fulfill({
        status: 400,
        json: { message: 'synthetic failure' },
        headers,
      });
    if (mode === 'throw') return route.abort('failed');
    const target = b.p_office_id ?? 900002,
      office = {
        ...state.organization_offices[0],
        ...b.p_values,
        id: target,
        organization_id: 1,
        updated_at: '2026-02-01',
        organizations: {
          id: 1,
          name: b.p_values.organization_name,
          organization_type_id: b.p_values.organization_type_id,
        },
      };
    delete office.organization_name;
    delete office.organization_type_id;
    const jurisdictions = b.p_municipality_ids.map((m, i) => ({
      id: i + 10,
      municipality_id: m,
      organization_type_id: b.p_values.organization_type_id,
      organization_office_id: target,
    }));
    await update({
      organization_offices: [
        ...state.organization_offices.filter((o) => o.id !== target),
        office,
      ],
      jurisdictions: [
        ...state.jurisdictions.filter(
          (j) => j.organization_office_id !== target,
        ),
        ...jurisdictions,
      ],
    });
    if (mode === 'lost') return route.abort('failed');
    const { organizations, ...saved } = office;
    return route.fulfill({
      json: {
        id: target,
        snapshot: { office: saved, organization: organizations, jurisdictions },
      },
      headers,
    });
  });
  const page = await context.newPage(),
    edit = origin + `/admin/offices/${id}`,
    name = page.getByPlaceholder('例：福岡法務局北九州支局', { exact: true }),
    save = page.getByRole('button', { name: '更新する', exact: true }),
    check = page.getByRole('button', { name: '保存結果を確認', exact: true });
  await page.goto(edit, { waitUntil: 'networkidle' });
  await name.waitFor();
  assert.equal(await name.inputValue(), '合成窓口');
  for (const table of [
    'organization_offices',
    'jurisdictions',
    'municipalities',
    'organization_types',
  ])
    for (const failure of [
      'error',
      'throw',
      ...(table === 'organization_offices'
        ? ['malformed']
        : ['null', 'malformed']),
    ]) {
      await update({ failTable: table, failure });
      await page.reload({ waitUntil: 'networkidle' });
      await page
        .getByRole('alert')
        .filter({ hasText: '窓口情報・管轄地域・選択肢を取得できませんでした' })
        .waitFor();
      assert.equal(await page.locator('form').count(), 0);
      assert.equal(calls, 0);
      await update({ failTable: null });
      await page.getByRole('link', { name: '再読み込み', exact: true }).click();
      await name.waitFor();
      assert.equal(await name.inputValue(), '合成窓口');
    }
  await update({ jurisdictions: [] });
  await page.reload({ waitUntil: 'networkidle' });
  assert.ok(await save.isEnabled());
  assert.equal(await page.locator('input[type=checkbox]:checked').count(), 0);
  await name.fill('合成変更');
  await save.click();
  await page.waitForURL(origin + '/admin/offices');
  assert.equal(calls, 1);
  for (const failure of ['error', 'throw', 'lost']) {
    state = structuredClone(initial);
    await update();
    mode = failure;
    await page.goto(edit, { waitUntil: 'networkidle' });
    await name.fill('合成変更');
    const before = calls;
    await save.click();
    await check.waitFor();
    assert.ok(await save.isDisabled());
    await page.reload({ waitUntil: 'networkidle' });
    await check.waitFor();
    assert.ok(await save.isDisabled());
    assert.equal(calls, before + 1);
    await update({ failTable: 'jurisdictions' });
    await check.click();
    await page
      .getByRole('alert')
      .filter({ hasText: '保存結果を取得できませんでした' })
      .waitFor();
    assert.ok(await save.isDisabled());
    assert.equal(calls, before + 1);
    await update({ failTable: null });
    await check.click();
    if (failure === 'lost') await page.waitForURL(origin + '/admin/offices');
    else {
      await page.waitForFunction(() =>
        [...document.querySelectorAll('button')].some(
          (b) =>
            b.textContent === '更新する' &&
            !b.disabled &&
            !b.closest('fieldset')?.disabled,
        ),
      );
      await page.waitForLoadState('networkidle');
      assert.equal(await name.inputValue(), '合成窓口');
      assert.ok(await save.isEnabled());
    }
    assert.equal(calls, before + 1);
  }
  state = structuredClone(initial);
  await update();
  await page.goto(origin + '/admin/offices/new', { waitUntil: 'networkidle' });
  await name.fill('合成新規');
  await page
    .getByPlaceholder('例：福岡法務局', { exact: true })
    .fill('合成組織');
  const before = calls;
  await page.getByRole('button', { name: '追加する', exact: true }).click();
  await check.waitFor();
  await page.reload({ waitUntil: 'networkidle' });
  await check.click();
  await page.waitForURL(origin + '/admin/offices');
  assert.equal(calls, before + 1);
  assert.equal(
    state.organization_offices.filter((o) => o.name === '合成新規').length,
    1,
  );
  await update({ failTable: 'municipalities', failure: 'error' });
  await page.goto(origin + '/admin/offices/new', { waitUntil: 'networkidle' });
  assert.equal(await page.locator('form').count(), 0);
  assert.equal(blocked, 0);
  assert.equal(existsSync(file + '.mutations'), false);
  console.log(
    'PASS office read failures, valid empty, RPC save, errors/exceptions/lost responses, reload lock and readback recovery including new creation; no real DB writes.',
  );
} finally {
  await browser?.close();
  if (server?.pid) {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {}
  }
  await writeFile('test-results/office-save-server.log', logs);
}
