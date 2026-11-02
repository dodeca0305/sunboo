import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {chromium} from 'playwright-core';
process.loadEnvFile('.env.local');
const origin='http://127.0.0.1:3114',id=900001,file=path.resolve('test-results/rule-save-control.json');
const initial={companyId:900023,rows:[],rules:[{id,name:'合成ルール',description:null,priority:1,is_active:false,updated_at:'2026-01-01T00:00:00+00:00'}],rule_conditions:[{id:1,rule_id:id,field:'event_type_code',operator:'eq',value:'old'}],rule_actions:[{id:1,rule_id:id,action_type:'show_warning',procedure_id:null,payload:{message:'old'}}],procedures:[{id:90001,code:'SYNTHETIC',name:'合成手続き'}]};
let state=structuredClone(initial),mode='success',server,browser,logs='',rpcCalls=0,blocked=0;
async function saveState(update={}){state={...state,...update};await writeFile(file,JSON.stringify(state));}
function rowsFor(url){const t=url.pathname.split('/').at(-1);let rows=state[t]??[];const filter=url.searchParams.get(t==='rules'?'id':'rule_id');if(filter)rows=rows.filter(r=>String(r[t==='rules'?'id':'rule_id'])===filter.slice(3));if(t==='rules'&&url.searchParams.get('name'))rows=rows.filter(r=>r.name===url.searchParams.get('name').slice(3));return rows;}
try{
 await mkdir('test-results',{recursive:true});await saveState();assert.equal(existsSync(file+'.mutations'),false);
 server=spawn(process.execPath,['--import',path.resolve('playwright/rule-save-safety-fetch.mjs'),'node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port','3114'],{env:{...process.env,ROADMAP_TAX_CONTROL_FILE:file},detached:true,stdio:['ignore','pipe','pipe']});
 server.stdout.on('data',x=>{logs+=x;});server.stderr.on('data',x=>{logs+=x;});
 let ready=false;for(let i=0;i<100;i++){assert.equal(server.exitCode,null);try{if((await fetch(origin+'/admin/login',{signal:AbortSignal.timeout(10000)})).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(ready);
 browser=await chromium.launch({headless:true});const context=await browser.newContext();
 const auth=JSON.parse(readFileSync('playwright/.auth/share-expiry-session.json','utf8'));await context.addCookies(auth.cookies.map(({name,value})=>({name,value,url:origin,sameSite:'Lax'})));await context.addInitScript(()=>localStorage.setItem('sunboo:analytics-consent','denied'));
 await context.route('**/rest/v1/**',async route=>{
  const req=route.request(),url=new URL(req.url()),headers={'access-control-allow-origin':origin};
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{...headers,'access-control-allow-methods':'POST, GET, HEAD, OPTIONS','access-control-allow-headers':req.headers()['access-control-request-headers']??'*'}});
  if(['GET','HEAD'].includes(req.method())){if(state.failTable===url.pathname.split('/').at(-1))return route.fulfill({status:400,json:{message:'synthetic read error'},headers});return route.fulfill({json:rowsFor(url),headers});}
  if(req.method()!=='POST'||!url.pathname.endsWith('/rpc/save_admin_rule')){blocked++;return route.abort();}
  rpcCalls++;const body=req.postDataJSON();assert.ok(body.p_rule_id===id||body.p_rule_id===null);
  if(mode==='error')return route.fulfill({status:400,json:{code:'42501',message:'synthetic denial'},headers});
  if(mode==='abort-before')return route.abort('failed');
  const target=body.p_rule_id??900002;
  await saveState({rules:[...state.rules.filter(r=>r.id!==target),{...body.p_rule,id:target,updated_at:'2026-02-01T00:00:00+00:00'}],rule_conditions:[...state.rule_conditions.filter(r=>r.rule_id!==target),...body.p_conditions.map((c,i)=>({...c,id:i+10,rule_id:target}))],rule_actions:[...state.rule_actions.filter(r=>r.rule_id!==target),...body.p_actions.map((a,i)=>({...a,id:i+10,rule_id:target}))]});
  if(mode==='lost')return route.abort('failed');
  return route.fulfill({json:{id:target,updated_at:'2026-02-01T00:00:00+00:00'},headers});
 });
 const page=await context.newPage();const edit=origin+`/admin/rules/${id}`;
 const name=page.getByPlaceholder('例：会社設立：株式会社設立登記',{exact:true});
 const update=page.getByRole('button',{name:'更新する',exact:true});
 await page.goto(edit,{waitUntil:'networkidle'});assert.ok(!page.url().includes('/admin/login'));await name.waitFor();assert.equal(await name.inputValue(),'合成ルール');
 for(const table of ['rules','rule_conditions','rule_actions','procedures'])for(const failure of (table==='rules'?['error','throw']:['error','throw','null'])){
  await saveState({failTable:table,failure});await page.reload({waitUntil:'networkidle'});
  await page.getByRole('alert').filter({hasText:'ルール設定を取得できませんでした'}).waitFor();
  assert.equal(await page.locator('form').count(),0);assert.equal(rpcCalls,0);
  if(table==='rule_conditions'&&failure==='error')await page.screenshot({path:'test-results/rule-load-failure.png',fullPage:true});
  await saveState({failTable:null});await page.getByRole('link',{name:'再読み込み',exact:true}).click();await name.waitFor();assert.equal(await name.inputValue(),'合成ルール');
 }
 await saveState({rule_conditions:[],rule_actions:[]});await page.reload({waitUntil:'networkidle'});assert.ok(await update.isEnabled());assert.ok(await page.getByRole('button',{name:'実行内容を追加',exact:true}).isEnabled());
 state=structuredClone(initial);await saveState();await page.reload({waitUntil:'networkidle'});
 await name.fill('合成変更');await update.click();await page.waitForURL(origin+'/admin/rules');assert.equal(rpcCalls,1);
 // 未反映と権限エラー: 再取得前は再送不可。ページ再読み込み後も保護する。
 for(const saveMode of ['abort-before','error']){
  state=structuredClone(initial);await saveState();await page.goto(edit,{waitUntil:'networkidle'});mode=saveMode;await name.fill('合成変更');const before=rpcCalls;await update.click();
  const check=page.getByRole('button',{name:'保存結果を確認',exact:true});await check.waitFor();assert.ok(await update.isDisabled());assert.equal(rpcCalls,before+1);
  await page.reload({waitUntil:'networkidle'});await check.waitFor();assert.ok(await update.isDisabled());
  await saveState({failTable:'rule_actions'});await check.click();await page.getByRole('alert').filter({hasText:'保存結果を取得できませんでした'}).waitFor();assert.ok(await update.isDisabled());assert.equal(rpcCalls,before+1);
  await saveState({failTable:null});await check.click();await page.getByRole('alert').filter({hasText:'反映されていません'}).waitFor();assert.ok(await update.isEnabled());assert.equal(rpcCalls,before+1);
 }
 // 保存済みなのに応答を失った場合: 再取得で確認し、RPCを再送しない。
 state=structuredClone(initial);await saveState();await page.goto(edit,{waitUntil:'networkidle'});mode='lost';await name.fill('合成変更');const before=rpcCalls;await update.click();await page.getByRole('button',{name:'保存結果を確認',exact:true}).waitFor();await page.reload({waitUntil:'networkidle'});assert.ok(await update.isDisabled());await page.getByRole('button',{name:'保存結果を確認',exact:true}).click();await page.waitForURL(origin+'/admin/rules');assert.equal(rpcCalls,before+1);
 // 新規作成も応答喪失を名称+全設定で確認し、二重作成しない。
 state=structuredClone(initial);await saveState();await page.goto(origin+'/admin/rules/new',{waitUntil:'networkidle'});await name.fill('合成新規');await page.getByRole('button',{name:'条件を削除',exact:true}).click();await page.locator('select').first().selectOption('show_warning');await page.locator('textarea').last().fill('{"message":"new"}');const newBefore=rpcCalls;await page.getByRole('button',{name:'追加する',exact:true}).click();await page.getByRole('button',{name:'保存結果を確認',exact:true}).waitFor();await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'保存結果を確認',exact:true}).click();await page.waitForURL(origin+'/admin/rules');assert.equal(rpcCalls,newBefore+1);assert.equal(state.rules.filter(r=>r.name==='合成新規').length,1);
 // 新規画面も手続き候補を取得できないと編集させない。
 await saveState({failTable:'procedures',failure:'error'});await page.goto(origin+'/admin/rules/new',{waitUntil:'networkidle'});await page.getByRole('alert').filter({hasText:'ルール設定を取得できませんでした'}).waitFor();assert.equal(await page.locator('form').count(),0);
 assert.equal(blocked,0);assert.equal(existsSync(file+'.mutations'),false);
 console.log('PASS: four read sources error/throw/null block edits; valid empty settings editable; single-RPC save; failed/lost responses persist across reload and block resend until re-read; saved/unchanged/new results reconciled without duplicate RPC; zero real DB writes.');
}finally{await browser?.close();if(server?.pid){try{process.kill(-server.pid,'SIGTERM');}catch{}}await writeFile('test-results/rule-save-server.log',logs);}
