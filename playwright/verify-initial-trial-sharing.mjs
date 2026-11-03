import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {initial} from '../tests/fixtures/taxExecutionInputs.mjs';
const origin='http://127.0.0.1:3120',token='a'.repeat(64),file=path.resolve('test-results/initial-trial-share-control.json');
const data=structuredClone(initial);
data.prefectures=[{id:13,code:'13',name:'synthetic pref'}];data.municipalities=[{id:1,code:'131130',name:'synthetic city',prefecture_id:13}];
data.procedures=[{id:65,code:'SYNTHETIC_TAX',name:'合成手続き案内',category:'tax',description:'合成の入力に基づく確認理由',timing_type:'fixed_date',timing_data:{month:12,day:31},timing_label:'12/31',office_type:'tax_office',is_active:true,include_in_diagnosis:true,requires_employees:false,requires_officer_term:false,priority:1,official_links:[{label:'合成公式実行先',url:'https://example.invalid/trial'}],procedure_documents:[]}];
data.rules=[];data.jurisdictions=[];data.procedure_submission_rules=[];data.submission_jurisdictions=[];data.submission_offices=[];data.office_sources=[];
const payload={company:data.workspace_companies[0],profile:data.workspace_company_profiles[0],tax_returns:data.workspace_tax_return_profiles,statuses:[],shared_sections:['company','profile','roadmap','tax_returns']};
const update=async(extra={})=>writeFile(file,JSON.stringify({data,sharedPayload:payload,...extra}));
let server,browser,page,logs='',browserWrites=0;
try{
 await mkdir('test-results',{recursive:true});await update();
 server=spawn(process.execPath,['--import',path.resolve('playwright/initial-trial-read-fetch.mjs'),'node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port','3120'],{env:{...process.env,PLANNING_CONTROL_FILE:file},detached:true,stdio:['ignore','pipe','pipe']});server.stdout.on('data',c=>logs+=c);server.stderr.on('data',c=>logs+=c);
 for(let i=0;i<100;i++){assert.equal(server.exitCode,null);try{if((await fetch(origin+'/admin/login')).ok)break}catch{}await new Promise(r=>setTimeout(r,400))}
 browser=await chromium.launch({headless:true});const context=await browser.newContext();await context.addInitScript(()=>localStorage.setItem('sunboo:analytics-consent','denied'));
 await context.route('**/rest/v1/**',r=>{if(!['GET','HEAD','OPTIONS'].includes(r.request().method()))browserWrites++;return r.abort()});
 page=await context.newPage();page.setDefaultTimeout(15000);const visit=()=>page.goto(origin+'/share/'+token,{waitUntil:'networkidle'});
 async function normal(){await page.getByRole('heading',{name:'synthetic',exact:true}).waitFor();await page.getByText('合成手続き案内',{exact:true}).first().waitFor();assert.equal(await page.getByRole('combobox').count(),0);assert.equal(await page.getByRole('button',{name:/保存|完了/}).count(),0);}
 await visit();await normal();
 for(const text of ['理由','担当','期限','完了条件'])assert.ok(await page.getByText(text,{exact:true}).count(),text);await page.getByRole('link',{name:'合成公式実行先'}).first().waitFor();
 for(const failure of ['error','throw']){await update({sharedFailure:failure});await visit();await page.getByText('共有情報を取得できません',{exact:true}).waitFor();assert.equal(await page.getByText(/リンクは無効か/).count(),0);await update();await page.getByRole('button',{name:'再読み込み',exact:true}).click();await page.waitForLoadState('networkidle');await normal()}
 await update({sharedPayload:null});await visit();await page.getByText(/このリンクは無効か/).waitFor();
 await update({sharedPayload:{...payload,shared_sections:['company','roadmap']}});await visit();await page.getByText('予定の算出に必要な入力が共有されていません',{exact:true}).waitFor();assert.equal(await page.getByText('合成手続き案内',{exact:true}).count(),0);
 for(const field of ['profile','tax_returns','statuses']){const p=structuredClone(payload);delete p[field];await update({sharedPayload:p});await visit();await page.getByRole('alert').first().waitFor();await page.getByRole('heading',{name:'synthetic',exact:true}).waitFor();if(field!=='statuses')await page.getByTestId('shared-roadmap-unavailable').waitFor();else{await page.getByText('対応状況を取得できません',{exact:true}).waitFor();assert.equal(await page.getByText('未着手',{exact:true}).count(),0)}}
 await update({failTable:'rules'});await visit();await page.getByTestId('shared-roadmap-unavailable').waitFor();assert.equal(await page.getByText(/手続き予定はありません/).count(),0);
 await update({sharedPayload:{...payload,profile:null,tax_returns:[]}});await visit();await normal();
 assert.equal(browserWrites,0);await page.screenshot({path:'test-results/initial-trial-shared-guidance.png',fullPage:true});await writeFile('test-results/initial-trial-sharing.json',JSON.stringify({syntheticOnly:true,readonlySharedGuidance:true,scopeHeld:true,rpcFailureRecovery:true,missingInputsHeld:true,normalUnregistered:true,browserWrites,productionCalls:0},null,2));console.log('Initial trial shared guidance, scope, failure/recovery, normal missing and readonly checks passed');
}catch(e){await writeFile('test-results/initial-trial-share-server.log',logs);if(page)await writeFile('test-results/initial-trial-share-failure.txt',await page.locator('body').innerText());throw e}
finally{await browser?.close();if(server)try{process.kill(-server.pid,'SIGTERM')}catch{}}
