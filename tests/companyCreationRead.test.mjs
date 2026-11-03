import test from 'node:test';
import assert from 'node:assert/strict';
import {createOrConfirmCompany,validCompanyCreationIntent,loadCreationMunicipalities} from '../src/lib/workspaceCompanyCreation.ts';
const intent={requestId:'11111111-1111-4111-8111-111111111111',values:{name:'架空会社',prefecture_code:'13',municipality_code:'131130',corporate_type:'kabushiki',fiscal_month:3}};
const ack=(status='created',id=23)=>({data:[{request_id:intent.requestId,result_status:status,company_id:id}],error:null});
test('company creation acknowledges only a matching, complete response',async()=>{
 for(const status of ['created','existing'])assert.deepEqual(await createOrConfirmCompany({rpc:async()=>ack(status)},intent,'create'),{status:'saved',companyId:23});
 for(const status of ['not_found','deleted'])assert.deepEqual(await createOrConfirmCompany({rpc:async()=>ack(status,null)},intent,'confirm'),{status});
 for(const result of [{data:null,error:null},{data:[],error:null},{...ack(),error:{}},ack('created',null),ack('created',0),ack('not_found',23),ack('wrong'),{data:[{...ack().data[0],request_id:crypto.randomUUID()}],error:null}])assert.deepEqual(await createOrConfirmCompany({rpc:async()=>result},intent,'create'),{status:'unavailable'});
 assert.deepEqual(await createOrConfirmCompany({rpc:async()=>{throw Error('lost response')}},intent,'create'),{status:'unavailable'});
});
test('unknown creation result never automatically resends',async()=>{let calls=[];const client={rpc:async(name,args)=>{calls.push(args.p_mode);return calls.length===1?{data:null,error:{}}:ack('existing')}};assert.equal((await createOrConfirmCompany(client,intent,'create')).status,'unavailable');assert.deepEqual(calls,['create']);assert.equal((await createOrConfirmCompany(client,intent,'confirm')).status,'saved');assert.deepEqual(calls,['create','confirm']);});
test('invalid persisted input does not reach the server',async()=>{let count=0;for(const v of [null,{...intent,requestId:'invalid'},{...intent,values:{...intent.values,fiscal_month:0}},{...intent,values:{...intent.values,name:' '}}]){assert.equal(validCompanyCreationIntent(v),false);assert.equal((await createOrConfirmCompany({rpc:async()=>{count++}},v,'create')).status,'unavailable')}assert.equal(count,0)});
const geo=(p,m)=>({from(table){const r=table==='prefectures'?p:m;const chain={select(){return chain},eq(){return chain},maybeSingle(){return Promise.resolve(r)},order(){return Promise.resolve(r)}};return chain}});
test('municipality failure is distinct from a successfully empty list',async()=>{const p={data:{id:13,code:'13'},error:null};assert.deepEqual(await loadCreationMunicipalities(geo(p,{data:[],error:null}),'13'),[]);for(const r of [{data:null,error:{}},{data:null,error:null},{data:[{code:'x',name:'wrong',prefecture_id:40}],error:null}])assert.equal(await loadCreationMunicipalities(geo(p,r),'13'),null);assert.equal(await loadCreationMunicipalities({from(){throw Error()}},'13'),null);});
