import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { initial as inputFixture } from '../tests/fixtures/taxExecutionInputs.mjs';
const syntheticApi = 'https://synthetic-period.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_URL = syntheticApi;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'synthetic-only';
process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = '';
const user = {id:'00000000-0000-4000-8000-000000000001',email:'synthetic@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
const tokenPayload = Buffer.from(JSON.stringify({sub:user.id,email:user.email,role:'authenticated',aud:'authenticated',exp:4102444800,iat:1793822400})).toString('base64url');
const session = {access_token:'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.'+tokenPayload+'.synthetic',refresh_token:'synthetic',expires_in:86400,expires_at:4102444800,token_type:'bearer',user};
const testPort = Number(process.env.TAX_RETURN_TEST_PORT ?? '3117');
assert.ok(Number.isInteger(testPort) && testPort > 1024 && testPort <= 65535);
const origin = 'http://127.0.0.1:' + testPort,
  companyId = 900023,
  file = path.resolve('test-results/tax-return-control.json'),
  key = `sunboo:workspace:${companyId}:pending-tax-return`;
const payload = {
  fiscal_year: '合成実績',
  fiscal_year_start_date: null,
  fiscal_year_end_date: '2025-03-31',
  filed_date: null,
  capital_at_filing: null,
  taxable_sales_amount: {
    precision: 'exact',
    exactValue: 9000000,
    rangeBucketId: null,
  },
  consumption_tax_status: 'taxable',
  taxation_method: 'principle',
  invoice_registration_status: 'registered',
  corporate_tax_amount: {
    precision: 'exact',
    exactValue: 500000,
    rangeBucketId: null,
  },
  consumption_tax_amount: {
    precision: 'range',
    exactValue: null,
    rangeBucketId: '48_400',
  },
  corporate_tax_interim_filing_actual: 'has',
  consumption_tax_interim_frequency_actual: '1',
  financial_statement_published: true,
  withholding_tax_cycle_actual: 'monthly',
  employee_count_at_fiscal_year_end: 7,
};
const row = {
  ...payload,
  id: 90001,
  company_id: companyId,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};
const initial = {
  user,
  companyId,
  rows: [],
  data: {
    workspace_companies: [
      {
        id: companyId,
        name: 'ローカル合成会社',
        corporate_type: 'kabushiki',
        fiscal_month: 3,
        prefecture_code: '13',
        municipality_code: '131130',
      },
    ],
    workspace_company_profiles: [
      {
        ...inputFixture.workspace_company_profiles[0],
        company_id: companyId,
        employee_count: 7,
        consumption_tax_status: 'taxable',
        invoice_registration_status: 'registered',
      },
    ],
    prefectures: [{ name: '合成県' }],
    municipalities: [{ name: '合成市' }],
    workspace_tax_return_profiles: [row],
  },
};
let state = structuredClone(initial),
  mode = 'success',
  clientFailTable = null,
  server,
  browser,
  logs = '',
  writes = 0,
  blocked = 0,
  lastPayload,
  release;
async function update(v = {}) {
  state = { ...state, ...v };
  await writeFile(file, JSON.stringify(state));
}
async function reset(rows = [row]) {
  state = structuredClone(initial);
  state.data.workspace_tax_return_profiles = structuredClone(rows);
  await update();
}
try {
  await mkdir('test-results', { recursive: true });
  let occupied = false;
  try { await fetch(origin + '/admin/login', { signal: AbortSignal.timeout(1000) }); occupied = true; } catch {}
  assert.equal(occupied, false, 'Test port is already in use; refusing to test another server');
  await update();
  assert.equal(existsSync(file + '.mutations'), false);
  server = spawn(
    process.execPath,
    [
      '--import',
      path.resolve('playwright/tax-period-fetch.mjs'),
      'node_modules/next/dist/bin/next',
      'dev',
      '--webpack',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(testPort),
    ],
    {
      env: { ...process.env, TAX_PERIOD_FIXTURE: file },
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
      if (
        (
          await fetch(origin + '/admin/login', {
            signal: AbortSignal.timeout(10000),
          })
        ).ok
      ) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.ok(ready);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.route('**/*', route => {const u=new URL(route.request().url());return [origin,syntheticApi].includes(u.origin)?route.continue():route.abort();});
  await context.addCookies([{name:'sb-synthetic-period-auth-token',value:'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url'),url:origin,sameSite:'Lax'}]);
  await context.addInitScript(() =>
    localStorage.setItem('sunboo:analytics-consent', 'denied'),
  );
  await context.route(origin+'/**', route=>{const h=route.request().headers();if(h['next-router-prefetch']||h.purpose==='prefetch')return route.abort();return route.continue();});
  await context.route('https://synthetic-period.supabase.co/rest/v1/**', async (route) => {
    const req = route.request(),
      u = new URL(req.url()),
      table = u.pathname.split('/').at(-1),
      headers = { 'access-control-allow-origin': origin };
    if (req.method() === 'OPTIONS')
      return route.fulfill({
        status: 204,
        headers: {
          ...headers,
          'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
          'access-control-allow-headers':
            req.headers()['access-control-request-headers'] ?? '*',
        },
      });
    if (req.method() === 'GET') {
      if (clientFailTable === table)
        return route.fulfill({
          status: 400,
          json: { message: 'Synthetic read failure' },
          headers,
        });
      return route.fulfill({ json: state.data[table] ?? [], headers });
    }
    if (
      table !== 'workspace_tax_return_profiles' ||
      !['POST', 'PATCH', 'DELETE'].includes(req.method())
    ) {
      blocked++;
      return route.abort();
    }
    writes++;
    const body = req.method() === 'DELETE' ? null : req.postDataJSON();
    lastPayload = body;
    if (req.method() === 'POST') assert.equal(body.company_id, companyId);
    else {
      assert.equal(u.searchParams.get('company_id'), `eq.${companyId}`);
      assert.ok(u.searchParams.get('updated_at'));
    }
    if (mode === 'error')
      return route.fulfill({
        status: 400,
        json: { code: '23505', message: 'Synthetic conflict' },
        headers,
      });
    if (mode === 'throw') return route.abort('failed');
    if (mode === 'hold')
      await new Promise((r) => {
        release = r;
      });
    const current = state.data.workspace_tax_return_profiles,
      id = Number(u.searchParams.get('id')?.slice(3) ?? 90002);
    const saved =
      req.method() === 'DELETE'
        ? current.find((r) => r.id === id)
        : {
            ...(req.method() === 'PATCH'
              ? current.find((r) => r.id === id)
              : {}),
            ...body,
            id,
            company_id: companyId,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-02-01T00:00:00Z',
          };
    state.data.workspace_tax_return_profiles =
      req.method() === 'DELETE'
        ? current.filter((r) => r.id !== id)
        : [...current.filter((r) => r.id !== id), saved];
    await update();
    if (mode === 'lost') return route.abort('failed');
    return route.fulfill({ json: saved, headers });
  });
  const page = await context.newPage(),
    url = origin + `/admin/workspaces/${companyId}/tax-returns`,
    add = page.getByRole('button', {
      name: '新しい申告実績を追加',
      exact: true,
    }),
    check = page.getByRole('button', { name: '保存結果を確認', exact: true }),
    edit = page.getByRole('button', { name: '編集', exact: true }).first(),
    year = page.getByRole('combobox', { name: '対象年度（決算日の年・必須）', exact: true });
  page.on('dialog', (d) => d.accept());
  await page.goto(url, { waitUntil: 'networkidle' });
  await edit.waitFor();
  assert.equal(
    await page
      .getByText('まだ申告実績が登録されていません。', { exact: true })
      .count(),
    0,
  );
  await edit.click();
  await page.getByRole('combobox', { name: 'この決算の内容を公開しましたか？', exact: true }).waitFor();
  await page.getByText('源泉所得税の納付実績', { exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole('textbox', { name: '確定法人税額の正確な金額', exact: true })
      .inputValue(),
    '500,000',
  );
  for (const table of Object.keys(initial.data))
    for (const failure of [
      'error',
      'throw',
      ...(table === 'workspace_tax_return_profiles'
        ? ['null', 'malformed']
        : []),
    ]) {
      console.log(`checking ${table} ${failure}`);
      await update({ failTable: table, failure });
      await page.reload({ waitUntil: 'networkidle' });
      await page
        .getByRole('alert')
        .filter({
          hasText: '決算実績または会社プロフィールを取得できませんでした',
        })
        .waitFor();
      assert.equal(await add.count(), 0);
      assert.equal(await page.locator('form').count(), 0);
      assert.equal(await edit.count(), 0);
      assert.equal(
        await page
          .getByText('まだ申告実績が登録されていません。', { exact: true })
          .count(),
        0,
      );
      assert.equal(writes, 0);
      await update({ failTable: null });
      await page.getByRole('button', { name: '再読み込み', exact: true }).click();
      await edit.waitFor();
    }
  // 正常な未登録は入力可能。プロフィール正常未登録も失敗とは区別。
  await reset([]);
  state.data.workspace_company_profiles = [];
  await update();
  await page.reload({ waitUntil: 'networkidle' });
  await add.click();
  assert.equal(
    await page.getByText('源泉所得税の納付実績', { exact: true }).count(),
    0,
  );
  assert.ok(await year.isEnabled());
  // プロフィールが正常な別条件でも、既存の非表示項目を消さない。
  await reset();
  state.data.workspace_companies[0].corporate_type = 'godo';
  state.data.workspace_company_profiles[0].employee_count = 0;
  await update();
  await page.reload({ waitUntil: 'networkidle' });
  await edit.click();
  assert.equal(
    await page.getByRole('combobox', { name: 'この決算の内容を公開しましたか？', exact: true }).count(),
    0,
  );
  assert.equal(
    await page.getByText('源泉所得税の納付実績', { exact: true }).count(),
    0,
  );
  await page.getByRole('button', { name: '更新する', exact: true }).click();
  await page.getByText('保存しました。', { exact: true }).waitFor();
  assert.equal(lastPayload.financial_statement_published, true);
  assert.equal(lastPayload.withholding_tax_cycle_actual, 'monthly');
  // 未入力nullと明示的0を保持。確認応答までは成功表示なし、全操作停止。
  await reset([]);
  await page.reload({ waitUntil: 'networkidle' });
  await add.click();
  await year.selectOption('2026');
  await page
    .getByRole('textbox', { name: '決算日', exact: true })
    .fill('20260331');
  await page
    .getByRole('textbox', { name: '確定法人税額の正確な金額', exact: true })
    .fill('0');
  await page.getByRole('combobox', { name: 'この決算の内容を公開しましたか？', exact: true }).selectOption('false');
  mode = 'hold';
  await page.getByRole('button', { name: '追加する', exact: true }).click();
  for (let i = 0; !release && i < 200; i++)
    await new Promise((r) => setTimeout(r, 10));
  assert.ok(release);
  assert.ok(await year.isDisabled());
  assert.equal(
    await page.getByText('保存しました。', { exact: true }).count(),
    0,
  );
  assert.equal(lastPayload.taxable_sales_amount, null);
  assert.equal(lastPayload.consumption_tax_amount, null);
  assert.equal(lastPayload.corporate_tax_amount.exactValue, 0);
  release();
  await page.getByText('保存しました。', { exact: true }).waitFor();
  assert.equal(state.data.workspace_tax_return_profiles.length, 1);
  for (const failure of ['error', 'throw', 'lost']) {
    mode = failure;
    await reset();
    await page.reload({ waitUntil: 'networkidle' });
    await edit.click();
    await year.selectOption('2025');
    const before = writes;
    await page.getByRole('button', { name: '更新する', exact: true }).click();
    await check.waitFor();
    assert.ok(await year.isDisabled());
    assert.equal(
      await page.getByText('保存しました。', { exact: true }).count(),
      0,
    );
    await page.reload({ waitUntil: 'networkidle' });
    assert.ok(await add.isDisabled());
    assert.equal(writes, before + 1);
    await check.waitFor();
    clientFailTable = 'workspace_company_profiles';
    await check.click();
    await page
      .getByRole('alert')
      .filter({ hasText: '再取得できませんでした' })
      .waitFor();
    assert.ok(await add.isDisabled());
    assert.equal(writes, before + 1);
    clientFailTable = null;
    await check.click();
    if (failure === 'lost')
      await page
        .getByText('保存結果を再取得して確認しました。', { exact: true })
        .waitFor();
    else
      await page
        .getByRole('alert')
        .filter({ hasText: '送信内容と異なる登録内容' })
        .waitFor();
    assert.ok(await add.isEnabled());
    assert.equal(writes, before + 1);
    assert.equal(state.data.workspace_tax_return_profiles.length, 1);
  }
  // 新規の応答喪失も再送せず一意キー+全内容で確認。
  await reset([]);
  await page.reload({ waitUntil: 'networkidle' });
  await add.click();
  await year.selectOption('2026');
  await page
    .getByRole('textbox', { name: '決算日', exact: true })
    .fill('20260331');
  await page.getByRole('combobox', { name: 'この決算の内容を公開しましたか？', exact: true }).selectOption('true');
  const before = writes;
  await page.getByRole('button', { name: '追加する', exact: true }).click();
  await check.waitFor();
  await page.reload({ waitUntil: 'networkidle' });
  assert.ok(await add.isDisabled());
  await check.click();
  await page
    .getByText('保存結果を再取得して確認しました。', { exact: true })
    .waitFor();
  assert.equal(writes, before + 1);
  assert.equal(state.data.workspace_tax_return_profiles.length, 1);
  // 削除も楽観表示しない。結果不明は再取得で確認。
  const delBefore = writes;
  await page.getByRole('button', { name: '削除', exact: true }).click();
  await check.waitFor();
  assert.equal(
    await page.getByText('削除しました。', { exact: true }).count(),
    0,
  );
  await page.reload({ waitUntil: 'networkidle' });
  await check.click();
  await page
    .getByText('削除結果を再取得して確認しました。', { exact: true })
    .waitFor();
  assert.equal(writes, delBefore + 1);
  assert.equal(state.data.workspace_tax_return_profiles.length, 0);
  assert.equal(
    await page.evaluate((k) => sessionStorage.getItem(k), key),
    null,
  );
  assert.equal(blocked, 0);
  assert.equal(existsSync(file + '.mutations'), false);
  console.log(
    'PASS tax return read/profile failure, valid empty/null profile, profile visibility and preserved hidden fields, null/zero/range, pending confirmation, save errors/lost responses/new duplicate prevention and delete recovery; zero real DB writes.',
  );
} finally {
  release?.();
  await browser?.close();
  if (server?.pid) {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {}
  }
  await writeFile('test-results/tax-return-server.log', logs);
}
