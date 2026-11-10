import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { initial } from '../tests/fixtures/taxExecutionInputs.mjs';
const origin='http://127.0.0.1:3124', api='https://synthetic-period.supabase.co', file=path.resolve('test-results/tax-period-fixture.json');
const user={id:'00000000-0000-4000-8000-000000000001',email:'synthetic@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
const jwt=Buffer.from(JSON.stringify({sub:user.id,email:user.email,role:'authenticated',aud:'authenticated',exp:4102444800,iat:1793822400})).toString('base64url');
const session={access_token:'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.'+jwt+'.synthetic',refresh_token:'synthetic',expires_in:86400,expires_at:4102444800,token_type:'bearer',user};
const legacy={...initial.workspace_tax_return_profiles[0],fiscal_year:'第12期（登録済み表記）',fiscal_year_start_date:'2024-04-01'};
let f={user,data:{workspace_companies:initial.workspace_companies[0],workspace_company_profiles:initial.workspace_company_profiles[0],prefectures:initial.prefectures[0],municipalities:initial.municipalities[0],workspace_tax_return_profiles:[legacy]}},server,browser,page,logs='',writes=0,unexpected=0,mode='ok',lastPayload;
const errors=[];
const sync=()=>writeFile(file,JSON.stringify(f));
async function visit(){await page.goto(origin+'/admin/workspaces/23/tax-returns',{waitUntil:'networkidle'});}
const year=()=>page.getByRole('combobox',{name:'対象年度（決算日の年・必須）',exact:true});
const date=(name)=>page.getByRole('textbox',{name,exact:true});
async function verifyConsumptionInterimGuide(route,screenshot) {
 const guide=page.getByTestId('consumption-interim-field-guide'), summary=guide.locator(':scope > summary');
 const select=guide.locator('..').getByRole('combobox',{name:'今期、消費税の中間申告は何回でしたか',exact:true});
 const before=await select.inputValue(),count=writes;
 assert.equal(await guide.getAttribute('open'),null);await summary.focus();await page.keyboard.press('Enter');
 const choice=guide.locator('details').filter({has:page.locator(':scope > summary',{hasText:route==='paper'?'中間申告書の控えを見る':'e-Taxの記録を見る'})});
 await choice.locator(':scope > summary').click();
 assert.match(await guide.innerText(),/中間納付税額だけでは回数は分かりません/);
 assert.match(await guide.innerText(),/推測せず税理士に確認し、保存を保留/);
 if(route==='paper') {
  const image=choice.getByRole('img',{name:/中間申告書の上部の見本/});await image.scrollIntoViewIfNeeded();await image.evaluate(el=>el.decode());
  assert.equal(await choice.getByRole('link',{name:'見本を大きく見る（国税庁・PDF・別タブ）',exact:true}).getAttribute('href'),'https://www.nta.go.jp/law/tsutatsu/kobetsu/kansetsu/951225/pdf/youshiki_036.pdf');
 } else {
  assert.match(await choice.innerText(),/お知らせの件数だけで提出済みの回数とは判断しません/);
  assert.equal(await choice.getByRole('link',{name:'申告書の確認方法を見る（e-Tax公式・別タブ）',exact:true}).getAttribute('href'),'https://www.e-tax.nta.go.jp/toiawase/qa/e-taxweb/43.htm');
 }
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await guide.screenshot({path:screenshot});
 await choice.locator(':scope > summary').click();await summary.focus();await page.keyboard.press('Enter');
 assert.equal(await guide.getAttribute('open'),null);assert.equal(await select.inputValue(),before);assert.equal(writes,count);
}
async function verifyCorporateInterimGuide(screenshot) {
 const guide=page.getByTestId('corporate-interim-field-guide'), summary=guide.locator(':scope > summary');
 const buttons=guide.locator('..').getByRole('button');
 const before=await buttons.evaluateAll(nodes=>nodes.map(el=>el.getAttribute('aria-pressed'))),count=writes;
 assert.equal(await guide.getAttribute('open'),null);await summary.focus();await page.keyboard.press('Enter');
 await guide.getByText('左側の「中間申告分の法人税額」を確認してください。',{exact:true}).waitFor();
 assert.match(await guide.innerText(),/空欄・0・書類なしで判断できない場合は、「なし」と決めず/);
 const image=guide.getByRole('img',{name:/中間申告分の法人税額の行を枠/});await image.scrollIntoViewIfNeeded();await image.evaluate(el=>el.decode());
 assert.equal(await guide.getByRole('link',{name:'見本を大きく見る（国税庁・PDF・別タブ）',exact:true}).getAttribute('href'),'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/hojin/shinkoku/itiran2025/pdf/01-01-a.pdf');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await guide.screenshot({path:screenshot});
 await summary.focus();await page.keyboard.press('Enter');assert.equal(await guide.getAttribute('open'),null);
 assert.deepEqual(await buttons.evaluateAll(nodes=>nodes.map(el=>el.getAttribute('aria-pressed'))),before);assert.equal(writes,count);
}
async function verifyCorporateTaxGuide(screenshot) {
 const guide=page.getByTestId('amount-field-guide').filter({has:page.locator('summary',{hasText:'確定法人税額'})}), summary=guide.locator(':scope > summary');
 const amount=page.getByRole('textbox',{name:'確定法人税額の正確な金額',exact:true});
 const before=await amount.inputValue(), count=writes;
 assert.equal(await guide.getAttribute('open'),null);
 await summary.focus();await page.keyboard.press('Enter');
 await page.getByText('左側の「差引所得に対する法人税額」の金額を確認してください。',{exact:true}).waitFor();
 const image=page.getByRole('img',{name:/法人税申告書・別表一の見本/});
 await image.scrollIntoViewIfNeeded();await image.evaluate(el=>el.decode());
 assert.equal(await page.getByRole('link',{name:'見本を大きく見る（国税庁・PDF・別タブ）',exact:true}).getAttribute('href'),'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/hojin/shinkoku/itiran2025/pdf/01-01-a.pdf');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await guide.screenshot({path:screenshot});
 await summary.focus();await page.keyboard.press('Enter');assert.equal(await guide.getAttribute('open'),null);
 assert.equal(await amount.inputValue(),before);assert.equal(writes,count);
}
async function verifyConsumptionTaxGuide(kind,screenshot,unknown=false) {
 const guide=page.getByTestId('amount-field-guide').filter({has:page.locator('summary',{hasText:'確定消費税額'})}), summary=guide.locator(':scope > summary');
 const amount=page.getByRole('textbox',{name:'確定消費税額の正確な金額',exact:true});
 const before=await amount.inputValue(),count=writes;
 assert.equal(await guide.getAttribute('open'),null);await summary.focus();await page.keyboard.press('Enter');
 assert.equal(await guide.getByTestId('consumption-tax-guide-choice').count(),unknown?1:0);
 const choice=guide.locator('details').filter({has:page.locator(':scope > summary',{hasText:kind==='simplified'?'簡易課税用の見本':'一般用の見本'})});
 if(unknown) await choice.locator(':scope > summary').click();
 const visibleForm=unknown?choice:guide;
 await visibleForm.getByText('地方消費税を含めず、中間納付税額を差し引く前の欄です。',{exact:true}).waitFor();
 const image=visibleForm.getByRole('img',{name:/消費税申告書・第一表/});await image.scrollIntoViewIfNeeded();await image.evaluate(el=>el.decode());
 assert.match(await image.getAttribute('alt'),kind==='simplified'?/簡易課税用/:/一般用/);
 assert.equal(await visibleForm.getByRole('link',{name:'見本を大きく見る（国税庁・PDF・別タブ）',exact:true}).getAttribute('href'),'https://www.nta.go.jp/law/tsutatsu/kobetsu/kansetsu/951225/pdf/'+(kind==='simplified'?'youshiki_008.pdf':'youshiki_003.pdf'));
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await guide.screenshot({path:screenshot});
 if(unknown) await choice.locator(':scope > summary').click();
 await summary.focus();await page.keyboard.press('Enter');assert.equal(await guide.getAttribute('open'),null);
 assert.equal(await amount.inputValue(),before);assert.equal(writes,count);
}
try {
 await mkdir('test-results',{recursive:true});await sync();
 server=spawn(process.execPath,['--import',path.resolve('playwright/tax-period-fetch.mjs'),'node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port','3124'],{env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:api,NEXT_PUBLIC_SUPABASE_ANON_KEY:'synthetic-only',NEXT_PUBLIC_GA_MEASUREMENT_ID:'',TAX_PERIOD_FIXTURE:file},detached:true,stdio:['ignore','pipe','pipe']});
 server.stdout.on('data',c=>logs+=c);server.stderr.on('data',c=>logs+=c);
 for(let i=0;i<150;i++){assert.equal(server.exitCode,null);try{if((await fetch(origin+'/admin/login')).ok)break}catch{}await new Promise(r=>setTimeout(r,300))}
 browser=await chromium.launch({headless:true});const c=await browser.newContext({viewport:{width:1280,height:900}});
 await c.addCookies([{name:'sb-synthetic-period-auth-token',value:'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url'),url:origin,sameSite:'Lax'}]);
 await c.addInitScript(()=>{try{localStorage.setItem('sunboo:analytics-consent','denied')}catch{}});
 await c.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());
  if(u.origin===origin){if(req.headers()['next-router-prefetch']||req.headers().purpose==='prefetch')return route.abort();return route.continue()}
  if(u.origin!==api){unexpected++;return route.abort()}
  const table=u.pathname.split('/').at(-1), headers={'access-control-allow-origin':origin};
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{...headers,'access-control-allow-methods':'GET,POST,PATCH,OPTIONS','access-control-allow-headers':req.headers()['access-control-request-headers']??'*'}});
  if(req.method()==='GET')return route.fulfill({json:table==='user'?user:f.data[table]??[],headers});
  assert.equal(table,'workspace_tax_return_profiles');assert.ok(['POST','PATCH'].includes(req.method()));writes++;lastPayload=req.postDataJSON();
  if(mode==='reject')return route.fulfill({status:400,json:{message:'Synthetic save rejection'},headers});
  const row={...legacy,...lastPayload,id:req.method()==='POST'?2:1,company_id:23,updated_at:'2026-11-05T00:00:00Z'};
  f.data.workspace_tax_return_profiles=[row];await sync();
  if(mode==='lost')return route.abort('failed');
  return route.fulfill({json:row,headers});
 });
 page=await c.newPage();page.on('pageerror',e=>errors.push(e.message));await visit();
 await page.getByText('対象期間：2024/04/01 〜 2025/03/31',{exact:true}).waitFor();
 await page.getByRole('button',{name:'編集',exact:true}).click();assert.equal(await year().inputValue(),'existing');
 await page.getByRole('button',{name:'更新する',exact:true}).click();await page.getByRole('button',{name:'新しい申告実績を追加',exact:true}).waitFor();assert.equal(lastPayload.fiscal_year,legacy.fiscal_year);assert.equal(lastPayload.consumption_tax_amount,null);assert.equal(lastPayload.corporate_tax_amount.exactValue,0);
 // New year selected without changing dates. Wrong-year submission never reaches storage/API.
 await page.getByRole('button',{name:'新しい申告実績を追加',exact:true}).click();await year().selectOption('2026');await date('決算日').fill('20250331');await page.getByRole('button',{name:'追加する',exact:true}).click();await page.getByRole('alert').filter({hasText:'対象年度と決算日の年が異なります'}).waitFor();assert.equal(writes,1);
 assert.equal(await date('申告日').getAttribute('placeholder'),'例: 2026/05/31');assert.equal(await date('申告日').inputValue(),'');
 await verifyCorporateTaxGuide('test-results/corporate-tax-guide-desktop.png');
 await verifyCorporateInterimGuide('test-results/corporate-interim-guide-none.png');
 await verifyConsumptionInterimGuide('paper','test-results/consumption-interim-guide-paper.png');
 const consumptionInterim=page.getByRole('combobox',{name:'今期、消費税の中間申告は何回でしたか',exact:true});
 for(const value of ['1','3','11']) {
  await consumptionInterim.selectOption(value);
  await verifyConsumptionInterimGuide('etax','test-results/consumption-interim-guide-etax-'+value+'.png');
 }
 await consumptionInterim.selectOption('none');
 const interim=page.getByTestId('corporate-interim-field-guide').locator('..');
 await interim.getByRole('button',{name:'あり',exact:true}).click();
 await verifyCorporateInterimGuide('test-results/corporate-interim-guide-has.png');
 await interim.getByRole('button',{name:'なし',exact:true}).click();
 await verifyConsumptionTaxGuide('general','test-results/consumption-tax-guide-general.png',true);
 await verifyConsumptionTaxGuide('simplified','test-results/consumption-tax-guide-unknown-simplified.png',true);
 await page.getByRole('button',{name:'課税事業者',exact:true}).click();await page.getByRole('button',{name:'簡易課税',exact:true}).click();
 await verifyConsumptionTaxGuide('simplified','test-results/consumption-tax-guide-simplified.png');
 await page.getByRole('button',{name:'原則課税',exact:true}).click();
 await verifyConsumptionTaxGuide('general','test-results/consumption-tax-guide-known-general.png');
 await page.getByRole('button',{name:'免税事業者',exact:true}).click();
 await date('決算日').fill('20260331');await date('決算の対象期間：開始日').fill('20250401');await page.getByText('対象期間：2025/04/01 〜 2026/03/31',{exact:true}).waitFor();await year().scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/tax-period-desktop.png',fullPage:false});
 // Lost response commits once; reload does not resend and result check restores editing.
 mode='lost';await page.getByRole('button',{name:'追加する',exact:true}).click();await page.getByRole('button',{name:'保存結果を確認',exact:true}).waitFor();assert.equal(writes,2);assert.equal(lastPayload.fiscal_year,'2026年3月期');assert.equal(lastPayload.fiscal_year_start_date,'2025-04-01');assert.equal(lastPayload.fiscal_year_end_date,'2026-03-31');assert.equal(lastPayload.consumption_tax_amount,null);
 await page.reload({waitUntil:'networkidle'});assert.equal(writes,2);assert.equal(await page.getByRole('button',{name:'新しい申告実績を追加',exact:true}).isEnabled(),false);await page.getByRole('button',{name:'保存結果を確認',exact:true}).click();await page.getByText('保存結果を再取得して確認しました。',{exact:true}).waitFor();assert.equal(writes,2);
 await page.getByRole('button',{name:'編集',exact:true}).click();assert.equal(await year().inputValue(),'2026');await page.setViewportSize({width:375,height:812});await year().scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'test-results/tax-period-mobile.png',fullPage:false});
 // Failed profile/actual read prevents editing; normal empty records allow selection.
 for(const table of ['workspace_company_profiles','workspace_tax_return_profiles']){f.failTable=table;await sync();await visit();await page.getByRole('alert').filter({hasText:'取得できませんでした'}).waitFor();assert.equal(await year().count(),0);assert.equal(await page.getByRole('button',{name:'新しい申告実績を追加',exact:true}).count(),0);assert.equal(writes,2)}
 delete f.failTable;f.data.workspace_tax_return_profiles=[];await sync();await page.getByRole('button',{name:'再読み込み',exact:true}).click();await page.getByRole('button',{name:'新しい申告実績を追加',exact:true}).click();assert.equal(await year().inputValue(),'');await year().selectOption('2024');await date('決算日').fill('20240229');await page.getByText('対象期間：開始日未入力 〜 2024/02/29',{exact:true}).waitFor();
 mode='reject';await page.getByRole('button',{name:'追加する',exact:true}).click();await page.getByRole('button',{name:'保存結果を確認',exact:true}).waitFor();assert.equal(writes,3);assert.equal(await page.getByText('保存しました。',{exact:true}).count(),0);await page.reload({waitUntil:'networkidle'});assert.equal(writes,3);await page.getByRole('button',{name:'保存結果を確認',exact:true}).click();await page.getByRole('alert').filter({hasText:'送信内容と異なる登録内容'}).waitFor();assert.equal(f.data.workspace_tax_return_profiles.length,0);
 // The localStorage caller uses the same select and date preview without DB requests.
 await page.goto(origin+'/profile/tax-returns',{waitUntil:'networkidle'});await page.getByRole('button',{name:'新しい申告実績を追加',exact:true}).click();await year().selectOption('2026');await date('決算日').fill('20260915');await date('決算の対象期間：開始日').fill('20260701');await page.getByText('対象期間：2026/07/01 〜 2026/09/15',{exact:true}).waitFor();assert.equal(writes,3);
 assert.equal(await date('申告日').getAttribute('placeholder'),'例: 2026/05/31');assert.equal(await date('申告日').inputValue(),'');
 await verifyCorporateTaxGuide('test-results/corporate-tax-guide-mobile.png');
 await verifyCorporateInterimGuide('test-results/corporate-interim-guide-mobile.png');
 await verifyConsumptionInterimGuide('paper','test-results/consumption-interim-guide-mobile.png');
 await verifyConsumptionTaxGuide('general','test-results/consumption-tax-guide-mobile.png',true);
 assert.equal(unexpected,0);assert.deepEqual(errors,[]);
 await writeFile('test-results/tax-period.json',JSON.stringify({syntheticOnly:true,legacyLabelPreserved:true,zeroAndNullUnchanged:true,yearMismatchNoWrite:true,crossYearPeriodVisible:true,shortPeriodNotInferred:true,lostResponseNoResendAfterReload:true,resultRecovered:true,saveRejectionNoFalseSuccess:true,readFailureBlocked:true,emptyUsable:true,localStorageCaller:true,mobileNoOverflow:true,syntheticWrites:writes,productionCalls:0,pageErrors:errors.length},null,2));console.log('Tax period selection/display, legacy compatibility, read/save protection passed');
}catch(e){await writeFile('test-results/tax-period-server.log',logs);if(page){await writeFile('test-results/tax-period-failure.txt',await page.locator('body').innerText());await page.screenshot({path:'test-results/tax-period-failure.png',fullPage:true})}throw e}finally{await browser?.close();if(server)try{process.kill(-server.pid,'SIGTERM')}catch{}}
