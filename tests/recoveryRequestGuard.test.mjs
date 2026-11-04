import test from 'node:test';
import assert from 'node:assert/strict';
import { requestRecoverySafely, parseRecoveryAttempt, clearRecoveryRequest, RECOVERY_REQUEST_KEY } from '../src/lib/recoveryRequestGuard.ts';
import { bufferRecoveryVerifier } from '../src/lib/recoveryRequestCookies.ts';
import { createBrowserClient } from '@supabase/ssr';

function fixture() {
 const data=new Map();let time=100000,seq=0,held=false,calls=0,commits=0,status=null;
 const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 const deps={storage,now:()=>time,id:()=>String(++seq),exclusive:async work=>{if(held)return'blocked';held=true;try{return await work()}finally{held=false}},prepare:()=>({client:{auth:{resetPasswordForEmail:async()=>{calls++;if(status==='throw')throw Error('lost');return{error:status}}}},rollback:()=>{},commit:()=>{commits++}})};
 const send=(resend=false)=>requestRecoverySafely(deps,{email:'synthetic@example.invalid',origin:'https://example.invalid',resend});
 return{data,storage,deps,send,advance:()=>{time+=3600001},status:v=>status=v,counts:()=>({calls,commits})};
}
test('sent intent survives reload, another tab and time passage; only explicit resend sends again',async()=>{
 const f=fixture();assert.equal(await f.send(),'sent');assert.equal(await f.send(),'blocked');f.advance();assert.equal(await f.send(),'blocked');assert.equal(await f.send(true),'sent');assert.deepEqual(f.counts(),{calls:2,commits:2});assert.equal(Object.keys(parseRecoveryAttempt(f.storage.getItem(RECOVERY_REQUEST_KEY))).sort().join(','),'attemptedAt,id,notBefore,outcome');
});
test('simultaneous tabs cannot generate two verifiers, and crashed sending intent remains protected',async()=>{
 const f=fixture();let release;f.deps.prepare=()=>({client:{auth:{resetPasswordForEmail:()=>new Promise(r=>release=()=>r({error:null}))}},rollback:()=>{},commit:()=>{}});
 const first=f.send();assert.equal(await f.send(),'blocked');release();assert.equal(await first,'sent');f.data.set(RECOVERY_REQUEST_KEY,JSON.stringify({id:'crash',outcome:'sending',attemptedAt:100000,notBefore:160000}));assert.equal(await f.send(),'blocked');
});
test('429 remains distinct from unknown delivery, rejected sends do not commit; unknown keeps candidate',async()=>{
 for(const [status,result,commits]of [[{status:429},'rate_limited',0],[{status:422},'rejected',0],[{status:503},'unknown',1],[{status:0},'unknown',1],['throw','unknown',1]]){
  const f=fixture();f.status(status);assert.equal(await f.send(),result);assert.equal(f.counts().commits,commits);assert.equal(await f.send(true),'blocked');f.advance();assert.equal(await f.send(),'blocked');
 }
});
test('storage inaccessible, silent write failure or corrupt intent stops before any SDK call',async()=>{
 for(const kind of ['throw','silent','corrupt']){const f=fixture();if(kind==='throw')f.storage.getItem=()=>{throw Error('blocked')};else if(kind==='silent')f.storage.setItem=()=>{};else f.data.set(RECOVERY_REQUEST_KEY,'bad json');assert.equal(await f.send(),'unavailable');assert.deepEqual(f.counts(),{calls:0,commits:0})}
});
test('confirmed update clears only its own request, not a newer tab request',async()=>{
 const f=fixture();await f.send();const first=parseRecoveryAttempt(f.storage.getItem(RECOVERY_REQUEST_KEY)).id;f.advance();await f.send(true);clearRecoveryRequest(f.storage,first);assert.ok(f.storage.getItem(RECOVERY_REQUEST_KEY));clearRecoveryRequest(f.storage,parseRecoveryAttempt(f.storage.getItem(RECOVERY_REQUEST_KEY)).id);assert.equal(f.storage.getItem(RECOVERY_REQUEST_KEY),null);
});
test('buffer handles chunks/removals and rejects cookie conflicts without touching live sessions',()=>{
 const jar=new Map([['verifier.0','old0'],['verifier.1','old1'],['session','session-only']]);const read=()=>[...jar].map(([name,value])=>({name,value}));const write=cs=>cs.forEach(c=>c.value?jar.set(c.name,c.value):jar.delete(c.name));const b=bufferRecoveryVerifier(read,write,'verifier');b.cookies.setAll([{name:'verifier.0',value:'',options:{maxAge:0}},{name:'verifier.1',value:'',options:{maxAge:0}},{name:'verifier',value:'new',options:{}},{name:'session',value:'not-persisted',options:{}}]);assert.equal(jar.get('verifier.0'),'old0');b.commit();assert.equal(jar.get('verifier'),'new');assert.equal(jar.has('verifier.0'),false);assert.equal(jar.get('session'),'session-only');const c=bufferRecoveryVerifier(read,write,'verifier');c.cookies.setAll([{name:'verifier',value:'another',options:{}}]);jar.delete('verifier');assert.throws(()=>c.commit());assert.equal(jar.has('verifier'),false);
});
test('real SDK rejection and transport cleanup leave the live earlier verifier intact; unknown can commit generated one',async()=>{
 const jar=new Map();let status=200;const read=()=>[...jar].map(([name,value])=>({name,value}));const write=cs=>cs.forEach(c=>c.value&&c.options.maxAge!==0?jar.set(c.name,c.value):jar.delete(c.name));
 const prepare=()=>{const b=bufferRecoveryVerifier(read,write,'sb-synthetic-auth-token-code-verifier');const client=createBrowserClient('https://synthetic.supabase.co','synthetic-public',{isSingleton:false,cookies:b.cookies,auth:{autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async()=>{b.commit();if(status==='lost')throw Error('lost');return new Response(JSON.stringify(status===200?{}:{code:'over_email_send_rate_limit',msg:'synthetic rejection'}),{status,headers:{'content-type':'application/json'}})}}});return{client,commit:b.commit,rollback:b.rollback}};
 const f=fixture();f.deps.prepare=prepare;assert.equal(await f.send(),'sent');const original=jar.get('sb-synthetic-auth-token-code-verifier');assert.ok(original);f.advance();status=429;assert.equal(await f.send(true),'rate_limited');assert.equal(jar.get('sb-synthetic-auth-token-code-verifier'),original);f.advance();status=422;assert.equal(await f.send(true),'rejected');assert.equal(jar.get('sb-synthetic-auth-token-code-verifier'),original);f.advance();status='lost';assert.equal(await f.send(true),'unknown');assert.ok(jar.get('sb-synthetic-auth-token-code-verifier'));assert.notEqual(jar.get('sb-synthetic-auth-token-code-verifier'),original);
});

test('failed cookie commit or final intent write never claims a successful send',async()=>{
 const f=fixture();f.deps.prepare=()=>({client:{auth:{resetPasswordForEmail:async()=>({error:null})}},rollback:()=>{},commit:()=>{throw Error('blocked cookies')}});assert.equal(await f.send(),'unknown');assert.equal(await f.send(),'blocked');
 const g=fixture();let writes=0;const original=g.storage.setItem;g.storage.setItem=(k,v)=>{if(++writes>1)throw Error('storage failed after send');original(k,v)};assert.equal(await g.send(),'unavailable');assert.equal(parseRecoveryAttempt(g.storage.getItem(RECOVERY_REQUEST_KEY)).outcome,'sending');assert.equal(await g.send(),'blocked');assert.equal(g.counts().calls,1);
});

test('confirmed service rate limit still holds for an hour if cookie restoration cannot be confirmed',async()=>{
 const f=fixture();f.deps.prepare=()=>({client:{auth:{resetPasswordForEmail:async()=>({error:{status:429}})}},commit:()=>{},rollback:()=>{throw Error('cookie conflict')}});assert.equal(await f.send(),'unknown');const a=parseRecoveryAttempt(f.storage.getItem(RECOVERY_REQUEST_KEY));assert.equal(a.notBefore-a.attemptedAt,3600000);assert.equal(await f.send(true),'blocked');
});
