import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { chromium } from 'playwright-core';
process.loadEnvFile('.env.local');
const origin = 'http://127.0.0.1:3118',
  companyId = 900023,
  file = path.resolve('test-results/home-read-control.json'),
  today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }),
  month = today.slice(0, 7);
const profile = {
  company_id: companyId,
  employee_count: 7,
  capital: 5000000,
  established_date: '2020-04-01',
  stage: 'second_term_or_later',
  consumption_tax_status: 'taxable',
  invoice_registration_status: 'registered',
  taxation_method: 'principle',
  corporate_tax_interim_filing: 'has',
  consumption_tax_interim_frequency: '3',
  withholding_tax_cycle: 'monthly',
  local_tax_collection_method: 'special_collection',
  resident_tax_payment_cycle: 'monthly',
  next_officer_change_date: null,
  address: null,
  e_tax_enabled: true,
  e_ltax_enabled: true,
  advisors: {
    taxAccountant: true,
    laborConsultant: false,
    judicialScrivener: false,
    administrativeScrivener: false,
  },
};
const monthly = {
  year_month: month + '-01',
  target_revenue: 1000000,
  actual_revenue: 0,
  target_gross_profit: 0,
  actual_cost_of_sales: 0,
  target_operating_profit: 0,
  actual_fixed_costs: 0,
  cash_balance: 500000,
  expected_cash_inflows: 0,
  expected_cash_outflows: 0,
  planned_tax_payments: 0,
  action_goal: '合成目標',
  revenue_model: 'sales_funnel',
  meeting_count: 0,
  conversion_rate: 0,
  average_contract_value: 0,
  customer_count: 0,
  purchase_frequency: 0,
  average_order_value: 0,
};
const proc = {
  id: 90001,
  code: 'SYNTHETIC_HOME',
  name: '合成ホーム手続き',
  description: '合成',
  category: 'tax',
  timing_type: 'fixed_date',
  timing_data: { month: 12, day: 31 },
  timing_label: '12月31日',
  office_type: 'tax_office',
  is_active: true,
  include_in_diagnosis: true,
  requires_employees: false,
  requires_officer_term: false,
  priority: 1,
  official_links: [],
  procedure_documents: [],
};
const initial = {
  companyId,
  rows: [],
  data: {
    workspace_companies: [
      {
        id: companyId,
        name: 'ローカル合成会社ホーム',
        corporate_type: 'kabushiki',
        fiscal_month: 3,
        prefecture_code: '13',
        municipality_code: '131130',
      },
    ],
    workspace_company_profiles: [profile],
    prefectures: [{ id: 13, code: '13', name: '合成県' }],
    municipalities: [{ id: 1, code: '131130', name: '合成市' }],
    workspace_tax_return_profiles: [],
    workspace_procedure_statuses: [],
    workspace_documents: [
      { document_type: 'articles_of_incorporation', status: 'needs_update' },
    ],
    workspace_required_document_statuses: [],
    workspace_daily_sales_activities: [
      {
        activity_date: today,
        target_units: 10,
        actual_units: 0,
        action_plan: '既知の日次行動',
        outcome_review: null,
      },
    ],
    workspace_monthly_sales: [monthly],
    workspace_tax_payment_plans: [
      { procedure_id: 90001, due_date: month + '-20', amount: 500000 },
    ],
    workspace_tax_review_cases: [],
    tax_controls: [],
    workspace_tax_control_results: [],
    workspace_members: [{ role: 'member' }],
    procedures: [proc],
    rules: [],
    jurisdictions: [],
    procedure_submission_rules: [],
    submission_jurisdictions: [],
    submission_offices: [],
    office_sources: [],
  },
};
let state = structuredClone(initial),
  server,
  browser,
  logs = '',
  writes = 0;
async function update(v = {}) {
  state = { ...state, ...v };
  await writeFile(file, JSON.stringify(state));
}
try {
  await mkdir('test-results', { recursive: true });
  await update();
  assert.equal(existsSync(file + '.mutations'), false);
  server = spawn(
    process.execPath,
    [
      '--import',
      path.resolve('playwright/home-read-safety-fetch.mjs'),
      'node_modules/next/dist/bin/next',
      'dev',
      '--webpack',
      '--hostname',
      '127.0.0.1',
      '--port',
      '3118',
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
  await context.route(origin + '/**', (route) => {
    const h = route.request().headers();
    if (h['next-router-prefetch'] || h.purpose === 'prefetch')
      return route.abort();
    return route.continue();
  });
  await context.route('**/rest/v1/**', (route) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) {
      writes++;
      return route.abort();
    }
    return route.fulfill({
      json: [],
      headers: { 'access-control-allow-origin': origin },
    });
  });
  const page = await context.newPage(),
    home = origin + `/admin/workspaces/${companyId}`,
    unavailable = page.getByTestId('home-derived-unavailable');
  async function normal() {
    assert.equal(await unavailable.count(), 0);
    await page.getByText('今日のポイント', { exact: true }).waitFor();
    assert.match(await page.getByTestId('home-documents').innerText(), /1件/);
    assert.match(
      await page.getByTestId('home-tax-plans').innerText(),
      /500,000/,
    );
    assert.match(await page.getByTestId('home-profile').innerText(), /7人/);
  }
  await page.goto(home, { waitUntil: 'networkidle' });
  await normal();
  const sources = {
    workspace_company_profiles: 'home-profile',
    workspace_tax_return_profiles: 'home-returns',
    workspace_procedure_statuses: 'home-statuses',
    workspace_documents: 'home-documents',
    workspace_monthly_sales: 'home-monthly',
    workspace_tax_payment_plans: 'home-tax-plans',
  };
  for (const [table, id] of Object.entries(sources))
    for (const failure of [
      'error',
      'throw',
      ...([
        'workspace_tax_return_profiles',
        'workspace_procedure_statuses',
        'workspace_documents',
        'workspace_tax_payment_plans',
      ].includes(table)
        ? ['null']
        : []),
    ]) {
      console.log('checking ' + table + ' ' + failure);
      await update({ failTable: table, failure });
      await page.reload({ waitUntil: 'networkidle' });
      await unavailable.waitFor();
      assert.match(await page.getByTestId(id).innerText(), /取得できません/);
      assert.equal(
        await page.getByText('今日のポイント', { exact: true }).count(),
        0,
      );
      assert.equal(
        await page
          .getByText('しばらく期限はありません', { exact: true })
          .count(),
        0,
      );
      const healthy =
        id === 'home-documents' ? 'home-profile' : 'home-documents';
      assert.doesNotMatch(
        await page.getByTestId(healthy).innerText(),
        /取得できません/,
      );
      if (table === 'workspace_documents' && failure === 'error')
        await page.screenshot({
          path: 'test-results/home-partial-failure.png',
          fullPage: true,
        });
      await update({ failTable: null });
      await page
        .getByRole('button', { name: '再読み込み', exact: true })
        .click();
      await normal();
    }
  // Nested engine queries must not silently turn into no rules/no procedures.
  for (const table of ['rules', 'procedures', 'jurisdictions'])
    for (const failure of ['error', 'throw', 'null', 'malformed']) {
      console.log('checking nested ' + table + ' ' + failure);
      await update({ failTable: table, failure });
      await page.reload({ waitUntil: 'networkidle' });
      await unavailable.waitFor();
      assert.match(
        await page.getByTestId('home-monthly').innerText(),
        /1,000,000/,
      );
      assert.equal(
        await page.getByText('今日のポイント', { exact: true }).count(),
        0,
      );
      await update({ failTable: null });
      await page
        .getByRole('button', { name: '再読み込み', exact: true })
        .click();
      await normal();
    }
  // A missing independent source also defers overall priority; healthy raw blocks stay visible.
  await update({
    failTable: 'workspace_daily_sales_activities',
    failure: 'error',
  });
  await page.reload({ waitUntil: 'networkidle' });
  await unavailable.waitFor();
  assert.match(await page.getByTestId('home-monthly').innerText(), /1,000,000/);
  assert.match(await page.locator('body').innerText(), /取得できません/);
  await update({ failTable: null });
  // Independent review branches keep a known evaluation count when cases cannot be loaded.
  await update({ failTable: 'workspace_tax_review_cases', failure: 'null' });
  await page.reload({ waitUntil: 'networkidle' });
  assert.match(
    await page.getByTestId('tax-summary-open').innerText(),
    /取得できません/,
  );
  assert.match(
    await page.getByTestId('tax-summary-evaluation').innerText(),
    /有効な税務チェックはありません/,
  );
  await unavailable.waitFor();
  await update({ failTable: null });
  // Normal empty and zero are successful observations, not unavailable.
  state = structuredClone(initial);
  state.data.workspace_company_profiles = [];
  state.data.workspace_documents = [];
  state.data.workspace_monthly_sales = [];
  state.data.workspace_tax_payment_plans = [];
  await update();
  await page.reload({ waitUntil: 'networkidle' });
  assert.match(await page.getByTestId('home-profile').innerText(), /未登録/);
  assert.match(await page.getByTestId('home-documents').innerText(), /0件/);
  assert.match(await page.getByTestId('home-monthly').innerText(), /未登録/);
  assert.match(await page.getByTestId('home-tax-plans').innerText(), /¥0/);
  assert.equal(await unavailable.count(), 0);
  // Existing roadmap/documents and the separate public RPC consumer keep their normal contracts.
  state = structuredClone(initial);
  await update();
  await page.goto(home + '/roadmap', { waitUntil: 'networkidle' });
  await page
    .getByRole('heading', { name: '年間ロードマップ', exact: true })
    .waitFor();
  assert.ok(
    (await page
      .getByRole('combobox', {
        name: '合成ホーム手続きのステータス',
        exact: true,
      })
      .count()) > 0,
  );
  await page.goto(home + '/documents', { waitUntil: 'networkidle' });
  assert.equal(
    await page
      .getByRole('alert')
      .filter({ hasText: '取得できませんでした' })
      .count(),
    0,
  );
  assert.ok((await page.getByRole('combobox').count()) > 0);
  await page.goto(origin + '/share/' + 'b'.repeat(64), {
    waitUntil: 'networkidle',
  });
  await page
    .getByRole('heading', { name: 'ローカル合成会社ホーム', exact: true })
    .waitFor();
  assert.ok(
    (await page.getByText('合成ホーム手続き', { exact: true }).count()) > 0,
  );
  await update({ failTable: 'workspace_company_profiles', failure: 'error' });
  await page.reload({ waitUntil: 'networkidle' });
  await page
    .getByRole('heading', { name: 'ローカル合成会社ホーム', exact: true })
    .waitFor();
  assert.ok(
    (await page.getByText('合成ホーム手続き', { exact: true }).count()) > 0,
  );
  assert.equal(writes, 0);
  assert.equal(existsSync(file + '.mutations'), false);
  console.log(
    'PASS: independent source failures and nested engine failures do not become zero/no action; known sections preserved; retries, normal missing/zero, independent review and legacy roadmap/documents/share normal contracts; zero real DB writes.',
  );
} finally {
  await browser?.close();
  if (server?.pid) {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {}
  }
  await writeFile('test-results/home-read-server.log', logs);
}
