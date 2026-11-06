import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { initial } from '../tests/fixtures/taxExecutionInputs.mjs';
process.loadEnvFile('.env.local');
const origin = 'http://127.0.0.1:3120',
  file = path.resolve('test-results/planning-read-control.json'),
  data = structuredClone(initial);
data.workspace_companies[0].municipality_code = '401315';
data.workspace_companies[0].prefecture_code = '40';
data.municipalities = [{ id: 1, code: '401315', name: 'Synthetic city' }];
data.prefectures = [{ id: 40, code: '40', name: 'Synthetic pref' }];
data.procedures = [
  {
    id: 65,
    code: 'SYNTHETIC_TAX',
    name: '合成予定',
    category: 'tax',
    description: 'synthetic',
    timing_type: 'fixed_date',
    timing_data: { month: 12, day: 31 },
    timing_label: '12/31',
    office_type: 'tax_office',
    is_active: true,
    include_in_diagnosis: true,
    requires_employees: false,
    requires_officer_term: false,
    priority: 1,
    official_links: [],
    procedure_documents: [
      {
        name: '合成必要書類',
        form_number: null,
        is_required: true,
        notes: null,
        item_type: 'document',
        sort_order: 0,
      },
    ],
  },
];
data.rules = [];
data.jurisdictions = [];
data.workspace_procedure_statuses = [];
data.workspace_tax_payment_plans = [
  { procedure_id: 65, due_date: '2026-12-31', amount: 500000 },
];
data.workspace_documents = [
  { document_type: 'articles_of_incorporation', status: 'registered' },
];
data.workspace_documents.forEach((r) => (r.company_id = 23));
data.workspace_tax_payment_plans.forEach((r) => (r.company_id = 23));
data.workspace_required_document_statuses = [
  { document_name: '合成必要書類', status: 'ready' },
];
data.workspace_required_document_statuses.forEach((r) => (r.company_id = 23));
data.procedure_submission_rules = [
  {
    id: 1,
    procedure_id: 65,
    office_category: 'tax_office',
    conditions: [],
    recipient_scope: 'company',
    priority: 1,
    is_active: true,
    notes: null,
  },
];
data.submission_jurisdictions = [
  {
    id: 1,
    office_id: 1,
    office_category: 'tax_office',
    scope_type: 'municipality',
    municipality_scope_id: 1,
    prefecture_scope_id: null,
    is_primary: true,
    priority: 1,
    effective_from: '2020-01-01',
    effective_to: null,
    notes: null,
  },
];
data.submission_offices = [
  {
    id: 1,
    office_category: 'tax_office',
    organization_name: 'Synthetic org',
    name: '合成提出先',
    is_active: true,
    data_version: 1,
    update_frequency: 'annual',
    official_url_status: 'ok',
    last_verified_at: '2026-01-01T00:00:00Z',
    verification_due_at: '2027-01-01T00:00:00Z',
    ...Object.fromEntries(
      'postal_code address phone fax email website_url official_url e_filing_url download_page_url map_url business_hours notes official_url_checked_at fallback_url'
        .split(' ')
        .map((k) => [k, null]),
    ),
  },
];
data.office_sources = [
  {
    id: 1,
    office_id: 1,
    source_type: 'other',
    publisher_name: 'Synthetic',
    source_url: 'https://example.invalid',
    retrieved_at: '2026-01-01T00:00:00Z',
    verification_method: 'official_page_check',
    verified_by: null,
    status: 'active',
    is_current: true,
    notes: null,
  },
];
let page;
let faultChecks = 0;
let server,
  browser,
  logs = '',
  browserWrites = 0;
const update = async (extra = {}) =>
  writeFile(file, JSON.stringify({ data: structuredClone(data), ...extra }));
try {
  await mkdir('test-results', { recursive: true });
  await update();
  server = spawn(
    process.execPath,
    [
      '--import',
      path.resolve('playwright/planning-read-safety-fetch.mjs'),
      'node_modules/next/dist/bin/next',
      'dev',
      '--webpack',
      '--hostname',
      '127.0.0.1',
      '--port',
      '3120',
    ],
    {
      env: { ...process.env, PLANNING_CONTROL_FILE: file },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  server.stdout.on('data', (c) => (logs += c));
  server.stderr.on('data', (c) => (logs += c));
  for (let i = 0; i < 100; i++) {
    assert.equal(server.exitCode, null);
    try {
      if ((await fetch(origin + '/admin/login')).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const auth = JSON.parse(
    readFileSync('playwright/.auth/share-expiry-session.json', 'utf8'),
  );
  await context.addCookies(
    auth.cookies
      .filter((c) => c.name.includes('auth-token'))
      .map(({ name, value }) => ({
        name,
        value,
        url: origin,
        sameSite: 'Lax',
      })),
  );
  await context.addInitScript(() =>
    localStorage.setItem('sunboo:analytics-consent', 'denied'),
  );
  await context.route('**/rest/v1/**', (r) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(r.request().method()))
      browserWrites++;
    return r.abort();
  });
  await context.route(origin + '/**', (r) => {
    const h = r.request().headers();
    return h['next-router-prefetch'] || h.purpose === 'prefetch'
      ? r.abort()
      : r.continue();
  });
  page = await context.newPage();
  page.setDefaultTimeout(12000);
  async function visit(which) {
    await page.goto(origin + `/admin/workspaces/23/${which}`, {
      waitUntil: 'networkidle',
    });
  }
  async function normal(which) {
    assert.equal(
      await page.getByTestId('planning-derived-unavailable').count(),
      0,
    );
    if (which === 'roadmap') {
      await page.getByText('合成予定', { exact: true }).first().waitFor();
      await page.getByText('合成提出先', { exact: true }).first().waitFor();
      assert.ok(await page.getByRole('button', { name: /Excel/ }).count());
    } else {
      assert.equal(
        await page
          .getByRole('combobox', { name: '定款の登録状況', exact: true })
          .inputValue(),
        'registered',
      );
      await page
        .getByRole('combobox', { name: '合成必要書類の準備状況' })
        .waitFor();
    }
  }
  for (const which of ['roadmap', 'documents']) {
    await update();
    await visit(which);
    await normal(which);
    for (const table of [
      'workspace_company_profiles',
      'workspace_tax_return_profiles',
      'rules',
      'procedures',
      'jurisdictions',
      'procedure_submission_rules',
      'submission_jurisdictions',
      'submission_offices',
      'office_sources',
    ].filter(
      (t) =>
        !process.env.PLANNING_FOCUS_TABLE ||
        t === process.env.PLANNING_FOCUS_TABLE,
    ))
      for (const failure of ['error', 'throw', 'null', 'malformed']) {
        if (table === 'workspace_company_profiles' && failure === 'null')
          continue;
        await update({ failTable: table, failure });
        await visit(which);
        const pending = page.getByTestId(
          which === 'roadmap'
            ? 'planning-derived-unavailable'
            : 'required-documents-unavailable',
        );
        await pending.waitFor();
        faultChecks++;
        assert.equal(
          await page
            .getByText('現在のロードマップに未準備の必須書類はありません。', {
              exact: true,
            })
            .count(),
          0,
        );
        if (table !== 'workspace_tax_return_profiles')
          assert.match(
            await page.getByTestId('planning-returns').innerText(),
            /1件/,
          );
        if (table !== 'workspace_company_profiles')
          assert.match(
            await page.getByTestId('planning-profile').innerText(),
            /7人/,
          );
        if (which === 'roadmap') {
          assert.equal(
            await page.getByRole('button', { name: /Excel|PDF/ }).count(),
            0,
          );
          assert.equal(await page.getByRole('combobox').count(), 0);
        } else {
          assert.equal(
            await page
              .getByRole('combobox', { name: '定款の登録状況', exact: true })
              .inputValue(),
            'registered',
          );
          assert.equal(
            await page
              .getByRole('combobox', { name: '合成必要書類の準備状況' })
              .count(),
            0,
          );
        }
      }
    await update();
    const reload = page
      .getByRole('button', { name: '再読み込み', exact: true })
      .first();
    if (await reload.count()) await reload.click();
    else await page.reload({ waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');
    await normal(which);
    await update({ failTable: 'workspace_procedure_statuses' });
    await visit(which);
    if (which === 'roadmap') {
      await page.getByText('合成予定', { exact: true }).first().waitFor();
      assert.equal(await page.getByRole('combobox').count(), 0);
      assert.equal(
        await page.getByRole('button', { name: /Excel|PDF/ }).count(),
        0,
      );
    } else await page.getByTestId('required-documents-unavailable').waitFor();
    const empty = structuredClone(data);
    empty.workspace_company_profiles = [];
    empty.workspace_tax_return_profiles = [];
    empty.workspace_procedure_statuses = [];
    empty.rules = [];
    await update({ data: empty });
    await visit(which);
    assert.match(await page.getByTestId('planning-returns').innerText(), /0件/);
    await normal(which);
  }
  await update({ failTable: 'workspace_tax_payment_plans' });
  await visit('roadmap');
  await page.getByText('合成予定', { exact: true }).first().waitFor();
  assert.equal(
    await page.getByRole('button', { name: /Excel|PDF/ }).count(),
    0,
  );
  assert.equal(
    await page.getByRole('button', { name: 'この金額を保存' }).count(),
    0,
  );
  await update({ failTable: 'workspace_documents' });
  await visit('documents');
  await page.getByTestId('required-documents-readonly').waitFor();
  assert.equal(await page.getByRole('combobox').count(), 0);
  for (const which of ['roadmap', 'documents']) {
    await update({ failTable: 'workspace_companies' });
    await visit(which);
    await page
      .getByRole('alert')
      .filter({ hasText: '会社情報を取得できません' })
      .waitFor();
    assert.equal(await page.getByRole('combobox').count(), 0);
  }
  const noFiscalMonth = structuredClone(data);
  noFiscalMonth.workspace_companies[0].fiscal_month = null;
  await update({ data: noFiscalMonth });
  await visit('documents');
  await page
    .getByText('必要書類の算出を保留しています', { exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByText('現在のロードマップに未準備の必須書類はありません。', {
        exact: true,
      })
      .count(),
    0,
  );
  assert.equal(
    await page
      .getByRole('combobox', { name: '定款の登録状況', exact: true })
      .inputValue(),
    'registered',
  );
  await update({
    data: noFiscalMonth,
    failTable: 'workspace_procedure_statuses',
  });
  await visit('documents');
  await page.getByTestId('required-documents-unavailable').waitFor();
  await update({
    data: noFiscalMonth,
    failTable: 'workspace_tax_payment_plans',
  });
  await visit('roadmap');
  await page
    .getByText('税金の支払予定を取得できませんでした', { exact: true })
    .waitFor();
  assert.equal(browserWrites, 0);
  assert.equal(existsSync(file + '.writes'), false);
  await page.screenshot({
    path: 'test-results/planning-partial-read.png',
    fullPage: true,
  });
  await writeFile(
    'test-results/planning-read-safety.json',
    JSON.stringify(
      {
        syntheticOnly: true,
        requiredSourceFailureCases: faultChecks,
        partialDataRetained: true,
        recovery: true,
        normalMissing: true,
        statusAndTaxSaveGuardsRetained: true,
        productionBusinessWrites: 0,
      },
      null,
      2,
    ),
  );
  console.log(
    'Planning/documents synthetic fault, recovery and normal-empty checks passed; writes 0',
  );
} catch (e) {
  await writeFile('test-results/planning-server.log', logs);
  if (page) {
    await page.screenshot({
      path: 'test-results/planning-failure.png',
      fullPage: true,
    });
    await writeFile(
      'test-results/planning-failure.txt',
      await page.locator('body').innerText(),
    );
  }
  throw e;
} finally {
  await browser?.close();
  if (server)
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {}
}
