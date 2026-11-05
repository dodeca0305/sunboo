import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { chromium } from 'playwright-core';
const syntheticApi='https://synthetic-home.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_URL=syntheticApi;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='synthetic-only';
process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID='';
const user={id:'00000000-0000-4000-8000-000000000001',email:'synthetic@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
const jwt=Buffer.from(JSON.stringify({sub:user.id,email:user.email,role:'authenticated',aud:'authenticated',exp:4102444800,iat:1793822400})).toString('base64url');
const session={access_token:'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.'+jwt+'.synthetic',refresh_token:'synthetic',expires_in:86400,expires_at:4102444800,token_type:'bearer',user};
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
  cash_balance: 100000,
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
  code: 'WITHHOLDING_TAX',
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
  user,
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
      { procedure_id: 90001, due_date: month + '-20', amount: 500000, procedures: {code:'WITHHOLDING_TAX'} },
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
  activePage,
  logs = '',
  writes = 0;
const pageErrors=[];
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
  const context = await browser.newContext({viewport:{width:1280,height:900}});
  await context.addCookies([{name:'sb-synthetic-home-auth-token',value:'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url'),url:origin,sameSite:'Lax'}]);
  await context.route('**/*', route=>[origin,syntheticApi].includes(new URL(route.request().url()).origin)?route.continue():route.abort());
  await context.route(syntheticApi+'/auth/v1/user',route=>route.fulfill({json:user,headers:{'access-control-allow-origin':origin}}));
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
  activePage = page;
  page.on('pageerror',error=>pageErrors.push(error.message));
  async function normal() {
    assert.equal(await unavailable.count(), 0);
    await page.getByText('今日のポイント', { exact: true }).waitFor();
    assert.match(await page.getByTestId('home-documents').textContent(), /1件/);
    assert.match(
      await page.getByTestId('home-tax-plans').textContent(),
      /500,000/,
    );
    assert.match(await page.getByTestId('home-profile').textContent(), /7人/);
  }
  await page.goto(home, { waitUntil: 'networkidle' });
  await normal();
  // Home/nav layout uses the same guarded sources; no writes while navigating.
  const companyNav=()=>page.getByRole('navigation',{name:'この会社のメニュー',exact:true});
  assert.equal(await companyNav().count(),1);
  const links=[['ホーム',''],['会社プロフィール','/profile'],['過去の決算・申告情報','/tax-returns'],['売上目標','/growth'],['年間ロードマップ','/roadmap'],['書類','/documents'],['税金の確認結果','/tax-review'],['共有','/share']];
  for(const [label,suffix] of links) assert.equal(await companyNav().getByRole('link',{name:label,exact:true}).getAttribute('href'),`/admin/workspaces/${companyId}${suffix}`);
  const todayCard=page.getByTestId('home-today');
  assert.equal(await page.getByTestId('home-source-details').getAttribute('open'),null);
  assert.equal(await page.getByTestId('home-progress-details').getAttribute('open'),null);
  assert.equal(await todayCard.getByRole('heading',{name:'今日やること',exact:true}).isVisible(),true);
  await todayCard.getByText('先に確認したい対応候補です。期限を確認し、自社に必要なものから進めてください。',{exact:true}).waitFor();
  const growthLink=todayCard.getByRole('link',{name:'今月の売上・お金を確認する',exact:true});
  assert.equal(await growthLink.getAttribute('href'),`/admin/workspaces/${companyId}/growth?date=${month}-01`);
  assert.ok((await todayCard.textContent()).includes('担当：未設定'));
  const todayBox=await todayCard.boundingBox();assert.ok(todayBox.y<450);
  assert.ok(await page.getByTestId('home-notification-details').getAttribute('open')!==null,'high-priority notices stay expanded');
  const administration=page.locator('aside:visible').getByText('管理メニュー',{exact:true});
  await administration.click();assert.equal(await page.getByRole('navigation',{name:'管理メニュー',exact:true}).getByRole('link',{name:'管轄機関',exact:true}).getAttribute('href'),'/admin/offices');await administration.click();
  const duplicateLinks=await page.locator('main').getByRole('link',{name:'会社プロフィール',exact:true}).count();assert.equal(duplicateLinks,0);
  await page.screenshot({path:'test-results/home-sidebar-desktop.png',fullPage:false});
  await page.getByTestId('home-source-details').locator('summary').first().click();await page.getByTestId('home-monthly').waitFor({state:'visible'});
  await page.getByTestId('home-source-details').locator('summary').first().click();
  for(const [label,suffix] of links.filter(([,suffix])=>suffix)) {
    await companyNav().getByRole('link',{name:label,exact:true}).click();await page.waitForURL(home+suffix);await page.waitForLoadState('networkidle');
    assert.equal(await companyNav().getByRole('link',{name:label,exact:true}).getAttribute('aria-current'),'page');
    assert.equal(await page.locator('main').getByRole('navigation',{name:'この会社のメニュー',exact:true}).count(),0);
  }
  await page.goto(origin+'/admin/offices',{waitUntil:'networkidle'});
  assert.equal(await companyNav().count(),0);
  assert.equal(await page.getByRole('navigation',{name:'管理メニュー',exact:true}).getByRole('link',{name:'管轄機関',exact:true}).getAttribute('aria-current'),'page');
  // A failed tax-result read cannot claim zero items in the page subtitle.
  await update({failTable:'workspace_tax_review_cases',failure:'error'});
  await page.goto(home+'/tax-review',{waitUntil:'networkidle'});
  await page.getByRole('heading',{name:'税金の確認結果',exact:true}).waitFor();
  await page.getByText(`${initial.data.workspace_companies[0].name}の確認結果を取得できません`,{exact:true}).waitFor();
  await page.getByText('確認結果を取得できませんでした。項目が0件かどうかはまだ分かりません。',{exact:true}).waitFor();
  assert.equal(await page.getByText(`${initial.data.workspace_companies[0].name}のまだ確認が終わっていない項目：0件`,{exact:true}).count(),0);
  await update({failTable:null});await page.getByRole('button',{name:'再読み込み',exact:true}).click();
  await page.getByText(`${initial.data.workspace_companies[0].name}のまだ確認が終わっていない項目：0件`,{exact:true}).waitFor();
  await page.getByText('登録情報をもとに、税金について確認したい項目を表示します。',{exact:false}).waitFor();
  await page.getByText('確認する項目はまだ登録されていません',{exact:true}).waitFor();
  assert.doesNotMatch(await page.locator('main').textContent(),/Tax Intelligence|ReviewCase/);
  // A different company URL must never keep links to the previously selected company.
  await page.goto(origin+'/admin/workspaces/900024/tax-returns',{waitUntil:'networkidle'});
  for(const [,suffix] of links) assert.ok(await companyNav().locator(`a[href="/admin/workspaces/900024${suffix}"]`).count());
  assert.equal(await companyNav().locator('a[href^="/admin/workspaces/900023"]').count(),0);
  await page.goto(home,{waitUntil:'networkidle'});await normal();
  await page.setViewportSize({width:375,height:812});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.equal(await companyNav().count(),0);
  const menu=page.getByRole('button',{name:'メニューを開く',exact:true});await menu.click();
  const drawer=page.getByRole('dialog',{name:'ナビゲーションメニュー',exact:true});await drawer.waitFor();
  assert.equal(await companyNav().count(),1);
  await page.screenshot({path:'test-results/home-sidebar-mobile-menu.png',fullPage:false});
  await page.keyboard.press('Shift+Tab');assert.equal(await drawer.getByRole('button',{name:'ログアウト',exact:true}).evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Tab');assert.equal(await drawer.getByRole('button',{name:'メニューを閉じる',exact:true}).evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Escape');assert.equal(await drawer.count(),0);assert.equal(await menu.evaluate(el=>el===document.activeElement),true);
  await menu.click();await companyNav().getByRole('link',{name:'書類',exact:true}).click();await page.waitForURL(home+'/documents');assert.equal(await drawer.count(),0);
  await menu.click();await companyNav().getByRole('link',{name:'ホーム',exact:true}).click();await page.waitForURL(home);await normal();
  await page.screenshot({path:'test-results/home-sidebar-mobile.png',fullPage:false});
  // An error on mobile remains visible without needing the menu or a disclosure.
  await update({failTable:'workspace_company_profiles',failure:'error'});await page.reload({waitUntil:'networkidle'});await unavailable.waitFor();
  assert.equal(await page.getByTestId('home-source-details').getAttribute('open'),'');
  await page.getByRole('alert').filter({hasText:'一部の情報を取得できません'}).waitFor();
  await update({failTable:null});await page.getByRole('button',{name:'再読み込み',exact:true}).click();await normal();
  await page.setViewportSize({width:1280,height:900});
  if(process.env.HOME_NAV_UI_ONLY!=='1') {
  const sources = {
    workspace_company_profiles: 'home-profile',
    workspace_tax_return_profiles: 'home-returns',
    workspace_procedure_statuses: 'home-statuses',
    workspace_documents: 'home-documents',
    workspace_monthly_sales: 'home-monthly',
    workspace_tax_payment_plans: 'home-tax-plans',
  };
  for (const [table, id] of Object.entries(sources).filter(([table])=>!process.env.HOME_FAULT_TABLES || process.env.HOME_FAULT_TABLES.split(',').includes(table)))
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
      assert.match(await page.getByTestId(id).textContent(), /取得できません/);
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
        await page.getByTestId(healthy).textContent(),
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
  for (const table of ['rules', 'procedures', 'jurisdictions'].filter(table=>!process.env.HOME_FAULT_TABLES || process.env.HOME_FAULT_TABLES.split(',').includes(table)))
    for (const failure of ['error', 'throw', 'null', 'malformed']) {
      console.log('checking nested ' + table + ' ' + failure);
      await update({ failTable: table, failure });
      await page.reload({ waitUntil: 'networkidle' });
      await unavailable.waitFor();
      assert.match(
        await page.getByTestId('home-monthly').textContent(),
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
  assert.match(await page.getByTestId('home-monthly').textContent(), /1,000,000/);
  assert.match(await page.locator('body').textContent(), /取得できません/);
  await update({ failTable: null });
  // Independent review branches keep a known evaluation count when cases cannot be loaded.
  await update({ failTable: 'workspace_tax_review_cases', failure: 'null' });
  await page.reload({ waitUntil: 'networkidle' });
  assert.match(
    await page.getByTestId('tax-summary-open').textContent(),
    /取得できません/,
  );
  assert.match(
    await page.getByTestId('tax-summary-evaluation').textContent(),
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
  assert.match(await page.getByTestId('home-profile').textContent(), /未登録/);
  assert.match(await page.getByTestId('home-documents').textContent(), /0件/);
  assert.match(await page.getByTestId('home-monthly').textContent(), /未登録/);
  assert.match(await page.getByTestId('home-tax-plans').textContent(), /¥0/);
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
  }
  // P02/P03: actual missing values, zero, deep links and unsaved edits.
  state = structuredClone(initial);
  state.data.workspace_companies[0].fiscal_month = null;
  state.data.workspace_company_profiles[0].established_date = null;
  state.data.workspace_company_profiles[0].capital = null;
  state.data.workspace_company_profiles[0].employee_count = 0;
  state.data.workspace_monthly_sales = [];
  state.data.workspace_tax_payment_plans = [];
  await update();
  await page.goto(home,{waitUntil:'networkidle'});
  const missingNotice = page.getByTestId('home-missing-profile');
  await missingNotice.waitFor();
  assert.match(await missingNotice.textContent(),/決算月・設立日・資本金/);
  assert.doesNotMatch(await page.getByTestId('home-today').textContent(),/優先して表示する対応候補はありません/);
  await page.screenshot({path:'test-results/profile-next-step-home.png',fullPage:false});
  await missingNotice.getByRole('link',{name:'決算月から入力する',exact:true}).click();
  await page.waitForURL(home+'/profile#company-profile-fiscalMonth');
  await page.waitForFunction(()=>document.activeElement?.id==='company-profile-fiscalMonth');
  const guidance = page.getByRole('region',{name:'入力する項目の案内',exact:true});
  assert.match(await guidance.textContent(),/未入力 3項目/);
  assert.match(await guidance.textContent(),/選択済みの項目や初期値/);
  assert.equal(await page.getByText('未入力',{exact:true}).count(),3);
  assert.equal(await page.getByRole('textbox',{name:'従業員数',exact:true}).inputValue(),'0');
  await guidance.getByRole('link',{name:'設立日の入力欄へ',exact:true}).click();
  assert.equal(await page.getByRole('textbox',{name:'設立日',exact:true}).evaluate(el=>el===document.activeElement),true);
  await page.getByRole('textbox',{name:'資本金',exact:true}).fill('0');
  await page.getByRole('textbox',{name:'資本金',exact:true}).blur();
  assert.match(await guidance.textContent(),/未入力 2項目/);
  assert.equal(await page.getByRole('textbox',{name:'資本金',exact:true}).inputValue(),'0');
  await page.locator('#company-profile-fiscalMonth').selectOption('3');
  assert.match(await guidance.textContent(),/未入力 1項目/);
  await page.getByRole('textbox',{name:'設立日',exact:true}).fill('20200101');
  await page.getByRole('textbox',{name:'設立日',exact:true}).blur();
  assert.match(await guidance.textContent(),/3項目とも入力されています/);
  assert.equal(await page.getByText('未入力',{exact:true}).count(),0);
  assert.equal(writes,0);
  await page.reload({waitUntil:'networkidle'});
  assert.match(await guidance.textContent(),/未入力 3項目/);
  await page.setViewportSize({width:375,height:812});
  await guidance.getByRole('link',{name:'資本金の入力欄へ',exact:true}).click();
  assert.equal(await page.getByRole('textbox',{name:'資本金',exact:true}).evaluate(el=>el===document.activeElement),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  await page.screenshot({path:'test-results/profile-missing-mobile.png',fullPage:false});
  await page.setViewportSize({width:1280,height:900});
  await page.screenshot({path:'test-results/profile-missing-desktop.png',fullPage:true});
  await update({failTable:'workspace_company_profiles',failure:'error'});
  await page.goto(home,{waitUntil:'networkidle'});
  assert.equal(await page.getByTestId('home-missing-profile').count(),0);
  await page.goto(home+'/profile',{waitUntil:'networkidle'});
  await page.getByText('会社プロフィールを読み込めませんでした',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'保存する',exact:true}).count(),0);
  assert.equal(await page.getByText('未入力',{exact:true}).count(),0);
  state = structuredClone(initial);
  await update();
  await page.goto(home,{waitUntil:'networkidle'});
  assert.equal(await page.getByTestId('home-missing-profile').count(),0);
  // P08: filing is not payment; fixtures and auth remain local and synthetic.
  state = structuredClone(initial);
  await update();
  await page.goto(home + '/roadmap', {waitUntil:'networkidle'});
  assert.ok(await page.getByRole('textbox',{name:'合成ホーム手続きの予定税額',exact:true}).count() > 0);
  for (const code of ['DEPRECIABLE_ASSET_TAX_RETURN','SALARY_PAYMENT_REPORT']) {
    state.data.procedures = [{...proc,code}];
    await update();
    await page.reload({waitUntil:'networkidle'});
    assert.equal(await page.getByRole('textbox',{name:/の予定税額$/}).count(),0);
    assert.equal(await page.getByRole('button',{name:'予定税額を保存',exact:true}).count(),0);
    assert.ok(await page.getByText('税金の支払いとは分けて確認してください',{exact:true}).count()>0);
    if(code === 'DEPRECIABLE_ASSET_TAX_RETURN') {
      assert.ok(await page.getByText(/固定資産税の支払いは別の手続き/).count()>0);
      const filingCard = page.getByRole('heading',{name:'合成ホーム手続き',exact:true}).first().locator('xpath=ancestor::li');
      const filingDate = (await filingCard.getAttribute('id')).slice(-10);
      state.data.workspace_tax_payment_plans=[{procedure_id:90001,due_date:filingDate,amount:500000,procedures:{code}}];
      await update();
      await page.reload({waitUntil:'networkidle'});
      assert.ok(await page.getByText(/以前登録した金額は保持しています/).count()>0);
      await page.screenshot({path:'test-results/filing-payment-roadmap.png',fullPage:false});
    }
  }
  for(const procedures of [null,{code:'DEPRECIABLE_ASSET_TAX_RETURN'}]) {
    state = structuredClone(initial);
    state.data.workspace_tax_payment_plans[0].procedures=procedures;
    await update();
    await page.goto(home,{waitUntil:'networkidle'});
    assert.match(await page.getByTestId('home-tax-plans').textContent(),/取得できません/);
    assert.doesNotMatch(await page.getByTestId('home-profile').textContent(),/取得できません/);
    await page.goto(home+'/growth',{waitUntil:'networkidle'});
    await page.getByText('売上目標・資金繰りを確認できません',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'保存',exact:true}).count(),0);
  }
  state = structuredClone(initial);
  await update();
  await page.goto(home,{waitUntil:'networkidle'});
  assert.match(await page.getByTestId('home-tax-plans').textContent(),/500,000/);
  assert.equal(writes, 0);
  assert.deepEqual(pageErrors,[]);
  assert.equal(existsSync(file + '.mutations'), false);
  await writeFile('test-results/home-sidebar.json',JSON.stringify({syntheticOnly:true,todayFirst:true,sourceAndProgressExpandable:true,highPriorityNoticeVisible:true,eightCompanyDestinations:true,allDestinationActiveStates:true,companySwitchNoStaleLinks:true,mobileDrawerAndKeyboard:true,mobileNoOverflow:true,errorsRemainVisible:true,globalAdminNavigationRetained:true,pageErrors:pageErrors.length,writes,productionCalls:0,fullReadRegression:process.env.HOME_NAV_UI_ONLY!=='1'&&!process.env.HOME_FAULT_TABLES},null,2));
  console.log('PASS home layout and sidebar destinations, active company, mobile keyboard, errors visible, zero writes');
  if(process.env.HOME_NAV_UI_ONLY!=='1'&&!process.env.HOME_FAULT_TABLES) console.log(
    'PASS: independent source failures and nested engine failures do not become zero/no action; known sections preserved; retries, normal missing/zero, independent review and legacy roadmap/documents/share normal contracts; zero real DB writes.',
  );
} catch(error) {
  if(activePage) { await writeFile('test-results/home-sidebar-failure.txt',await activePage.locator('body').innerText()); await activePage.screenshot({path:'test-results/home-sidebar-failure.png',fullPage:false}); }
  throw error;
} finally {
  await browser?.close();
  if (server?.pid) {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {}
  }
  await writeFile('test-results/home-read-server.log', logs);
}
