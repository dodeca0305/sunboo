import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { chromium } from 'playwright-core';
process.loadEnvFile('.env.local');
const origin='http://127.0.0.1:3122',authOrigin=process.env.NEXT_PUBLIC_SUPABASE_URL;
const requestKey='sunboo:password-recovery-request:v1';
const user={id:'00000000-0000-4000-8000-000000000001',email:'synthetic@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
const payload=Buffer.from(JSON.stringify({sub:user.id,email:user.email,aud:'authenticated',role:'authenticated',exp:4102444800,iat:1793760000})).toString('base64url');
const session={access_token:'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.'+payload+'.synthetic',refresh_token:'synthetic',expires_in:3600,token_type:'bearer',user};
let server,browser,currentPage,logs='',requests=0,exchanges=0,passwordUpdates=0,businessWrites=0,unexpected=0,mode='ok',latestCode,hold,release;
const codes=new Map(),contexts=[],errors=[];
const hash=s=>createHash('sha256').update(s).digest('base64url');
async function context(){const c=await browser.newContext();contexts.push(c);c.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));await c.route('**/*',async r=>{
 const req=r.request(),u=new URL(req.url()),m=req.method();if(u.origin===origin)return r.continue();if(u.origin!==authOrigin){unexpected++;return r.abort()}
 const headers={'access-control-allow-origin':origin,'access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PUT,OPTIONS'};
 if(m==='OPTIONS')return r.fulfill({status:204,headers});
 if(u.pathname==='/auth/v1/recover'){
  requests++;const body=req.postDataJSON();assert.equal(body.email,user.email);assert.equal(u.searchParams.get('redirect_to'),origin+'/admin/reset-password');assert.equal(body.code_challenge_method,'s256');
  if(mode==='hold')await hold;
  if(mode==='429'||mode==='422')return r.fulfill({status:Number(mode),headers,json:{code:mode==='429'?'over_email_send_rate_limit':'validation_failed',msg:'synthetic refusal'}});
  latestCode='synthetic-code-'+requests;codes.set(latestCode,body.code_challenge);
  if(mode==='lost')return r.abort();
  return r.fulfill({headers,json:{}});
 }
 if(u.pathname==='/auth/v1/token'){
  exchanges++;assert.equal(u.searchParams.get('grant_type'),'pkce');const body=req.postDataJSON();const challenge=codes.get(body.auth_code);
  if(!challenge||hash(body.code_verifier)!==challenge)return r.fulfill({status:400,headers,json:{code:'bad_code_verifier',msg:'synthetic verifier mismatch'}});
  codes.delete(body.auth_code);return r.fulfill({headers,json:session});
 }
 if(u.pathname==='/auth/v1/user'&&m==='GET')return r.fulfill({headers,json:user});
 if(u.pathname==='/auth/v1/user'&&m==='PUT'){passwordUpdates++;return r.fulfill({headers,json:user})}
 if(u.pathname==='/auth/v1/logout')return r.fulfill({headers,status:204});
 if(u.pathname.startsWith('/rest/v1/')){if(!['GET','HEAD'].includes(m))businessWrites++;return r.abort()}
 unexpected++;return r.abort();
});return c}
async function forgot(c){const p=await c.newPage();currentPage=p;p.setDefaultTimeout(15000);await p.goto(origin+'/admin/forgot-password',{waitUntil:'networkidle'});return p}
const sendButton=p=>p.getByRole('button',{name:'再設定メールを送る',exact:true});
async function send(p){await p.getByRole('textbox',{name:'登録メールアドレス',exact:true}).fill(user.email);await sendButton(p).click()}
async function eligible(p){await p.evaluate(key=>{const a=JSON.parse(localStorage.getItem(key));a.attemptedAt=Date.now()-3601000;a.notBefore=Date.now()-1;localStorage.setItem(key,JSON.stringify(a));window.dispatchEvent(new Event('sunboo:recovery-request'))},requestKey);await p.getByRole('checkbox').waitFor();await p.getByRole('checkbox').check()}
async function change(p){await p.getByRole('textbox',{name:'新しいパスワード（12文字以上）',exact:true}).fill('synthetic-test-Password1!');await p.getByRole('textbox',{name:'新しいパスワード（確認）',exact:true}).fill('synthetic-test-Password1!');await p.getByRole('button',{name:'パスワードを変更する',exact:true}).click();await p.getByRole('status').filter({hasText:'パスワードを変更しました'}).waitFor()}
try{
 await mkdir('test-results',{recursive:true});server=spawn(process.execPath,['--import',path.resolve('playwright/password-recovery-fetch.mjs'),'node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port','3122'],{env:process.env,detached:true,stdio:['ignore','pipe','pipe']});server.stdout.on('data',c=>logs+=c);server.stderr.on('data',c=>logs+=c);
 for(let i=0;i<150;i++){assert.equal(server.exitCode,null);try{if((await fetch(origin+'/admin/forgot-password')).ok)break}catch{}await new Promise(r=>setTimeout(r,300))}
 browser=await chromium.launch({headless:true});
 // Two prepared tabs submit together. One request only; no queued automatic send.
 const c=await context(),a=await forgot(c),b=await forgot(c);await a.getByRole('textbox',{name:'登録メールアドレス',exact:true}).fill(user.email);await b.getByRole('textbox',{name:'登録メールアドレス',exact:true}).fill(user.email);hold=new Promise(r=>release=r);mode='hold';const n=requests;await Promise.all([a,b].map(p=>p.evaluate(()=>document.querySelector('form').requestSubmit())));await a.waitForFunction(()=>JSON.parse(localStorage.getItem('sunboo:password-recovery-request:v1'))?.outcome==='sending');assert.equal(requests,n+1);release();mode='ok';await a.waitForFunction(()=>JSON.parse(localStorage.getItem('sunboo:password-recovery-request:v1'))?.outcome==='sent');const firstCode=latestCode;await a.reload({waitUntil:'networkidle'});assert.equal(await a.getByRole('button',{name:'新しい再設定メールを依頼する'}).isEnabled(),false);assert.equal(await b.getByRole('button',{name:'新しい再設定メールを依頼する'}).isEnabled(),false);assert.equal(requests,n+1);
 // Deliberate resend is rejected by service: original code must still exchange.
 await eligible(a);mode='429';await a.getByRole('textbox',{name:'登録メールアドレス',exact:true}).fill(user.email);await a.getByRole('button',{name:'新しい再設定メールを依頼する'}).click();await a.getByRole('status').filter({hasText:'認証サービスのメール送信制限'}).waitFor();await a.reload({waitUntil:'networkidle'});assert.equal(await a.getByRole('button',{name:'新しい再設定メールを依頼する'}).isEnabled(),false);await a.screenshot({path:'test-results/recovery-resend-rate-limit.png',fullPage:true});
 const callback=await c.newPage();currentPage=callback;await callback.goto(origin+'/admin/reset-password?code='+firstCode,{waitUntil:'networkidle'});await callback.getByRole('textbox',{name:'新しいパスワード（12文字以上）',exact:true}).waitFor();await change(callback);await a.waitForFunction(()=>localStorage.getItem('sunboo:password-recovery-request:v1')===null);assert.equal(requests,n+2);
 // Delivery accepted but response lost: preserve generated candidate, no reload retry.
 const c2=await context(),lost=await forgot(c2);mode='lost';await send(lost);await lost.getByRole('status').filter({hasText:'送信結果を確認できません'}).waitFor();const lostCode=latestCode,lostCount=requests;await lost.reload({waitUntil:'networkidle'});assert.equal(await lost.getByRole('button',{name:'新しい再設定メールを依頼する'}).isEnabled(),false);assert.equal(requests,lostCount);const recovery=await c2.newPage();currentPage=recovery;await recovery.goto(origin+'/admin/reset-password?code='+lostCode,{waitUntil:'networkidle'});await recovery.getByRole('textbox',{name:'新しいパスワード（12文字以上）',exact:true}).waitFor();mode='ok';await change(recovery);
 // Storage/locking unavailable and an interrupted sending record fail closed.
 const c3=await context();await c3.addInitScript(()=>{Object.defineProperty(navigator,'locks',{value:undefined})});const noLock=await forgot(c3);const oldCount=requests;await send(noLock);await noLock.getByRole('status').filter({hasText:'複数タブの送信を安全に制御できません'}).waitFor();assert.equal(requests,oldCount);
 const c4=await context();await c4.addInitScript(()=>{const original=Storage.prototype.getItem;Storage.prototype.getItem=function(k){if(k==='sunboo:password-recovery-request:v1')throw Error('synthetic storage blocked');return original.call(this,k)}});const noStore=await forgot(c4);assert.equal(await sendButton(noStore).isEnabled(),false);assert.equal(requests,oldCount);
 const c5=await context(),crash=await forgot(c5);await crash.evaluate(key=>{localStorage.setItem(key,JSON.stringify({id:'synthetic-interrupted',outcome:'sending',attemptedAt:Date.now(),notBefore:Date.now()+60000}));window.dispatchEvent(new Event('sunboo:recovery-request'))},requestKey);await crash.reload({waitUntil:'networkidle'});assert.equal(await crash.getByRole('button',{name:'新しい再設定メールを依頼する'}).isEnabled(),false);assert.equal(requests,oldCount);
 assert.equal(businessWrites,0);assert.equal(unexpected,0);assert.deepEqual(errors,[]);
 await writeFile('test-results/recovery-resend-safety.json',JSON.stringify({syntheticOnly:true,simultaneousTabsOneRequest:true,reloadAndTabGuard:true,explicitResendOnly:true,rejectedResendOriginalCodeExchanged:true,lostResponseCandidateExchanged:true,confirmedPasswordClearsOnlyIntent:true,storageOrLockUnavailableNoRequest:true,interruptedIntentNoRequest:true,actualPkceChallengeVerified:true,syntheticRequests:requests,exchanges,passwordUpdates,businessWrites,realEmailSent:false,realPasswordsChanged:false,pageErrors:errors.length},null,2));console.log('Recovery resend safety: real SDK PKCE, 429 original email, unknown response, concurrent tabs, reload and unavailable storage/locks passed');
}catch(e){await writeFile('test-results/recovery-resend-server.log',logs);if(currentPage)await writeFile('test-results/recovery-resend-failure.txt',await currentPage.locator('body').innerText());throw e}finally{for(const c of contexts)await c.close();await browser?.close();if(server)try{process.kill(-server.pid,'SIGTERM')}catch{}}
