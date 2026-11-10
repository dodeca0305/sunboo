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
async function verifyCorporateTaxGuide(screenshot) {
 const guide=page.getByTestId('amount-field-guide'), summary=guide.locator('summary');
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
 assert.equal(unexpected,0);assert.deepEqual(errors,[]);
 await writeFile('test-results/tax-period.json',JSON.stringify({syntheticOnly:true,legacyLabelPreserved:true,zeroAndNullUnchanged:true,yearMismatchNoWrite:true,crossYearPeriodVisible:true,shortPeriodNotInferred:true,lostResponseNoResendAfterReload:true,resultRecovered:true,saveRejectionNoFalseSuccess:true,readFailureBlocked:true,emptyUsable:true,localStorageCaller:true,mobileNoOverflow:true,syntheticWrites:writes,productionCalls:0,pageErrors:errors.length},null,2));console.log('Tax period selection/display, legacy compatibility, read/save protection passed');
}catch(e){await writeFile('test-results/tax-period-server.log',logs);if(page){await writeFile('test-results/tax-period-failure.txt',await page.locator('body').innerText());await page.screenshot({path:'test-results/tax-period-failure.png',fullPage:true})}throw e}finally{await browser?.close();if(server)try{process.kill(-server.pid,'SIGTERM')}catch{}}
