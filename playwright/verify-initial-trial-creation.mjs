import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {PGlite} from '@electric-sql/pglite';
import {initial} from '../tests/fixtures/taxExecutionInputs.mjs';
import {setup,identity,callSQL,params,snapshotSQL} from '../tests/fixtures/companyCreationDatabase.mjs';
process.loadEnvFile('.env.local');
const origin='http://127.0.0.1:3120',file=path.resolve('test-results/initial-trial-create-control.json');
const data=structuredClone(initial);data.workspace_company_profiles=[];data.workspace_tax_return_profiles=[];data.prefectures=[{id:13,code:'13',name:'合成都道府県'}];data.municipalities=[{id:1,code:'131130',name:'合成市区町村',prefecture_id:13}];data.rules=[];data.procedures=[];data.jurisdictions=[];
const db=new PGlite();let server,browser,page,logs='',fault='after',geoFault=false,unexpectedWrites=0;const modes=[];
async function sync(){await db.exec('reset role');const s=(await db.query(snapshotSQL)).rows[0].data;await identity(db);data.workspace_companies=s.companies;await writeFile(file,JSON.stringify({data}));return s}
try{
 await db.exec(setup);await identity(db);await mkdir('test-results',{recursive:true});await sync();
 server=spawn(process.execPath,['--import',path.resolve('playwright/planning-read-safety-fetch.mjs'),'node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port','3120'],{env:{...process.env,PLANNING_CONTROL_FILE:file},detached:true,stdio:['ignore','pipe','pipe']});server.stdout.on('data',c=>logs+=c);server.stderr.on('data',c=>logs+=c);
 for(let i=0;i<100;i++){assert.equal(server.exitCode,null);try{if((await fetch(origin+'/admin/login')).ok)break}catch{}await new Promise(r=>setTimeout(r,400))}
 browser=await chromium.launch({headless:true});const context=await browser.newContext();const auth=JSON.parse(readFileSync('playwright/.auth/share-expiry-session.json','utf8'));await context.addCookies(auth.cookies.filter(c=>c.name.includes('auth-token')).map(({name,value})=>({name,value,url:origin,sameSite:'Lax'})));await context.addInitScript(()=>localStorage.setItem('sunboo:analytics-consent','denied'));
 await context.route('**/rest/v1/**',async route=>{
  const req=route.request(),u=new URL(req.url()),table=u.pathname.split('/').at(-1);
  if(table==='create_workspace_company'){
   const v=req.postDataJSON();modes.push(v.p_mode);
   if(v.p_mode==='create'&&fault==='before'){fault='';return route.abort()}
   try{const r=await db.query(callSQL,params(v.p_request_id,v.p_values,v.p_mode));await sync();if(v.p_mode==='create'&&fault==='after'){fault='';return route.abort()}return route.fulfill({json:r.rows})}catch(e){return route.fulfill({status:400,json:{message:e.message,code:e.code}})}
  }
  if(!['GET','HEAD','OPTIONS'].includes(req.method())){unexpectedWrites++;return route.abort()}
  if(geoFault&&table==='municipalities')return route.fulfill({status:500,json:{message:'synthetic failure'}});
  let rows=data[table]??[];for(const[k,v]of u.searchParams)if(v.startsWith('eq.'))rows=rows.filter(r=>String(r[k])===v.slice(3));return route.fulfill({json:req.headers().accept?.includes('vnd.pgrst.object+json')?(rows[0]??null):rows});
 });
 page=await context.newPage();page.setDefaultTimeout(15000);const newCompany=()=>page.goto(origin+'/admin/workspaces/new',{waitUntil:'networkidle'});
 async function fill(name){await page.getByPlaceholder('例：株式会社サンプル').fill(name);const selects=page.getByRole('combobox');await selects.nth(0).selectOption('13');await selects.nth(1).selectOption('131130');await selects.nth(3).selectOption('3')}
 await newCompany();geoFault=true;await page.getByRole('combobox').nth(0).selectOption('13');await page.getByText(/市区町村を取得できません/).waitFor();assert.equal(await page.getByRole('button',{name:'登録する',exact:true}).isDisabled(),true);geoFault=false;await page.getByRole('button',{name:'所在地を再読み込み'}).click();await fill('架空・応答喪失テスト');
 await page.getByRole('button',{name:'登録する',exact:true}).click();await page.getByRole('button',{name:'登録結果を確認',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'登録する',exact:true}).isDisabled(),true);let s=await sync();assert.equal(s.requests.length,1);assert.equal(s.companies.length,4);assert.deepEqual(modes,['create']);
 await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'登録結果を確認',exact:true}).waitFor();assert.equal(await page.getByRole('combobox').nth(1).inputValue(),'131130');assert.deepEqual(modes,['create']);await page.getByRole('button',{name:'登録結果を確認',exact:true}).click();await page.waitForURL(origin+'/admin/workspaces/4');assert.deepEqual(modes,['create','confirm']);assert.equal((await sync()).requests.length,1);
 fault='before';await newCompany();await fill('架空・未確定テスト');await page.getByRole('button',{name:'登録する',exact:true}).click();await page.getByRole('button',{name:'登録結果を確認',exact:true}).waitFor();assert.equal((await sync()).requests.length,1);await page.getByRole('button',{name:'登録結果を確認',exact:true}).click();await page.getByRole('button',{name:'同じ要求IDで再試行'}).waitFor();assert.equal((await sync()).requests.length,1);await page.getByRole('button',{name:'同じ要求IDで再試行'}).click();await page.waitForURL(origin+'/admin/workspaces/5');s=await sync();assert.equal(s.requests.length,2);assert.equal(s.companies.length,5);assert.equal(unexpectedWrites,0);
 await writeFile('test-results/initial-trial-creation.json',JSON.stringify({syntheticDatabase:true,municipalityFailureRecovery:true,committedResponseLoss:true,reloadWithoutAutoResend:true,readConfirmationBeforeRetry:true,sameRequestExplicitRetry:true,requests:s.requests.length,unexpectedWrites,productionBusinessWrites:0},null,2));console.log('Initial trial registration UI + real local SQL transaction, unknown outcome/reload/recovery checks passed');
}catch(e){await writeFile('test-results/initial-trial-create-server.log',logs);if(page)await writeFile('test-results/initial-trial-create-failure.txt',await page.locator('body').innerText());throw e}
finally{await browser?.close();if(server)try{process.kill(-server.pid,'SIGTERM')}catch{}await db.close()}
