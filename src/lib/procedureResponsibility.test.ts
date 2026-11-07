import test from 'node:test';
import assert from 'node:assert/strict';
import { parseResponsibilityRows, loadResponsibilities, saveResponsibility, validResponsibilityIntent, sameResponsibilityRow, mergeResponsibilityRefresh } from './procedureResponsibility.ts';
const row={company_id:23,procedure_id:61,occurrence_key:'2027-05-31',status:'done' as const,responsible_role:null,updated_at:'2026-11-07T01:00:00.123456+00:00'};
const intent={version:1 as const,companyId:23,procedureId:61,dueDate:'2027-05-31',role:'tax_accountant' as const,previous:row};
function client(result:unknown, throws=false, company:unknown={data:{id:23},error:null}){const calls:unknown[][]=[];
 function chain(r:unknown){const q:Record<string,unknown>={};for(const method of ['select','eq','update','insert','maybeSingle'])q[method]=(...args:unknown[])=>{calls.push([method,...args]);return q;};q.then=(ok:(r:unknown)=>unknown,bad:(e:unknown)=>unknown)=>throws?Promise.reject(Error('network')).then(ok,bad):Promise.resolve(r).then(ok,bad);return q;}
 return {calls,from:(...a:unknown[])=>{calls.push(['from',...a]);return chain(a[0]==='workspace_companies'?company:result);}}}

test('role loads distinguish empty, null, malformed, other company, duplicate and unexpected role',async()=>{
 assert.deepEqual(parseResponsibilityRows([],23),{});
 for(const data of [null,[{...row,company_id:24}],[{...row,responsible_role:'administrator'}],[{...row,updated_at:'bad'}],[{...row,updated_at:'2026-11-07'}],[{...row,occurrence_key:'2027-99-99'}],[row,row]])assert.equal(parseResponsibilityRows(data,23),null);
 assert.equal((await loadResponsibilities(client({data:[row],error:null}) as never,23))?.['61:2027-05-31'].status,'done');
 assert.equal(await loadResponsibilities(client({data:null,error:null}) as never,23),null);
 assert.equal(await loadResponsibilities(client({},true) as never,23),null);
 assert.equal(await loadResponsibilities(client({data:[],error:null},false,{data:null,error:null}) as never,23),null);
 assert.equal(await loadResponsibilities(client({data:[],error:null},false,{data:{id:24},error:null}) as never,23),null);
 assert.equal(await loadResponsibilities(client({data:[],error:{message:'denied'}}) as never,23),null);
});
test('existing role save updates only role and compares exact microsecond version and all key fields',async()=>{
 const c=client({data:{...row,responsible_role:'tax_accountant'},error:null});assert.equal(await saveResponsibility(c as never,intent),true);
 assert.deepEqual(c.calls.find(v=>v[0]==='update'),['update',{responsible_role:'tax_accountant'}]);
 for(const [column,value]of [['company_id',23],['procedure_id',61],['occurrence_key','2027-05-31'],['updated_at',row.updated_at]])assert.ok(c.calls.some(v=>v[0]==='eq'&&v[1]===column&&v[2]===value));
 assert.equal(c.calls.some(v=>v[0]==='insert'),false);
});
test('insert is explicit and defaults status, never overwrites conflicting row; unknown response is not success',async()=>{
 const c=client({data:{...row,status:'not_started',responsible_role:'tax_accountant'},error:null});assert.equal(await saveResponsibility(c as never,{...intent,previous:null}),true);
 assert.deepEqual(c.calls.find(v=>v[0]==='insert'),['insert',{company_id:23,procedure_id:61,occurrence_key:'2027-05-31',responsible_role:'tax_accountant'}]);
 for(const result of [{data:null,error:null},{data:null,error:{code:'23505'}},{data:{...row,company_id:24,responsible_role:'tax_accountant'},error:null},{data:{...row,status:'not_started',responsible_role:'tax_accountant'},error:null}])assert.equal(await saveResponsibility(client(result) as never,intent),false);
 assert.equal(await saveResponsibility(client({},true) as never,intent),false);
});
test('pending intent is company and occurrence bound; concurrent status or role change is stale',()=>{
 assert.equal(validResponsibilityIntent(intent,23),true);assert.equal(validResponsibilityIntent(intent,24),false);
 assert.equal(validResponsibilityIntent({...intent,previous:{...row,procedure_id:62}},23),false);
 assert.equal(validResponsibilityIntent({...intent,role:'admin'},23),false);
 assert.equal(sameResponsibilityRow(row,{...row,status:'not_started'}),false);
 assert.equal(sameResponsibilityRow(row,{...row,updated_at:'2026-11-07T01:00:00.123457+00:00'}),false);
 assert.equal(sameResponsibilityRow(null,row),false);
});

test('late refresh cannot replace a confirmed role with an older version, including microseconds',()=>{
 const key='61:2027-05-31',newer={...row,responsible_role:'tax_accountant' as const,updated_at:'2026-11-07T01:00:00.123457+00:00'};
 assert.equal(mergeResponsibilityRefresh({[key]:newer},{[key]:row})?.[key],newer);
 assert.equal(mergeResponsibilityRefresh({[key]:row},{[key]:newer})?.[key],newer);
 assert.equal(mergeResponsibilityRefresh({[key]:newer},{})?.[key],newer);
 assert.equal(mergeResponsibilityRefresh({[key]:newer},null),null);
});
