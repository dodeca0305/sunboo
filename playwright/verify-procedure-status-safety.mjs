import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {chromium} from 'playwright-core';
process.loadEnvFile('.env.local');
const companyId=900023,origin='http://127.0.0.1:3115',file=path.resolve('test-results/procedure-status-control.json');
let state={companyId,rows:[],statusRows:[]},mode='success',server,browser,logs='',writes=0,blocked=0,release;
const pendingKey=`sunboo:workspace:${companyId}:pending-procedure-status`,feedbackKey=`sunboo:workspace:${companyId}:completion-feedback`;
async function update(values={}){state={...state,...values};await writeFile(file,JSON.stringify(state));}
try{
 await mkdir('test-results',{recursive:true});await writeFile(file+'.reads','');await update();assert.equal(existsSync(file+'.mutations'),false);
 server=spawn(process.execPath,['--import',path.resolve('playwright/procedure-status-failure-fetch.mjs'),'node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port','3115'],{env:{...process.env,ROADMAP_TAX_CONTROL_FILE:file},detached:true,stdio:['ignore','pipe','pipe']});server.stdout.on('data',c=>{logs+=c;});server.stderr.on('data',c=>{logs+=c;});
 let ready=false;for(let i=0;i<100;i++){assert.equal(server.exitCode,null);try{if((await fetch(origin+'/admin/login',{signal:AbortSignal.timeout(10000)})).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(ready);
 browser=await chromium.launch({headless:true});const context=await browser.newContext();const auth=JSON.parse(readFileSync('playwright/.auth/share-expiry-session.json','utf8'));await context.addCookies(auth.cookies.map(({name,value})=>({name,value,url:origin,sameSite:'Lax'})));await context.addInitScript(()=>localStorage.setItem('sunboo:analytics-consent','denied'));
 await context.route('**/rest/v1/**',async route=>{
  const req=route.request(),u=new URL(req.url()),headers={'access-control-allow-origin':origin};
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{...headers,'access-control-allow-methods':'POST, GET, HEAD, OPTIONS','access-control-allow-headers':req.headers()['access-control-request-headers']??'*'}});
  if(['GET','HEAD'].includes(req.method())){
   if(u.pathname.endsWith('/workspace_procedure_statuses')){
    if(state.statusFailure)return route.fulfill({status:400,json:{message:'Synthetic re-read error'},headers});
    return route.fulfill({json:state.statusRows,headers});
   }return route.fulfill({json:[],headers});
  }
  if(req.method()!=='POST'||!u.pathname.endsWith('/workspace_procedure_statuses')){blocked++;return route.abort();}
  const row=req.postDataJSON();assert.equal(row.company_id,companyId);assert.equal(row.procedure_id,90001);writes++;
  if(mode==='error')return route.fulfill({status:400,json:{message:'Synthetic save error'},headers});
  if(mode==='abort-before')return route.abort('failed');
  if(mode==='pending')await new Promise(r=>{release=r;});
  await update({statusRows:[...state.statusRows.filter(r=>r.procedure_id!==row.procedure_id||r.occurrence_key!==row.occurrence_key),row]});
  if(mode==='lost')return route.abort('failed');
  return route.fulfill({json:row,headers});
 });
 const page=await context.newPage(),url=origin+`/admin/workspaces/${companyId}/roadmap`;
 await page.goto(url,{waitUntil:'networkidle'});assert.ok(!page.url().includes('/admin/login'));
 const statuses=page.getByRole('combobox',{name:'合成納税手続きのステータス',exact:true}),first=statuses.first();await first.waitFor();assert.equal(await first.inputValue(),'not_started');assert.ok(await first.isEnabled());
 assert.equal(readFileSync(file+'.reads','utf8').trim().split('\n').length,1,'Do not fetch unchecked statuses twice');
 const ids=await statuses.evaluateAll(els=>els.map(el=>el.closest('li').id));
 const original=ids.map((cardId,i)=>({company_id:companyId,procedure_id:90001,occurrence_key:cardId.slice(-10),status:['in_progress','done','on_hold'][i]}));
 await update({statusRows:original});await page.reload({waitUntil:'networkidle'});
 async function existing(){assert.deepEqual(await statuses.evaluateAll(els=>els.map(el=>el.value)),['in_progress','done','on_hold']);}
 await existing();
 for(const failure of ['error','throw','null','malformed']){
  await update({statusFailure:failure});await page.reload({waitUntil:'networkidle'});await page.getByRole('alert').filter({hasText:'手続き状態を取得できませんでした'}).waitFor();
  assert.equal(await statuses.count(),0);assert.equal(await page.getByRole('button',{name:/Excelで出力|PDFで出力/}).count(),0);assert.equal(await page.getByText('未着手',{exact:true}).count(),0);assert.ok(await page.getByRole('textbox',{name:'合成納税手続きの支払う予定額（円）',exact:true}).first().isEnabled());assert.equal(writes,0);
  if(failure==='error')await page.screenshot({path:'test-results/procedure-status-load-failure.png',fullPage:true});
  await update({statusFailure:null});await page.getByRole('link',{name:'再読み込み',exact:true}).click();await first.waitFor();await existing();
 }
 // 一方の障害が他方の取得済み操作を誤って止めない。
 await update({mode:'error'});await page.reload({waitUntil:'networkidle'});assert.equal(await page.getByRole('button',{name:'この金額を保存',exact:true}).count(),0);assert.ok(await first.isEnabled());await update({mode:'loaded'});await page.reload({waitUntil:'networkidle'});
 // 確認応答前は元の値を表示。状態再取得でも未保存の支払う予定額（円）は維持する。
 const tax=page.getByRole('textbox',{name:'合成納税手続きの支払う予定額（円）',exact:true}).first();await tax.fill('432100');await tax.blur();mode='pending';await first.selectOption('on_hold');await page.getByText('手続き状態を保存中…',{exact:true}).waitFor();assert.equal(await first.inputValue(),'in_progress');assert.ok(await first.isDisabled());assert.ok(await tax.isEnabled());
 for(let i=0;!release&&i<200;i++)await new Promise(r=>setTimeout(r,10));assert.ok(release);release();await page.waitForFunction(()=>document.querySelector('select[aria-label="合成納税手続きのステータス"]').value==='on_hold'&&!document.querySelector('select[aria-label="合成納税手続きのステータス"]').disabled);await page.waitForLoadState('networkidle');assert.equal((await tax.inputValue()).replaceAll(',',''),'432100');assert.equal(await page.evaluate(k=>sessionStorage.getItem(k),feedbackKey),null);
 for(const failure of ['error','abort-before']){
  mode=failure;await update({statusRows:original});await page.reload({waitUntil:'networkidle'});const before=writes;await first.selectOption('done');await page.getByRole('button',{name:'保存結果を確認',exact:true}).waitFor();assert.equal(await first.inputValue(),'in_progress');assert.ok(await first.isDisabled());assert.equal(page.url(),url);assert.equal(await page.evaluate(k=>sessionStorage.getItem(k),feedbackKey),null);
  await page.reload({waitUntil:'networkidle'});assert.ok(await first.isDisabled());assert.equal(writes,before+1);
  await update({statusFailure:'error'});await page.getByRole('button',{name:'保存結果を確認',exact:true}).click();await page.getByRole('alert').filter({hasText:'保存結果を取得できませんでした'}).waitFor();assert.ok(await first.isDisabled());assert.equal(writes,before+1);
  await update({statusFailure:null});await page.getByRole('button',{name:'保存結果を確認',exact:true}).click();await page.getByRole('alert').filter({hasText:'送信した状態と異なります'}).waitFor();assert.ok(await first.isEnabled());assert.equal(await first.inputValue(),'in_progress');assert.equal(writes,before+1);assert.equal(await page.evaluate(k=>sessionStorage.getItem(k),feedbackKey),null);
 }
 // 保存後の応答喪失: 完了通知は再取得で一致を確認した後だけ出す。
 mode='lost';await update({statusRows:original});await page.reload({waitUntil:'networkidle'});const beforeLost=writes;await first.selectOption('done');await page.getByRole('button',{name:'保存結果を確認',exact:true}).waitFor();assert.equal(await first.inputValue(),'in_progress');assert.equal(await page.evaluate(k=>sessionStorage.getItem(k),feedbackKey),null);await page.reload({waitUntil:'networkidle'});assert.ok(await first.isDisabled());await page.getByRole('button',{name:'保存結果を確認',exact:true}).click();await page.waitForURL(origin+`/admin/workspaces/${companyId}`);await page.getByText('完了しました',{exact:true}).waitFor();assert.equal(writes,beforeLost+1);
 // 元に戻す操作も応答喪失時に成功表示/再送せず、同じ再取得経路で復旧。
 const undo=page.getByRole('button',{name:'元に戻す',exact:true});await undo.click();await page.getByRole('alert').filter({hasText:'元に戻す操作の保存結果'}).waitFor();assert.ok(await undo.isDisabled());assert.equal(await page.getByText('完了しました',{exact:true}).count(),0);const beforeCheck=writes;await page.getByRole('link',{name:'保存結果を確認',exact:true}).click();await first.waitFor();assert.ok(await first.isDisabled());await page.getByRole('button',{name:'保存結果を確認',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('select[aria-label="合成納税手続きのステータス"]').disabled);assert.equal(await first.inputValue(),'in_progress');assert.equal(writes,beforeCheck);
 // 正常な完了→確認済みの通知→元に戻す操作も維持。
 mode='success';await first.selectOption('done');await page.waitForURL(origin+`/admin/workspaces/${companyId}`);await page.getByText('完了しました',{exact:true}).waitFor();await page.getByRole('button',{name:'元に戻す',exact:true}).click();await page.locator('[role="status"].information-card--info').waitFor({state:'detached'});assert.equal(state.statusRows.find(r=>r.occurrence_key===original[0].occurrence_key).status,'in_progress');
 await update({statusRows:[]});await page.goto(url,{waitUntil:'networkidle'});assert.equal(await first.inputValue(),'not_started');assert.ok(await first.isEnabled());assert.equal(await page.evaluate(k=>sessionStorage.getItem(k),pendingKey),null);
 assert.equal(blocked,0);assert.equal(existsSync(file+'.mutations'),false);
 console.log('PASS: read failures never become not-started or exports; retry preserves states; empty success editable; independent tax protections and unsaved tax draft preserved; no optimistic success; lost/error responses persist across reload and block resend; confirmed completion and Undo recover; zero real DB writes.');
}finally{release?.();await browser?.close();if(server?.pid){try{process.kill(-server.pid,'SIGTERM');}catch{}}await writeFile('test-results/procedure-status-server.log',logs);}
