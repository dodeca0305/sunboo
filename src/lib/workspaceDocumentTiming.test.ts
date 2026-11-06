import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_DOCUMENT, validDocumentValues, validDocumentSnapshot, validDocumentIntent, reconcileDocument, saveDocument, readDocument, documentSaveKey, type DocumentIntent } from './workspaceDocumentTiming.ts';
const snapshot = {...EMPTY_DOCUMENT,status:'registered' as const,period_start:'2025-04-01',period_end:'2026-03-31',updated_at:'2026-11-06T01:02:03.123456+00:00'};
const intent: DocumentIntent={version:1,id:'11111111-1111-4111-8111-111111111111',actorId:'synthetic-actor',companyId:23,documentType:'corporate_tax_return',expected:snapshot,values:{...EMPTY_DOCUMENT,status:'needs_update',period_start:'2024-04-01',period_end:'2025-03-31'}};
function fake(response: unknown, throws=false) {
 const calls:unknown[][]=[];
 const chain = new Proxy({}, {get(_target,name) {
  if(name==='then') return (resolve:(value:unknown)=>void,reject:(e:unknown)=>void)=>throws?reject(new Error('network')):resolve(response);
  return (...args:unknown[])=>{calls.push([name,...args]);return chain;};
 }});
 return {calls,client:{from:(table:string)=>{calls.push(['from',table]);return chain;}} as unknown as Parameters<typeof saveDocument>[0]};
}
test('calendar validation distinguishes unknown, leap day and malformed/partial periods',()=>{
 assert.ok(validDocumentValues(EMPTY_DOCUMENT));
 for(const v of [{...EMPTY_DOCUMENT,document_date:'2026-02-30'},{...EMPTY_DOCUMENT,period_start:'2026-01-01'},{...EMPTY_DOCUMENT,period_end:'2026-12-31'},{...EMPTY_DOCUMENT,period_start:'2026-12-31',period_end:'2026-01-01'},{...EMPTY_DOCUMENT,document_date:'0000-01-01'}]) assert.equal(validDocumentValues(v),false);
 assert.ok(validDocumentValues({...EMPTY_DOCUMENT,document_date:'2024-02-29'}));
 assert.ok(validDocumentSnapshot(snapshot));assert.equal(validDocumentSnapshot({...snapshot,updated_at:undefined}),false);
});
test('intent and browser keys isolate actor/company/type; high precision server version is retained',()=>{
 assert.ok(validDocumentIntent(intent,'synthetic-actor',23,'corporate_tax_return'));
 for(const [a,c,t] of [['other',23,'corporate_tax_return'],['synthetic-actor',24,'corporate_tax_return'],['synthetic-actor',23,'consumption_tax_return']] as const) assert.equal(validDocumentIntent(intent,a,c,t),false);
 assert.notEqual(documentSaveKey('a',23,'corporate_tax_return'),documentSaveKey('b',23,'corporate_tax_return'));
 assert.notEqual(documentSaveKey('a',23,'corporate_tax_return'),documentSaveKey('a',24,'corporate_tax_return'));
});
test('conditional update filters company/type/full precision version and all original values',async()=>{
 const returned={...intent.values,updated_at:'2026-11-06T01:02:04.654321+00:00',company_id:23,document_type:intent.documentType};
 const {client,calls}=fake({data:[returned],error:null});assert.equal((await saveDocument(client,intent)).result,'saved');
 for(const call of [['eq','company_id',23],['eq','document_type',intent.documentType],['eq','updated_at',snapshot.updated_at],['eq','status',snapshot.status],['eq','period_start',snapshot.period_start],['eq','period_end',snapshot.period_end],['is','document_date',null]])assert.ok(calls.some(c=>JSON.stringify(c)===JSON.stringify(call)));
 assert.ok(!calls.some(c=>c[0]==='upsert'));
 const insert=fake({data:[returned],error:null});await saveDocument(insert.client,{...intent,expected:null});assert.ok(insert.calls.some(c=>c[0]==='insert'));
});
for(const [name,response,throws,result] of [
 ['zero rows',{data:[],error:null},false,'conflict'],['insert race',{data:null,error:{code:'23505'}},false,'conflict'],['denied',{data:null,error:{code:'42501'}},false,'unavailable'],['null',{data:null,error:null},false,'unavailable'],['wrong company',{data:[{...snapshot,company_id:24,document_type:intent.documentType}],error:null},false,'unavailable'],['throw',null,true,'unavailable'],['partial error',{data:[snapshot],error:{code:'XX000'}},false,'unavailable'],
] as const)test('save '+name+' cannot be success',async()=>assert.equal((await saveDocument(fake(response,throws).client,intent)).result,result));
test('reconcile response loss, no commit, conflict, empty and stale same-millisecond version',()=>{
 assert.equal(reconcileDocument(intent,{...intent.values,updated_at:snapshot.updated_at}),'saved');
 assert.equal(reconcileDocument(intent,snapshot),'unchanged');
 assert.equal(reconcileDocument(intent,{...snapshot,document_date:'2026-10-01'}),'conflict');
 assert.equal(reconcileDocument(intent,null),'conflict');
 assert.equal(reconcileDocument({...intent,expected:null},null),'unchanged');
});
test('fresh read refuses errors, malformed dates and another company/type',async()=>{
 assert.deepEqual(await readDocument(fake({data:null,error:null}).client,23,intent.documentType),{snapshot:null});
 for(const r of [{data:null,error:{}},{data:undefined,error:null},{data:{...snapshot,company_id:24,document_type:intent.documentType},error:null},{data:{...snapshot,company_id:23,document_type:'articles_of_incorporation'},error:null},{data:{...snapshot,company_id:23,document_type:intent.documentType,period_end:null},error:null}])assert.equal(await readDocument(fake(r).client,23,intent.documentType),null);
});
