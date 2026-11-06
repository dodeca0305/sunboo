// Fully synthetic authentication/data; intentionally never loads real auth storage or .env.
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {initial} from '../tests/fixtures/taxExecutionInputs.mjs';
const api='https://synthetic-home.supabase.co',origin='http://127.0.0.1:3113',companyId=23;
process.env.NEXT_PUBLIC_SUPABASE_URL=api;process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='synthetic-only';process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID='';
const user={id:'00000000-0000-4000-8000-000000000001',email:'synthetic@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
const jwt=Buffer.from(JSON.stringify({sub:user.id,email:user.email,role:'authenticated',aud:'authenticated',exp:4102444800,iat:1793822400})).toString('base64url');
const session={access_token:'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.'+jwt+'.synthetic',refresh_token:'synthetic',expires_in:86400,expires_at:4102444800,token_type:'bearer',user};
const file=path.resolve('test-results/document-timing-control.json');
const data={...structuredClone(initial),workspace_documents:[],workspace_required_document_statuses:[],workspace_procedure_statuses:[],workspace_tax_return_profiles:[],workspace_members:[{role:'member'}],procedures:[],rules:[],jurisdictions:[],procedure_submission_rules:[],submission_jurisdictions:[],submission_offices:[],office_sources:[],workspace_tax_payment_plans:[],workspace_daily_sales_activities:[],workspace_monthly_sales:[],workspace_tax_review_cases:[],tax_controls:[],workspace_tax_control_results:[]};
let control={user,companyId,rows:[],data},server,browser,logs='',mode='success',readFailure=false,unexpected=0,version=0;
const writes=[],pageErrors=[];
const saveControl=async(values={})=>{control={...control,...values};await writeFile(file,JSON.stringify(control));};
const headers={'access-control-allow-origin':origin};
const timestamp=()=>`2026-11-06T01:00:${String(++version).padStart(2,'0')}.123456+00:00`;
try{
 await mkdir('test-results',{recursive:true});await saveControl();assert.equal(existsSync(file+'.mutations'),false);
 server=spawn(process.execPath,['--import',path.resolve('playwright/home-read-safety-fetch.mjs'),'node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port','3113'],{env:{...process.env,ROADMAP_TAX_CONTROL_FILE:file},detached:true,stdio:['ignore','pipe','pipe']});
 server.stdout.on('data',c=>logs+=c);server.stderr.on('data',c=>logs+=c);
 let ready=false;for(let i=0;i<100;i++){assert.equal(server.exitCode,null);try{if((await fetch(origin+'/admin/login',{signal:AbortSignal.timeout(10000)})).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(ready);
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1200,height:900}});
 await context.addCookies([{name:'sb-synthetic-home-auth-token',value:'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url'),url:origin,sameSite:'Lax'}]);
 await context.addInitScript(()=>localStorage.setItem('sunboo:analytics-consent','denied'));
 await context.route('**/*',route=>[origin,api].includes(new URL(route.request().url()).origin)?route.continue():route.abort());
 await context.route(api+'/auth/v1/user',route=>route.fulfill({json:user,headers}));
 await context.route('**/rest/v1/**',async route=>{
  const req=route.request(),url=new URL(req.url()),table=url.pathname.split('/').at(-1);
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{...headers,'access-control-allow-methods':'GET,POST,PATCH,OPTIONS','access-control-allow-headers':req.headers()['access-control-request-headers']??'*'}});
  if(table!=='workspace_documents'){unexpected++;return route.abort();}
  const type=(url.searchParams.get('document_type')??'').replace(/^eq\./,'');
  const row=control.data.workspace_documents.find(r=>r.document_type===type);
  if(req.method()==='GET'){
   if(readFailure)return route.fulfill({status:503,json:{message:'synthetic read exception'},headers});
   assert.equal(url.searchParams.get('company_id'),'eq.23');
   return route.fulfill({json:row??null,headers});
  }
  assert.ok(['POST','PATCH'].includes(req.method()));const payload=req.postDataJSON();writes.push({method:req.method(),payload,query:Object.fromEntries(url.searchParams)});
  if(mode==='reject')return route.fulfill({status:400,json:{code:'23514',message:'synthetic rejected save'},headers});
  if(mode==='network')return route.abort('failed');
  let saved;
  if(req.method()==='POST'){
   assert.equal(payload.company_id,23);assert.ok(payload.document_type);
   if(control.data.workspace_documents.some(r=>r.document_type===payload.document_type))return route.fulfill({status:409,json:{code:'23505'},headers});
   saved={...payload,updated_at:timestamp()};control.data.workspace_documents.push(saved);
  }else{
   assert.equal(url.searchParams.get('company_id'),'eq.23');
   const match=row&&['updated_at','status','period_start','period_end','document_date'].every(field=>url.searchParams.get(field)===(row[field]===null?'is.null':'eq.'+row[field]));
   if(!match)return route.fulfill({json:[],headers});
   Object.assign(row,payload,{updated_at:timestamp()});saved=row;
  }
  await saveControl();if(mode==='lost')return route.abort('failed');
  return route.fulfill({json:[saved],status:200,headers});
 });
 const page=await context.newPage();page.on('pageerror',e=>pageErrors.push(e.message));const url=origin+'/admin/workspaces/23/documents';
 const row=(p,type='corporate_tax_return')=>p.getByTestId('document-editor-'+type);
 async function open(p,type='corporate_tax_return'){const r=row(p,type);await r.locator('summary').click();await r.getByRole('combobox').waitFor();await assertEventually(()=>r.getByRole('combobox').isEnabled());return r;}
 async function assertEventually(f){for(let i=0;i<150;i++){if(await f())return;await new Promise(r=>setTimeout(r,100));}assert.fail('Expected enabled/recovered control');}
 const save=r=>r.getByRole('button',{name:/を保存する$/}).click();
 async function dates(r,start,end){await r.getByLabel('法人税申告書の対象期間の開始日',{exact:true}).fill(start);await r.getByLabel('法人税申告書の対象期間の終了日',{exact:true}).fill(end);}
 await page.goto(url,{waitUntil:'networkidle'});let r=await open(page);assert.equal(await r.getByRole('combobox').inputValue(),'not_registered');assert.match(await r.textContent(),/対象期間：未記録/);
 // Half periods never send; normal save persists status and both dates atomically.
 await dates(r,'2025-04-01','');await save(r);await r.getByRole('alert').waitFor();assert.equal(writes.length,0);
 await dates(r,'2025-04-01','2026-03-31');await r.getByRole('combobox').selectOption('registered');await save(r);await r.getByText('保存しました。',{exact:true}).waitFor();assert.match(await r.textContent(),/2025-04-01 ～ 2026-03-31/);assert.ok(await page.getByText('1/5件登録済み',{exact:true}).count());
 await page.reload({waitUntil:'networkidle'});r=await open(page);assert.equal(await r.getByLabel('法人税申告書の対象期間の開始日',{exact:true}).inputValue(),'2025-04-01');
 await r.getByRole('combobox').selectOption('needs_update');await save(r);await r.getByText('保存しました。',{exact:true}).waitFor();assert.equal(control.data.workspace_documents[0].period_start,'2025-04-01');
 const cert=await open(page,'certificate_of_registered_matters');await cert.getByLabel('登記簿謄本の発行日',{exact:true}).fill('2026-10-20');await cert.getByRole('combobox').selectOption('registered');await save(cert);await cert.getByText('保存しました。',{exact:true}).waitFor();
 // Two tabs loaded before a save: full original state/version rejects a stale overwrite.
 const other=await context.newPage();await other.goto(url,{waitUntil:'networkidle'});const otherRow=await open(other);await r.getByRole('combobox').selectOption('registered');await save(r);await r.getByText('保存しました。',{exact:true}).waitFor();
 await otherRow.getByRole('alert').filter({hasText:'別のタブで操作'}).waitFor();assert.equal(await otherRow.getByRole('combobox').isDisabled(),true);assert.equal(control.data.workspace_documents[0].status,'registered');await other.close();
 // A rejection/network exception with no commit remains blocked after reload until fresh read + explicit same-content retry.
 for(const fail of ['reject','network']){
  await page.reload({waitUntil:'networkidle'});r=await open(page);mode=fail;await r.getByRole('combobox').selectOption('needs_update');await save(r);await r.getByRole('alert').filter({hasText:'保存結果を確認できません'}).waitFor();assert.equal(await r.getByText('保存しました。',{exact:true}).count(),0);const before=writes.length;
  readFailure=true;await page.reload({waitUntil:'networkidle'});await row(page).getByRole('alert').filter({hasText:'保存結果を取得できません'}).waitFor();assert.equal(writes.length,before);
  readFailure=false;await row(page).getByRole('button',{name:'保存結果を再取得する',exact:true}).click();await row(page).getByRole('button',{name:'確認した同じ内容で再試行する',exact:true}).waitFor();assert.equal(writes.length,before);
  mode='success';await row(page).getByRole('button',{name:'確認した同じ内容で再試行する',exact:true}).click();await row(page).getByText('保存しました。',{exact:true}).waitFor();assert.equal(writes.length,before+1);
  await page.reload({waitUntil:'networkidle'});r=await open(page);await r.getByRole('combobox').selectOption('registered');await save(r);await r.getByText('保存しました。',{exact:true}).waitFor();
 }
 // Commit followed by lost response: reload observes saved content and never resends.
 await page.reload({waitUntil:'networkidle'});r=await open(page);mode='lost';await dates(r,'2024-04-01','2025-03-31');await save(r);await r.getByRole('alert').filter({hasText:'保存結果を確認できません'}).waitFor();const before=writes.length;
 await page.reload({waitUntil:'networkidle'});await row(page).getByText('保存済みの内容を再取得して確認しました。',{exact:true}).waitFor();assert.equal(writes.length,before);assert.match(await row(page).textContent(),/2024-04-01 ～ 2025-03-31/);
 mode='success';
 // Fail either edit source: no empty-state editing. Normal empty settings remain editable.
 for(const table of ['workspace_documents','workspace_required_document_statuses'])for(const failure of ['error','throw','null','malformed']){
  await saveControl({failTable:table,failure});await page.reload({waitUntil:'networkidle'});await page.getByRole('alert').filter({hasText:'書類の登録状況を取得'}).waitFor();assert.equal(await page.getByTestId('document-editor-corporate_tax_return').count(),0);assert.equal(writes.length,before);
 }
 await saveControl({failTable:null});await page.reload({waitUntil:'networkidle'});r=await open(page);
 // Browser storage failure stops before sending, rather than losing the recovery key.
 await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('sunboo:document-save:'))throw new DOMException('synthetic quota','QuotaExceededError');return original.call(this,k,v);};});
 await r.getByRole('combobox').selectOption('needs_update');await save(r);await r.getByRole('alert').filter({hasText:'通信・保存確認用'}).waitFor();assert.equal(writes.length,before);
 await page.reload({waitUntil:'networkidle'});await page.setViewportSize({width:375,height:812});r=await open(page);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'test-results/document-timing-mobile.png',fullPage:true});
 assert.equal(pageErrors.length,0);assert.equal(unexpected,0);assert.equal(existsSync(file+'.mutations'),false);
 await writeFile('test-results/document-timing-summary.json',JSON.stringify({syntheticOnly:true,requests:writes.length,productionCalls:0,unexpectedWrites:unexpected,pageErrors,normalAndEmpty:true,partialDateBlocked:true,atomicPeriodAndStatus:true,datesPreserved:true,twoTabsNoOverwrite:true,rejectedAndNetworkExplicitRetry:true,lostResponseReloadNoReplay:true,freshReadFailureBlocked:true,storageFailureNoSend:true,mobileNoOverflow:true},null,2));
 console.log('PASS document timing: synthetic save/rollback/unknown response/reload/two-tab conflict/empty and failed reads/storage failures; no production access.');
}finally{await browser?.close();if(server?.pid){try{process.kill(-server.pid,'SIGTERM');}catch{}}await writeFile('test-results/document-timing-server.log',logs);}
