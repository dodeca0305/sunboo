import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { initial as executionInputs } from '../tests/fixtures/taxExecutionInputs.mjs';
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
  e_filing_system_name: 'e-Tax',
  e_filing_system_url: 'https://www.e-tax.nta.go.jp/',
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
const syntheticDocumentWrites=[];
const syntheticTaxWrites=[];
let syntheticTaxSaveMode=null;
let responsibilityMode=null,responsibilityReadFails=false,responsibilityStatusWrites=0;
const responsibilityWrites=[];

async function update(v = {}) {
  state = { ...state, ...v };
  state.data.workspace_documents=state.data.workspace_documents.map(row=>({company_id:companyId,period_start:null,period_end:null,document_date:null,updated_at:'2026-11-06T01:00:00.123456+00:00',...row}));
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
  await context.addInitScript(() => Object.defineProperty(navigator, 'clipboard', {configurable:true,value:{writeText:async text=>{
    if(window.__copyFails) throw Error('synthetic clipboard denial');
    window.__copiedText=text;
  }}}));
  await context.route(origin + '/**', (route) => {
    const h = route.request().headers();
    if (h['next-router-prefetch'] || h.purpose === 'prefetch')
      return route.abort();
    return route.continue();
  });
  await context.route('**/rest/v1/**', async (route) => {
    const request=route.request();
    if(request.method()==='OPTIONS') return route.fulfill({status:204,headers:{'access-control-allow-origin':origin,'access-control-allow-methods':'GET,HEAD,POST,OPTIONS','access-control-allow-headers':request.headers()['access-control-request-headers']??'*'}});
    if(responsibilityMode && request.method()==='GET' && new URL(request.url()).pathname==='/rest/v1/workspace_companies') return route.fulfill({json:[{id:companyId}],headers:{'access-control-allow-origin':origin}});
    if(responsibilityMode && new URL(request.url()).pathname==='/rest/v1/workspace_procedure_statuses'){
      const headers={'access-control-allow-origin':origin};
      const u=new URL(request.url());
      if(request.method()==='GET')return responsibilityReadFails?route.fulfill({status:400,json:{message:'Synthetic role read failure'},headers}):route.fulfill({json:state.data.workspace_procedure_statuses,headers});
      if(['POST','PATCH'].includes(request.method())){
        const value=request.postDataJSON();
        if(Object.hasOwn(value,'responsible_role')){
          responsibilityWrites.push({method:request.method(),value});
          if(responsibilityMode==='error')return route.fulfill({status:400,json:{message:'Synthetic role rejection'},headers});
          let existing=state.data.workspace_procedure_statuses.find(r=>r.company_id===companyId&&r.procedure_id===90001&&r.occurrence_key===(value.occurrence_key??u.searchParams.get('occurrence_key')?.slice(3)));
          if(request.method()==='POST'){
            assert.equal(value.company_id,companyId);assert.equal(value.procedure_id,90001);assert.equal(Object.hasOwn(value,'status'),false);
            if(existing)return route.fulfill({status:409,json:{code:'23505'},headers});
            existing={...value,status:'not_started'};state.data.workspace_procedure_statuses.push(existing);
          }else{
            assert.deepEqual(Object.keys(value),['responsible_role']);assert.equal(u.searchParams.get('company_id'),'eq.'+companyId);assert.equal(u.searchParams.get('procedure_id'),'eq.90001');
            if(!existing||u.searchParams.get('updated_at')!=='eq.'+existing.updated_at)return route.fulfill({json:null,headers});
            existing.responsible_role=value.responsible_role;
          }
          existing.updated_at=new Date(Date.now()+responsibilityWrites.length+responsibilityStatusWrites).toISOString();await update();
          if(responsibilityMode==='lost')return route.abort('failed');
          return route.fulfill({json:existing,headers});
        }
        responsibilityStatusWrites++;
        const existing=state.data.workspace_procedure_statuses.find(r=>r.company_id===value.company_id&&r.procedure_id===value.procedure_id&&r.occurrence_key===value.occurrence_key);
        assert.ok(existing);assert.equal(Object.hasOwn(value,'responsible_role'),false);Object.assign(existing,value,{updated_at:new Date(Date.now()+responsibilityWrites.length+responsibilityStatusWrites).toISOString()});await update();
        return route.fulfill({json:existing,headers});
      }
    }
    if (syntheticTaxSaveMode && request.method()==='POST' && new URL(request.url()).pathname==='/rest/v1/workspace_tax_payment_plans') {
      const row=request.postDataJSON();
      assert.equal(row.company_id,companyId);assert.equal(row.procedure_id,90001);
      assert.ok(Number.isSafeInteger(row.amount)&&row.amount>=0);
      syntheticTaxWrites.push(row);
      const headers={'access-control-allow-origin':origin};
      if(syntheticTaxSaveMode==='error') return route.fulfill({status:400,json:{message:'Synthetic rejection'},headers});
      state.data.workspace_tax_payment_plans=[{...row,procedures:{code:'WITHHOLDING_TAX'}}];
      await update();
      if(syntheticTaxSaveMode==='lost') return route.abort('failed');
      return route.fulfill({json:[],headers});
    }
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
    assert.notEqual(await page.getByTestId('home-first-step').getAttribute('data-kind'), 'unavailable');
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
  const todayBox=await todayCard.boundingBox();
  // First step: above 今日やること, exactly one large link whose CTA is inside the initial screen.
  const firstStep=page.getByTestId('home-first-step');
  const firstCta=firstStep.getByRole('link');
  const ctaBox=await firstCta.boundingBox();
  assert.ok((await firstStep.boundingBox()).y<todayBox.y);
  assert.equal(await firstCta.count(),1);
  assert.equal(await firstStep.getByRole('button').count(),0);
  assert.ok(ctaBox.height>=44);
  assert.ok(ctaBox.y+ctaBox.height<=900,'first-step CTA is inside the initial desktop screen');
  assert.ok(ctaBox.y+ctaBox.height<=todayBox.y,'CTA is above 今日やること');
  const ctaStyle=await firstCta.evaluate(el=>{const s=getComputedStyle(el);return {bg:s.backgroundColor,color:s.color};});
  assert.deepEqual(ctaStyle,{bg:'rgb(31, 41, 55)',color:'rgb(255, 255, 255)'});
  assert.equal(await page.locator('main').getByText('まず「今日やること」を確認してください',{exact:false}).count(),0);
  await firstCta.focus();assert.equal(await firstCta.evaluate(el=>el===document.activeElement),true);
  await page.screenshot({path:'test-results/home-first-step-desktop.png',fullPage:false});
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
  await page.getByText('確認結果を取得できません',{exact:true}).waitFor();
  await page.getByText('確認結果を取得できませんでした。項目が0件かどうかはまだ分かりません。',{exact:true}).waitFor();
  assert.equal(await page.getByText('まだ確認が終わっていない項目：0件',{exact:true}).count(),0);
  await update({failTable:null});await page.getByRole('button',{name:'再読み込み',exact:true}).click();
  await page.getByText('まだ確認が終わっていない項目：0件',{exact:true}).waitFor();
  await page.getByText('登録情報をもとに、税金について確認したい項目を表示します。',{exact:false}).waitFor();
  await page.getByText('確認する項目はまだ登録されていません',{exact:true}).waitFor();
  assert.doesNotMatch(await page.locator('main').textContent(),/Tax Intelligence|ReviewCase/);
  // Reading order and progressive disclosure use only synthetic results; no tax execution.
  const reviewCases = [
    {id:1,status:'open',result:'review',severity:'warning'},
    {id:2,status:'open',result:'unknown',severity:'info'},
    {id:3,status:'open',result:'review',severity:'critical'},
    {id:4,status:'resolved',result:'review',severity:'error'},
    {id:5,status:'dismissed',result:'review',severity:'warning'},
  ];
  state.data.workspace_tax_review_cases=reviewCases.map(r=>({id:r.id,company_id:companyId,control_result_id:r.id,status:r.status,title:`合成確認${r.id}`,issue_summary:'合成の確認内容',resolution_summary:r.status==='open'?null:'合成の対応記録',resolved_by:null,resolved_at:null,created_at:'2026-11-01T00:00:00Z',updated_at:'2026-11-01T00:00:00Z'}));
  state.data.workspace_tax_control_results=reviewCases.map(r=>({id:r.id,company_id:companyId,tax_control_id:r.id,status:r.result,reason_code:'synthetic',reason_summary:'合成の詳しい理由',as_of_date:'2026-11-01',evaluated_at:'2026-11-01T00:00:00Z',evaluator_version:'synthetic'}));
  state.data.tax_controls=reviewCases.map(r=>({id:r.id,control_code:`SYNTHETIC_${r.id}`,version_no:1,title:'合成チェック',default_severity:r.severity}));
  await update();await page.reload({waitUntil:'networkidle'});
  assert.deepEqual(await page.locator('[data-testid^="review-section-"]').evaluateAll(nodes=>nodes.map(n=>n.dataset.testid)),['review-section-priority','review-section-unknown','review-section-next','review-section-resolved','review-section-dismissed']);
  for(const [id,section] of [[3,'priority'],[2,'unknown'],[1,'next'],[4,'resolved'],[5,'dismissed']]) {
    assert.equal(await page.getByTestId(`review-section-${section}`).getByTestId(`review-case-${id}`).count(),1);
  }
  const priorityCase=page.getByTestId('review-case-3');
  assert.equal(await priorityCase.getByRole('textbox').isVisible(),false);
  assert.equal(await priorityCase.getByText('合成の詳しい理由',{exact:true}).isVisible(),false);
  await priorityCase.locator('summary').first().click();
  assert.equal(await priorityCase.getByRole('combobox',{name:'何をしますか？',exact:true}).count(),0);
  await priorityCase.getByRole('button',{name:'税理士に送る確認内容をコピー',exact:true}).click();
  await priorityCase.getByRole('status').filter({hasText:'確認内容をコピーしました'}).waitFor();
  const copied=await page.evaluate(()=>window.__copiedText);
  assert.match(copied,/ローカル合成会社ホーム/);assert.match(copied,/合成確認3/);assert.match(copied,/合成の詳しい理由/);
  await page.evaluate(()=>window.__copyFails=true);
  await priorityCase.getByRole('button',{name:'税理士に送る確認内容をコピー',exact:true}).click();
  await priorityCase.getByRole('alert').filter({hasText:'コピーできませんでした'}).waitFor();
  assert.equal(await priorityCase.getByRole('status').count(),0);await page.evaluate(()=>window.__copyFails=false);
  await priorityCase.getByText('詳しい理由',{exact:true}).click();
  await priorityCase.getByText('合成の詳しい理由',{exact:true}).waitFor({state:'visible'});
  await priorityCase.getByText('対応した内容を記録する',{exact:true}).click();
  await priorityCase.getByRole('textbox').fill('合成の未保存メモ');
  await priorityCase.getByText('詳しい理由',{exact:true}).click();
  assert.equal(await priorityCase.getByRole('textbox').inputValue(),'合成の未保存メモ');
  await priorityCase.locator('summary').first().click();
  const executionDetails=page.getByTestId('tax-execution-details');
  assert.equal(await page.getByTestId('tax-check-options').getAttribute('open'),null);
  const checkOptions=executionDetails.getByTestId('tax-check-options');
  await checkOptions.locator(':scope > summary').focus();await page.keyboard.press('Enter');
  await page.getByRole('button',{name:'評価して保存',exact:true}).waitFor({state:'visible'});
  await checkOptions.locator(':scope > summary').focus();await page.keyboard.press('Enter');
  await page.getByTestId('tax-input-next-step').getByRole('heading',{name:'決算日を登録',exact:true}).waitFor();
  const newDateLink=page.getByRole('link',{name:'決算日の入力欄へ',exact:true});
  assert.equal(await newDateLink.getAttribute('href'),home.replace(origin,'')+'/tax-returns?entry=new&field=fiscalYearEndDate');
  assert.equal(await page.getByRole('button',{name:'評価して保存',exact:true}).isVisible(),false);
  assert.equal(await newDateLink.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(38, 38, 38)');
  assert.equal(await page.locator('[data-workspace-style="monochrome"]').count(),1);
  await newDateLink.click();await page.waitForURL(home+'/tax-returns?entry=new&field=fiscalYearEndDate');
  assert.equal(await page.locator('[data-workspace-style="monochrome"]').count(),0);
  await page.waitForFunction(()=>document.activeElement?.id==='tax-return-fiscalYearEndDate');
  assert.equal(await page.getByRole('textbox',{name:'決算日',exact:true}).inputValue(),'');
  assert.equal(await page.getByRole('textbox',{name:'決算日',exact:true}).getAttribute('placeholder'),'例: 2026/03/31');
  assert.equal(await page.getByRole('textbox',{name:'決算の対象期間：開始日',exact:true}).getAttribute('placeholder'),'例: 2025/04/01');
  assert.equal(await page.getByRole('textbox',{name:'決算の対象期間：開始日',exact:true}).inputValue(),'');
  assert.equal(await page.getByRole('heading',{name:'新しい申告実績',exact:true}).count(),1);
  await page.screenshot({path:'test-results/tax-review-direct-new-date.png',fullPage:false});
  const taxRow={...executionInputs.workspace_tax_return_profiles[0],company_id:companyId,id:7};
  state.data.workspace_tax_return_profiles=[taxRow];await update();
  await page.goto(home+'/tax-review',{waitUntil:'networkidle'});
  await page.getByRole('link',{name:'この決算期の申告日の入力欄へ',exact:true}).click();
  await page.waitForURL(home+'/tax-returns?entry=7&field=filedDate');
  await page.waitForFunction(()=>document.activeElement?.id==='tax-return-filedDate');
  assert.equal(await page.getByRole('heading',{name:'申告実績を編集',exact:true}).count(),1);
  assert.equal(await page.getByRole('textbox',{name:'決算日',exact:true}).inputValue(),'2025/03/31');
  assert.equal(await page.getByRole('textbox',{name:'申告日',exact:true}).inputValue(),'');
  // A pending save blocks editing/focus on a direct link; it is never automatically resent.
  const {id:rowId,company_id:rowCompany,created_at,updated_at,...taxPayload}=taxRow;
  void rowId; void rowCompany; void created_at; void updated_at;
  await page.evaluate(({companyId,taxPayload})=>sessionStorage.setItem(`sunboo:workspace:${companyId}:pending-tax-return`,JSON.stringify({version:1,companyId,id:7,kind:'save',payload:taxPayload})),{companyId,taxPayload});
  await page.reload({waitUntil:'networkidle'});
  await page.getByRole('alert').filter({hasText:'前回の保存結果が未確認'}).waitFor();
  assert.equal(await page.getByRole('textbox',{name:'申告日',exact:true}).isDisabled(),true);
  assert.notEqual(await page.evaluate(()=>document.activeElement?.id),'tax-return-filedDate');
  await page.evaluate(()=>sessionStorage.clear());
  await page.goto(home+'/tax-returns?entry=999999&field=filedDate',{waitUntil:'networkidle'});
  assert.equal(await page.getByRole('heading',{name:'申告実績を編集',exact:true}).count(),0);
  assert.equal(await page.getByRole('heading',{name:'新しい申告実績',exact:true}).count(),0);
  state.data.workspace_tax_return_profiles=[{...taxRow,filed_date:'2025-05-01'}];await update();
  await page.goto(home+'/tax-review',{waitUntil:'networkidle'});
  await page.getByText('申告日まで登録済み',{exact:true}).waitFor();
  await page.getByTestId('tax-check-options').locator(':scope > summary').click();
  await page.getByRole('button',{name:'評価して保存',exact:true}).waitFor({state:'visible'});
  await page.getByLabel(/清算中の残余財産確定に関する特則/).selectOption('not_applicable');
  const help=page.getByTestId('tax-check-input-help');
  await help.getByText('決算日と申告した日を入力してください。',{exact:true}).waitFor({state:'visible'});
  await help.getByText('申告済みの決算がある場合だけ入力してください。',{exact:true}).waitFor({state:'visible'});
  assert.equal(await page.getByText('法人税確定申告の基本提出時期チェック（TI_TAX_001）',{exact:true}).isVisible(),false);
  await page.getByText('専門家向けの詳しい説明（チェックの対象）',{exact:true}).focus();await page.keyboard.press('Enter');
  await page.getByText('法人税確定申告の基本提出時期チェック（TI_TAX_001）',{exact:true}).waitFor({state:'visible'});
  await page.getByText('2023年4月1日以降',{exact:false}).first().waitFor({state:'visible'});
  await page.getByText('清算中の残余財産確定に関する特則への該当有無',{exact:false}).waitFor({state:'visible'});
  assert.equal(await page.getByLabel(/清算中の残余財産確定に関する特則/).inputValue(),'not_applicable');

  for(const failTable of ['workspace_company_profiles','workspace_tax_return_profiles','municipalities']){
    await update({failTable,failure:'error'});await page.reload({waitUntil:'networkidle'});
    assert.equal(await page.getByTestId('tax-check-options').getAttribute('open'),null);
    await page.getByRole('alert').filter({hasText:'入力状況を取得できません'}).waitFor();

    assert.equal(await page.getByTestId('tax-input-next-step').count(),0);
    await page.getByTestId('tax-check-options').locator(':scope > summary').click();
    assert.equal(await page.getByRole('button',{name:'評価して保存',exact:true}).isDisabled(),true);
  }
  await update({failTable:null,failure:null});
  await update({failTable:'workspace_companies',failure:'error'});await page.reload({waitUntil:'networkidle'});
  await page.getByRole('alert').filter({hasText:'会社情報を取得できません。確認結果・入力案内・新規チェックを表示できません。'}).waitFor();
  assert.equal(await page.getByTestId('tax-execution-details').count(),0);
  assert.equal(await page.getByTestId('tax-input-next-step').count(),0);
  await update({failTable:null,failure:null});await page.getByRole('button',{name:'再読み込み',exact:true}).click();
  state.data.workspace_companies[0].fiscal_month=null;await update();await page.reload({waitUntil:'networkidle'});

  await page.getByRole('link',{name:'決算月の入力欄へ',exact:true}).click();
  await page.waitForURL(home+'/profile#company-profile-fiscalMonth');
  await page.waitForFunction(()=>document.activeElement?.id==='company-profile-fiscalMonth');
  state.data.workspace_companies[0].fiscal_month=3;state.data.workspace_company_profiles=[profile];state.data.workspace_tax_return_profiles=[];await update();
  await page.goto(home+'/tax-review',{waitUntil:'networkidle'});
  await page.getByTestId('tax-input-next-step').scrollIntoViewIfNeeded();
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:'test-results/tax-review-monochrome-desktop.png',fullPage:false});
  await page.setViewportSize({width:900,height:900});
  assert.equal(await companyNav().count(),1);
  assert.equal(await page.getByRole('button',{name:'メニューを開く',exact:true}).count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:'test-results/tax-review-monochrome-medium.png',fullPage:false});
  await page.setViewportSize({width:375,height:812});await page.getByTestId('tax-input-next-step').scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.equal(await companyNav().count(),0);
  await page.getByRole('button',{name:'メニューを開く',exact:true}).click();
  await page.getByRole('dialog',{name:'ナビゲーションメニュー',exact:true}).waitFor();
  assert.equal(await companyNav().getByRole('link',{name:'税金の確認結果',exact:true}).getAttribute('aria-current'),'page');
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('button',{name:'メニューを開く',exact:true}).evaluate(el=>el===document.activeElement),true);
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:'test-results/tax-review-monochrome-mobile.png',fullPage:false});
  await page.setViewportSize({width:1280,height:900});
  const sections=page.locator('[data-testid^="review-section-"] > h2');
  const colors=await sections.evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).backgroundColor));
  assert.equal(new Set(colors).size,1,'section headers have no colored fills');
  const textColors=await sections.evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).color));
  assert.notEqual(textColors[0],textColors[2]);assert.notEqual(textColors[1],textColors[2]);
  assert.equal(textColors[2],textColors[3]);assert.equal(textColors[3],textColors[4]);
  await page.screenshot({path:'test-results/tax-review-action-order-desktop.png',fullPage:true});
  await page.setViewportSize({width:375,height:812});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:'test-results/tax-review-action-order-mobile.png',fullPage:true});
  await page.setViewportSize({width:1280,height:900});
  // An unresolved execution stays visible even with the execution form collapsed, including after reload.
  await page.evaluate(({companyId})=>sessionStorage.setItem(`sunboo:tax-execution:v1:00000000-0000-4000-8000-000000000001:${companyId}`,JSON.stringify({executionId:'10000000-0000-4000-8000-000000000001',intent:{companyId,taxControlId:1,asOfDate:'2026-11-01',liquidationResidualAssetsCase:'unknown'}})),{companyId});
  await page.reload({waitUntil:'networkidle'});
  await page.getByRole('button',{name:'保存結果を確認',exact:true}).waitFor({state:'visible'});
  assert.equal(await page.getByTestId('tax-check-options').getAttribute('open'),null);

  await page.getByTestId('tax-check-options').locator(':scope > summary').click();
  assert.equal(await page.getByRole('button',{name:'評価して保存',exact:true}).isDisabled(),true);
  await page.evaluate(()=>sessionStorage.clear());
  state.data.workspace_members=[{role:'viewer'}];await update();await page.reload({waitUntil:'networkidle'});
  assert.equal(await page.getByTestId('tax-execution-details').count(),0);
  await priorityCase.locator('summary').first().click();
  assert.equal(await priorityCase.getByRole('combobox',{name:'何をしますか？',exact:true}).count(),0);
  assert.equal(await priorityCase.getByRole('button',{name:'解決済みにする',exact:true}).count(),0);
  await priorityCase.getByText('詳しい理由',{exact:true}).click();await priorityCase.getByText('合成の詳しい理由',{exact:true}).waitFor({state:'visible'});
  state.data.workspace_members=[{role:'member'}];
  state.data.workspace_tax_review_cases=[];state.data.workspace_tax_control_results=[];state.data.tax_controls=[];await update();
  await update({failTable:'tax_controls',failure:'error'});await page.reload({waitUntil:'networkidle'});
  await page.getByText('チェック一覧を取得できません。実行を停止しています。',{exact:true}).waitFor({state:'visible'});
  assert.equal(await page.getByTestId('tax-check-options').getAttribute('open'),null);
  await update({failTable:null,failure:null});
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
  {
    // 375px: first step and its black CTA are in the initial screen, above 今日やること, keyboard-reachable.
    const step=page.getByTestId('home-first-step'),cta=step.getByRole('link'),cb=await cta.boundingBox(),tb=await page.getByTestId('home-today').boundingBox();
    assert.equal(await cta.count(),1);
    assert.ok(cb.y+cb.height<=812,'375px CTA inside initial screen');
    assert.ok(cb.y+cb.height<=tb.y);
    assert.deepEqual(await cta.evaluate(el=>{const s=getComputedStyle(el);return {bg:s.backgroundColor,color:s.color};}),{bg:'rgb(31, 41, 55)',color:'rgb(255, 255, 255)'});
    await cta.focus();assert.equal(await cta.evaluate(el=>el===document.activeElement),true);
    await page.keyboard.press('Tab');assert.equal(await cta.evaluate(el=>el===document.activeElement),false);
    await page.keyboard.press('Shift+Tab');assert.equal(await cta.evaluate(el=>el===document.activeElement),true);
    await page.screenshot({path:'test-results/home-first-step-mobile.png',fullPage:false});
  }
  await page.screenshot({path:'test-results/home-sidebar-mobile.png',fullPage:false});
  // An error on mobile remains visible without needing the menu or a disclosure.
  await update({failTable:'workspace_company_profiles',failure:'error'});await page.reload({waitUntil:'networkidle'});await unavailable.waitFor();
  assert.equal(await page.getByTestId('home-source-details').getAttribute('open'),'');
  await page.getByRole('alert').filter({hasText:'一部の情報を取得できません'}).waitFor();
  const failedStep=page.getByTestId('home-first-step');
  assert.equal(await failedStep.getAttribute('data-kind'),'unavailable');
  assert.equal(await failedStep.getByRole('link').count(),0);
  assert.equal(await failedStep.getByRole('button',{name:'再読み込み',exact:true}).count(),1);
  assert.equal(await page.getByRole('button',{name:'再読み込み',exact:true}).count(),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  await page.screenshot({path:'test-results/home-first-step-unavailable-mobile.png',fullPage:false});
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
        name: '合成ホーム手続きの対応状況',
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
  // 完了の目安：静的表示のみ。表示で書込は増えない。
  {
    const writesBefore = writes, taxWritesBefore = syntheticTaxWrites.length;
    for (const [code, kind, count] of [['WITHHOLDING_TAX','unconfirmed',2],['DEPRECIABLE_ASSET_TAX_RETURN','filing_only',2],['CORP_TAX_RETURN','filing_and_payment',3]]) {
      state = structuredClone(initial);
      state.data.procedures = [{...proc, code}];
      await update();
      await page.setViewportSize({width:375,height:800});
      await page.goto(home + '/roadmap', {waitUntil:'networkidle'});
      const guideBox = page.getByTestId('procedure-completion-guide').first();
      await guideBox.waitFor();
      assert.equal(await guideBox.getAttribute('data-kind'), kind);
      assert.equal(await guideBox.getByRole('listitem').count(), count);
      assert.equal(await guideBox.locator('input,button,a').count(), 0);
      assert.equal(await page.getByText('該当要否を確認し、必要な提出・納付等を行い').count(), 0);
      assert.ok(await page.getByText(/「完了」は対応状況の記録であり/).count() > 0);
      if (kind === 'unconfirmed') {
        assert.match(await guideBox.textContent(), /まず、担当者にこの2つを確認/);
        assert.match(await guideBox.textContent(), /この手続きは必要ですか？/);
        assert.match(await guideBox.textContent(), /何をすれば完了ですか？/);
      }
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth), true);
      await guideBox.scrollIntoViewIfNeeded();
      await page.screenshot({path:`test-results/completion-guide-${kind}.png`,fullPage:false});
    }
    // 共有（公開側）の既存合成URLでも同じ静的リスト。編集部品は0。
    state = structuredClone(initial);
    state.data.procedures = [{...proc, code:'DEPRECIABLE_ASSET_TAX_RETURN'}];
    await update();
    await page.goto(origin + '/share/' + 'b'.repeat(64), {waitUntil:'networkidle'});
    const sharedGuide = page.getByTestId('procedure-completion-guide').first();
    await sharedGuide.waitFor();
    assert.equal(await sharedGuide.getAttribute('data-kind'), 'filing_only');
    assert.equal(await sharedGuide.getByRole('listitem').count(), 2);
    assert.equal(await sharedGuide.locator('input,button,a').count(), 0);
    assert.equal(writes, writesBefore);
    assert.equal(syntheticTaxWrites.length, taxWritesBefore);
    await page.setViewportSize({width:1280,height:900});
    state = structuredClone(initial);
    await update();
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
  const profileStep=page.getByTestId('home-first-step');
  assert.equal(await profileStep.getAttribute('data-kind'),'profile');
  await profileStep.getByRole('heading',{name:'まず、会社情報を入力してください',exact:true}).waitFor();
  assert.equal(await missingNotice.getByRole('link').count(),0);
  assert.equal(await profileStep.getByRole('link').count(),1);
  await page.keyboard.press('Tab');
  await profileStep.getByRole('link',{name:'入力を始める',exact:true}).focus();
  await page.keyboard.press('Enter');
  await page.waitForURL(home+'/profile#company-profile-fiscalMonth');
  await page.waitForFunction(()=>document.activeElement?.id==='company-profile-fiscalMonth');
  const guidance = page.getByRole('region',{name:'入力する項目の案内',exact:true});
  async function selectArrows() {
    const arrows = await page.locator('select.form-select:not([multiple]):not([size]),select.form-input:not([multiple]):not([size])').evaluateAll(elements=>elements.filter(el=>el.getBoundingClientRect().width>0).map(el=>({image:getComputedStyle(el).backgroundImage,padding:Number.parseFloat(getComputedStyle(el).paddingRight)})));
    assert.ok(arrows.length>0);
    assert.ok(arrows.every(value=>value.image!=='none' && value.padding>=32));
  }
  await selectArrows();
  await page.locator('#company-profile-fiscalMonth').focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('#company-profile-address').evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.locator('#company-profile-fiscalMonth').evaluate(el=>el===document.activeElement),true);
  await page.locator('#company-profile-fiscalMonth').selectOption('1');
  assert.equal(await page.locator('#company-profile-fiscalMonth').inputValue(),'1');
  await page.locator('#company-profile-fiscalMonth').selectOption('');
  assert.equal(await page.getByRole('textbox',{name:'資本金',exact:true}).evaluate(el=>getComputedStyle(el).backgroundImage),'none');
  await page.getByRole('combobox',{name:/^源泉所得税を納める回数/}).waitFor();
  await page.getByRole('combobox',{name:/^住民税（給与から天引きする分）を納める回数/}).waitFor();
  assert.equal(await page.getByRole('option',{name:'毎月納める',exact:true}).count(),2);
  assert.equal(await page.getByRole('option',{name:'わからない・未確認',exact:true}).count(),2);
  await page.emulateMedia({forcedColors:'active'});
  assert.equal(await page.locator('#company-profile-fiscalMonth').evaluate(el=>getComputedStyle(el).appearance),'auto');
  await page.emulateMedia({forcedColors:'none'});

  assert.match(await guidance.textContent(),/未入力 3項目/);
  assert.match(await guidance.textContent(),/選択済みの項目や初期値/);
  assert.equal(await page.getByText('未入力',{exact:true}).count(),3);
  assert.equal(await page.getByRole('textbox',{name:'従業員数',exact:true}).inputValue(),'0');
  const employeeHelp = page.getByTestId('employee-count-help');
  assert.match(await employeeHelp.textContent(),/パート・アルバイト2人なら「5人」/);
  assert.ok(await employeeHelp.getByText(/0人でも/).isVisible());
  const officerHelp = page.getByTestId('officer-change-date-help');
  assert.match(await officerHelp.textContent(),/就任を承諾/);
  assert.match(await officerHelp.textContent(),/未定なら空欄のまま保存/);
  assert.equal(await page.getByRole('textbox',{name:'次回の役員変更予定日',exact:true}).inputValue(),'');

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
  await page.locator('#company-profile-residentTaxPaymentCycle').scrollIntoViewIfNeeded();
  await page.screenshot({path:'test-results/profile-select-mobile.png',fullPage:false});
  await page.setViewportSize({width:1280,height:900});
  await page.screenshot({path:'test-results/profile-missing-desktop.png',fullPage:true});
  await update({failTable:'workspace_company_profiles',failure:'error'});
  await page.goto(home,{waitUntil:'networkidle'});
  assert.equal(await page.getByTestId('home-missing-profile').count(),0);
  await page.goto(home+'/profile',{waitUntil:'networkidle'});
  await page.getByText('会社プロフィールを読み込めませんでした',{exact:true}).waitFor();
  assert.equal(await page.getByTestId('employee-count-help').count(),0);
  assert.equal(await page.getByRole('button',{name:'保存する',exact:true}).count(),0);
  assert.equal(await page.getByText('未入力',{exact:true}).count(),0);
  state = structuredClone(initial);
  await update();
  await page.goto(home,{waitUntil:'networkidle'});
  assert.equal(await page.getByTestId('home-missing-profile').count(),0);
  await page.goto(home+'/tax-returns',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'新しい申告実績を追加',exact:true}).click();
  await page.getByRole('combobox',{name:'対象年度（決算日の年・必須）',exact:true}).waitFor();
  await selectArrows();
  state.data.workspace_documents = [
    {document_type:'articles_of_incorporation',status:'registered'},
    {document_type:'certificate_of_registered_matters',status:'needs_update'},
    {document_type:'corporate_tax_return',status:'registered'},
    {document_type:'consumption_tax_return',status:'registered'},
    {document_type:'withholding_tax_payment_slip',status:'registered'},
  ];
  await update();
  await page.goto(home+'/documents',{waitUntil:'networkidle'});
  await page.getByRole('heading',{name:'会社の書類',exact:true}).waitFor();
  for(const [type,label] of [['articles_of_incorporation','作成・変更日'],['certificate_of_registered_matters','発行日'],['corporate_tax_return','対象期間'],['consumption_tax_return','対象期間'],['withholding_tax_payment_slip','対象期間']]) {
    assert.equal(await page.getByTestId('document-timing-'+type).textContent(),label+'：未記録');
  }
  assert.equal(await page.getByRole('heading',{name:'今年提出した書類',exact:true}).count(),0);
  await page.getByText('状態・対象期間を編集する',{exact:true}).first().click();
  await selectArrows();
  // Metadata writes and response-loss recovery are exercised by the isolated document timing harness.
  await page.setViewportSize({width:375,height:812});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  await page.screenshot({path:'test-results/document-timing-mobile.png',fullPage:false});
  await page.setViewportSize({width:1280,height:900});
  await page.goto(origin+'/start',{waitUntil:'networkidle'});
  await selectArrows();
  assert.equal(await page.getByText('▾',{exact:true}).count(),0);
  await page.goto(origin+'/profile',{waitUntil:'networkidle'});
  await page.getByText('源泉所得税を納める回数',{exact:true}).waitFor();
  await page.getByText('住民税（給与から天引きする分）を納める回数',{exact:true}).waitFor();
  assert.ok(await page.getByRole('button',{name:'毎月納める',exact:true}).count()>=2);
  assert.equal(await page.getByTestId('employee-count-help').count(),1);
  await page.getByRole('button',{name:'株式会社',exact:true}).click();
  assert.equal(await page.getByTestId('officer-change-date-help').count(),1);
  await page.getByRole('button',{name:'合同会社',exact:true}).click();
  assert.equal(await page.getByTestId('officer-change-date-help').count(),0);
  // Electronic filing routes use registered metadata; no external page is opened by synthetic UI tests.
  state=structuredClone(initial);await update();await page.goto(home+'/roadmap',{waitUntil:'networkidle'});
  assert.equal(await page.getByRole('link',{name:'e-Taxへログイン（法人）',exact:true}).first().getAttribute('href'),'https://login.e-tax.nta.go.jp/login/reception/loginCorporate');
  assert.equal(await page.getByRole('link',{name:'初めての方・使い方を確認',exact:true}).first().getAttribute('href'),'https://www.e-tax.nta.go.jp/hojin.html');
  await page.getByTestId('electronic-filing-entry').first().scrollIntoViewIfNeeded();
  await page.screenshot({path:'test-results/electronic-filing-national-desktop.png',fullPage:false});
  for(const invalid of [null,'https://e-tax.nta.go.jp.evil.invalid/']){
    state.data.procedures=[{...proc,e_filing_system_url:invalid}];await update();await page.reload({waitUntil:'networkidle'});
    assert.equal(await page.getByRole('link',{name:'e-Taxへログイン（法人）',exact:true}).count(),0);
    assert.ok(await page.getByTestId('electronic-filing-unavailable').count()>0);
  }
  state.data.procedures=[{...proc,e_filing_system_name:null,e_filing_system_url:null}];await update();await page.reload({waitUntil:'networkidle'});
  assert.ok(await page.getByText('電子手続きの入口は未登録です。提出先の公式案内で確認してください。',{exact:true}).count()>0);
  await writeFile('test-results/electronic-filing-summary.json',JSON.stringify({syntheticOnly:true,nationalInstructionsSeparateFromCorporateLogin:true,missingDifferentFromInvalid:true,unregisteredDestinationNotInvented:true,productionCalls:0},null,2));
  // Approved responsibility selection: synthetic rows and writes only.
  state=structuredClone(initial);await update();responsibilityMode='success';
  await page.goto(home+'/roadmap',{waitUntil:'networkidle'});
  const ownerSelect=page.getByRole('combobox',{name:/合成ホーム手続き.*の担当$/}).first();
  await ownerSelect.waitFor();assert.ok(await ownerSelect.isEnabled());assert.equal(await ownerSelect.inputValue(),'');
  for(const label of ['自社の事務担当','顧問税理士','委託事業者','その他の担当','まだ決めていない'])assert.equal(await ownerSelect.getByRole('option',{name:label,exact:true}).count(),1);
  await ownerSelect.selectOption('tax_accountant');await page.getByText('担当を保存しました',{exact:true}).waitFor();
  assert.equal(await ownerSelect.inputValue(),'tax_accountant');assert.equal(responsibilityWrites.length,1);
  const assignedDate=state.data.workspace_procedure_statuses[0].occurrence_key;
  assert.equal(state.data.workspace_procedure_statuses[0].status,'not_started');
  const statusSelect=page.getByRole('combobox',{name:'合成ホーム手続きの対応状況',exact:true}).first();
  await statusSelect.selectOption('in_progress');await page.waitForLoadState('networkidle');
  await page.waitForFunction(()=>[...document.querySelectorAll('select')].some(s=>s.getAttribute('aria-label')==='合成ホーム手続きの対応状況'&&s.value==='in_progress'));
  assert.equal(state.data.workspace_procedure_statuses[0].responsible_role,'tax_accountant');
  await page.reload({waitUntil:'networkidle'});assert.equal(await ownerSelect.inputValue(),'tax_accountant');
  await ownerSelect.selectOption('undecided');await page.getByText('担当を保存しました',{exact:true}).waitFor();
  assert.equal(state.data.workspace_procedure_statuses[0].status,'in_progress');
  assert.equal(await page.getByRole('combobox',{name:/合成ホーム手続き.*の担当$/}).nth(1).inputValue(),'');
  // A stale tab must read the current version and refuse to overwrite it.
  const ownerTab=await context.newPage();await ownerTab.goto(home+'/roadmap',{waitUntil:'networkidle'});
  const staleOwner=ownerTab.getByRole('combobox',{name:/合成ホーム手続き.*の担当$/}).first();await staleOwner.waitFor();
  await ownerSelect.selectOption('outsourced_provider');await page.getByText('担当を保存しました',{exact:true}).waitFor();
  const beforeStale=responsibilityWrites.length;await staleOwner.selectOption('in_house_admin');
  await ownerTab.getByRole('alert').filter({hasText:'別の画面で登録内容が変わりました'}).waitFor();
  assert.equal(responsibilityWrites.length,beforeStale);assert.equal(await staleOwner.inputValue(),'outsourced_provider');await ownerTab.close();
  // Lost response survives reload; confirm is read-only, never a resend.
  responsibilityMode='lost';await ownerSelect.selectOption('other');
  await page.getByRole('button',{name:'担当の保存結果を確認',exact:true}).waitFor();
  assert.equal(await page.getByText('担当を保存しました',{exact:true}).count(),0);
  const beforeReconcile=responsibilityWrites.length;await page.reload({waitUntil:'networkidle'});
  assert.ok(await ownerSelect.isDisabled());assert.equal(responsibilityWrites.length,beforeReconcile);
  await page.getByRole('button',{name:'担当の保存結果を確認',exact:true}).click();
  await page.getByText('現在の担当を確認しました。変更する場合は選び直してください。',{exact:true}).waitFor();
  assert.equal(await ownerSelect.inputValue(),'other');assert.ok(await ownerSelect.isEnabled());assert.equal(responsibilityWrites.length,beforeReconcile);
  responsibilityMode='error';await ownerSelect.selectOption('tax_accountant');
  await page.getByRole('button',{name:'担当の保存結果を確認',exact:true}).waitFor();responsibilityReadFails=true;
  await page.getByRole('button',{name:'担当の保存結果を確認',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'担当を取得できません。再送せず'}).waitFor();assert.ok(await ownerSelect.isDisabled());
  responsibilityReadFails=false;await page.getByRole('button',{name:'担当の保存結果を確認',exact:true}).click();
  await page.getByText('現在の担当を確認しました。変更する場合は選び直してください。',{exact:true}).waitFor();assert.equal(await ownerSelect.inputValue(),'other');
  const beforeFailures=responsibilityWrites.length;
  for(const failure of ['error','throw','null']){
    await update({failTable:'workspace_procedure_statuses',failure});await page.reload({waitUntil:'networkidle'});
    assert.ok(await ownerSelect.isDisabled());assert.equal(await page.getByText('担当を保存しました',{exact:true}).count(),0);
    await update({failTable:null,failure:null});await page.reload({waitUntil:'networkidle'});assert.equal(await ownerSelect.inputValue(),'other');
  }
  assert.equal(responsibilityWrites.length,beforeFailures);assert.equal(state.data.workspace_procedure_statuses[0].occurrence_key,assignedDate);
  await page.setViewportSize({width:375,height:812});await ownerSelect.scrollIntoViewIfNeeded();await selectArrows();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:'test-results/responsibility-mobile.png',fullPage:false});await page.setViewportSize({width:1280,height:900});
  await writeFile('test-results/responsibility-summary.json',JSON.stringify({syntheticOnly:true,normalEmpty:true,explicitUndecided:true,statusAndRolePreserved:true,occurrenceSeparated:true,staleTabRejected:true,lostResponseAfterReloadConfirmedWithoutRetry:true,rejectedSaveRecovered:true,failedReadsStopEditing:true,mobileNoOverflow:true,roleAttempts:responsibilityWrites.length,statusAttempts:responsibilityStatusWrites,productionCalls:0},null,2));
  responsibilityMode=null;

  // Payment amount clarity: unknown/known zero, saves, failures and response loss stay synthetic.
  state=structuredClone(initial);state.data.workspace_tax_payment_plans=[];await update();
  await page.goto(home+'/roadmap',{waitUntil:'networkidle'});
  const paymentInput=page.getByRole('textbox',{name:'合成ホーム手続きの支払う予定額（円）',exact:true}).first();
  const paymentSave=page.getByRole('button',{name:'この金額を保存',exact:true}).first();
  await paymentInput.waitFor();
  assert.equal(await paymentInput.inputValue(),'');assert.ok(await paymentSave.isDisabled());
  assert.match(await page.getByTestId('tax-payment-guide').textContent(),/税額の自動計算・申告・支払いは行いません/);
  await page.getByRole('link',{name:'金額の入力欄へ',exact:true}).click();
  assert.equal(await page.evaluate(()=>document.activeElement.id),await paymentInput.locator('xpath=ancestor::li').getAttribute('id'));
  syntheticTaxSaveMode='success';
  await paymentInput.fill('500000');await paymentInput.blur();await paymentSave.click();
  await page.getByText('保存しました',{exact:true}).waitFor();assert.equal(syntheticTaxWrites.at(-1).amount,500000);
  await paymentInput.fill('0');await paymentInput.blur();await paymentSave.click();
  await page.getByText('保存しました',{exact:true}).waitFor();assert.equal(syntheticTaxWrites.at(-1).amount,0);
  await page.reload({waitUntil:'networkidle'});assert.equal(await paymentInput.inputValue(),'0');
  await paymentInput.fill('');await paymentInput.blur();assert.equal(await paymentInput.inputValue(),'');assert.ok(await paymentSave.isDisabled());
  assert.equal(syntheticTaxWrites.length,2);
  await page.reload({waitUntil:'networkidle'});assert.equal(await paymentInput.inputValue(),'0');
  await page.setViewportSize({width:375,height:812});
  await page.getByRole('link',{name:'金額の入力欄へ',exact:true}).click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:'test-results/tax-payment-input-mobile.png',fullPage:false});
  await page.setViewportSize({width:1280,height:900});
  await page.getByRole('link',{name:'金額の入力欄へ',exact:true}).click();
  await page.screenshot({path:'test-results/tax-payment-input-desktop.png',fullPage:false});
  for(const failure of ['error','throw','null']){
    await update({failTable:'workspace_tax_payment_plans',failure});await page.reload({waitUntil:'networkidle'});
    assert.equal(await page.getByRole('textbox',{name:/の支払う予定額（円）$/}).count(),0);
    assert.equal(await paymentSave.count(),0);assert.equal(await page.getByTestId('tax-payment-guide').count(),0);
    await update({failTable:null,failure:null});await page.reload({waitUntil:'networkidle'});
    assert.equal(await paymentInput.inputValue(),'0');assert.equal(syntheticTaxWrites.length,2);
  }
  for(const [mode,amount,restored] of [['lost',123456,'123,456'],['error',234567,'123,456']]){
    syntheticTaxSaveMode=mode;await paymentInput.fill(String(amount));await paymentInput.blur();await paymentSave.click();
    await page.getByText(/支払う予定額の保存/).waitFor();
    assert.equal(await page.getByText('保存しました',{exact:true}).count(),0);
    assert.equal(await paymentSave.count(),0);assert.equal(await paymentInput.count(),0);
    const attempts=syntheticTaxWrites.length;
    await page.getByRole('link',{name:'再読み込み',exact:true}).click();await page.waitForLoadState('networkidle');
    assert.equal(await paymentInput.inputValue(),restored);assert.equal(syntheticTaxWrites.length,attempts);
  }
  assert.equal(syntheticTaxWrites.length,4);syntheticTaxSaveMode=null;
  await writeFile('test-results/tax-payment-input-summary.json',JSON.stringify({syntheticOnly:true,emptyNotSavedAsZero:true,explicitZeroVisible:true,normalSave:true,failedReadsStopped:['error','throw','null'],responseLossReconciled:true,rejectedSaveRestored:true,automaticRetryCount:0,mobileNoOverflow:true,syntheticWrites:syntheticTaxWrites.length,productionCalls:0},null,2));
  // P08: filing is not payment; fixtures and auth remain local and synthetic.
  state = structuredClone(initial);
  await update();
  await page.goto(home + '/roadmap', {waitUntil:'networkidle'});
  assert.ok(await page.getByRole('textbox',{name:'合成ホーム手続きの支払う予定額（円）',exact:true}).count() > 0);
  for (const code of ['DEPRECIABLE_ASSET_TAX_RETURN','SALARY_PAYMENT_REPORT']) {
    state.data.procedures = [{...proc,code}];
    await update();
    await page.reload({waitUntil:'networkidle'});
    assert.equal(await page.getByRole('textbox',{name:/の支払う予定額（円）$/}).count(),0);
    assert.equal(await page.getByRole('button',{name:'この金額を保存',exact:true}).count(),0);
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
  // Submission-link safety: reproduce the legacy Shibuya destination using synthetic data only.
  state=structuredClone(initial);
  const brokenOfficeUrl='https://www.city.shibuya.tokyo.jp/kurashi/zeikin/hojin/';
  state.data.jurisdictions=[{organization_types:{code:'municipal_tax'},organization_offices:{id:90003,name:'合成の誤った区役所窓口',address:null,phone:null,website_url:brokenOfficeUrl,official_url:brokenOfficeUrl,official_url_status:'ok',fallback_url:brokenOfficeUrl,map_url:'https://maps.example.invalid/old'}}];
  state.data.procedures=[{...proc,id:66,code:'DEPRECIABLE_ASSET_TAX_RETURN',name:'合成償却資産申告',office_type:'municipal_tax',e_filing_system_name:'eLTAX',e_filing_system_url:'https://www.eltax.lta.go.jp/'}, {...proc,id:65,code:'MUNICIPAL_RESIDENT_TAX_RETURN',name:'合成法人市民税申告',office_type:'municipal_tax',e_filing_system_name:'eLTAX',e_filing_system_url:'https://www.eltax.lta.go.jp/'}];
  state.data.workspace_tax_payment_plans=[];
  await update();await page.goto(home+'/roadmap',{waitUntil:'networkidle'});
  async function assertSubmissionGuidance(){
    assert.equal(await page.getByRole('link',{name:'eLTAXの利用案内・手続きの入口',exact:true}).first().getAttribute('href'),'https://www.lta.go.jp/eltax/shinkoku/pcdesk/');
    assert.equal(await page.getByRole('link',{name:'e-Taxへログイン（法人）',exact:true}).count(),0);
    await page.getByRole('link',{name:'東京都の償却資産の説明（23区内の資産）',exact:true}).first().waitFor();
    assert.equal(await page.getByRole('link',{name:'東京都の償却資産の説明（23区内の資産）',exact:true}).first().getAttribute('href'),'https://www.tax.metro.tokyo.lg.jp/kazei/work/shokyak_sis');
    assert.equal(await page.getByRole('link',{name:'東京都の法人事業税・法人都民税の説明',exact:true}).first().getAttribute('href'),'https://www.tax.metro.tokyo.lg.jp/shitsumon/work/a1');
    assert.ok(await page.getByText(/本店所在地だけでは提出先を確定できません/).count()>0);
    assert.equal(await page.getByText('合成の誤った区役所窓口',{exact:true}).count(),0);
    assert.equal(await page.locator('a').evaluateAll((links,bad)=>links.filter(a=>a.href.startsWith(bad)).length,brokenOfficeUrl),0);
  }
  await assertSubmissionGuidance();
  await page.goto(origin+'/result?pref=13&muni=131130&fm=3&corp=kabushiki&est=2020-01-01',{waitUntil:'networkidle'});
  await assertSubmissionGuidance();
  assert.equal(await page.getByRole('heading',{name:/手続きに関連する窓口/}).count(),0);
  await page.setViewportSize({width:375,height:812});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:'test-results/diagnosis-submission-mobile.png',fullPage:true});
  await page.setViewportSize({width:1280,height:900});
  await page.goto(home+'/roadmap',{waitUntil:'networkidle'});
  // Download only generated synthetic artifacts; this never sends a business write.
  for(const [button,extension] of [['Excelで出力','xlsx'],['PDFで出力','pdf']]){
    const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:button,exact:true}).click();
    const download=await downloaded;await download.saveAs(`test-results/submission-guidance.${extension}`);
  }
  await page.setViewportSize({width:375,height:812});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.getByTestId('submission-destination-unconfirmed').first().scrollIntoViewIfNeeded();
  await page.screenshot({path:'test-results/submission-guidance-mobile.png',fullPage:false});
  await page.setViewportSize({width:1280,height:900});
  await page.goto(origin+'/share/'+'b'.repeat(64),{waitUntil:'networkidle'});await assertSubmissionGuidance();
  assert.equal(await page.getByRole('button',{name:'PDFで出力',exact:true}).count(),0);
  // Other cities retain their existing resolution path; no Tokyo-only guidance leaks to them.
  state.data.workspace_companies[0].prefecture_code='13';state.data.workspace_companies[0].municipality_code='132012';
  state.data.municipalities=[{id:1,code:'132012',name:'合成の別市'}];state.data.prefectures=[{id:13,code:'13',name:'合成の別県'}];
  state.data.jurisdictions[0].organization_offices={...state.data.jurisdictions[0].organization_offices,name:'合成の別市窓口',official_url:'https://city.example.invalid/assets',website_url:null,fallback_url:null};
  await update();await page.goto(home+'/roadmap',{waitUntil:'networkidle'});
  assert.equal(await page.getByRole('link',{name:'東京都の償却資産の説明（23区内の資産）',exact:true}).count(),0);
  assert.ok(await page.getByText('合成の別市窓口',{exact:true}).count()>0);
  await writeFile('test-results/submission-guidance-summary.json',JSON.stringify({syntheticOnly:true,adminAndShared:true,generalDiagnosis:true,unconfirmedAssetLocation:true,noBadOfficeOrUrl:true,otherCityUnchanged:true,downloaded:['xlsx','pdf'],mobileNoOverflow:true,productionCalls:0},null,2));
  state = structuredClone(initial);
  await update();
  await page.goto(home,{waitUntil:'networkidle'});
  assert.match(await page.getByTestId('home-tax-plans').textContent(),/500,000/);
  assert.equal(writes, 0);
  assert.deepEqual(pageErrors,[]);
  assert.equal(existsSync(file + '.mutations'), false);
  await writeFile('test-results/home-sidebar.json',JSON.stringify({syntheticOnly:true,todayFirst:true,sourceAndProgressExpandable:true,highPriorityNoticeVisible:true,eightCompanyDestinations:true,allDestinationActiveStates:true,companySwitchNoStaleLinks:true,mobileDrawerAndKeyboard:true,mobileNoOverflow:true,errorsRemainVisible:true,globalAdminNavigationRetained:true,pageErrors:pageErrors.length,writes,syntheticDocumentWrites:syntheticDocumentWrites.length,syntheticTaxWrites:syntheticTaxWrites.length,productionCalls:0,fullReadRegression:process.env.HOME_NAV_UI_ONLY!=='1'&&!process.env.HOME_FAULT_TABLES},null,2));
  console.log('PASS home layout and sidebar destinations, active company, mobile keyboard, errors visible, zero production or unexpected writes');
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
