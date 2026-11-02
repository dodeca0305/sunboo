import test from 'node:test';
import assert from 'node:assert/strict';
import {loadWorkspaceProcedureStatusesForEditing,saveWorkspaceProcedureStatus,reconcileWorkspaceProcedureStatus,isProcedureStatusSaveIntent,procedureStatusSaveKey,type ProcedureStatusSaveIntent} from './workspaceProcedureStatusData.ts';
const intent:ProcedureStatusSaveIntent={version:1,companyId:23,procedureId:7,dueDate:'2026-12-31',procedureName:'合成手続き',status:'done',previousStatus:'in_progress'};
const row={company_id:23,procedure_id:7,occurrence_key:'2026-12-31',status:'done'};
type Response={data?:unknown;error?:unknown};
function fake(read:Response|Error={data:[row],error:null},save:Response|Error={data:row,error:null}){
 const calls:unknown[][]=[];
 const client={from(table:string){calls.push(['from',table]);const q={
  select(columns:string){calls.push(['select',columns]);return q;},
  eq(column:string,value:unknown){calls.push(['eq',column,value]);return q;},
  upsert(payload:unknown,options:unknown){calls.push(['upsert',payload,options]);return q;},
  async single(){if(save instanceof Error)throw save;return save;},
  then(resolve:(v:Response)=>unknown,reject:(e:Error)=>unknown){return(read instanceof Error?Promise.reject(read):Promise.resolve(read)).then(resolve,reject);},
 };return q;}} as unknown as Parameters<typeof loadWorkspaceProcedureStatusesForEditing>[0];
 return{client,calls};
}
test('完了/進行中/保留/未着手と異なる出現回を保持し、会社を絞る',async()=>{
 const rows=['done','in_progress','on_hold','not_started'].map((status,i)=>({...row,status,occurrence_key:`202${i+6}-12-31`}));
 const{client,calls}=fake({data:rows,error:null});assert.deepEqual(await loadWorkspaceProcedureStatusesForEditing(client,23),{'7:2026-12-31':'done','7:2027-12-31':'in_progress','7:2028-12-31':'on_hold','7:2029-12-31':'not_started'});
 assert.ok(calls.some(c=>JSON.stringify(c)===JSON.stringify(['eq','company_id',23])));
});
test('正常な0行だけを操作可能な空Mapとする',async()=>assert.deepEqual(await loadWorkspaceProcedureStatusesForEditing(fake({data:[],error:null}).client,23),{}));
for(const[name,response]of Object.entries({error:{data:null,error:{message:'failed'}},partial:{data:[row],error:{message:'failed'}},null:{data:null,error:null},missing:{error:null},object:{data:{},error:null},exception:new Error('network')}))test(`取得${name}を未着手にしない`,async()=>assert.equal(await loadWorkspaceProcedureStatusesForEditing(fake(response).client,23),null));
for(const[name,bad]of Object.entries({null:null,company:{...row,company_id:24},procedure:{...row,procedure_id:0},key:{...row,occurrence_key:null},emptyKey:{...row,occurrence_key:''},status:{...row,status:'unknown'}}))test(`不正行${name}で部分データも編集に渡さない`,async()=>assert.equal(await loadWorkspaceProcedureStatusesForEditing(fake({data:[row,bad],error:null}).client,23),null));
test('重複したキーの曖昧な応答を拒否',async()=>assert.equal(await loadWorkspaceProcedureStatusesForEditing(fake({data:[row,row],error:null}).client,23),null));
test('1件の保存は会社・手続き・出現回・状態の返却まで確認',async()=>{
 const{client,calls}=fake();assert.equal(await saveWorkspaceProcedureStatus(client,intent),true);
 assert.deepEqual(calls.find(c=>c[0]==='upsert'),['upsert',row,{onConflict:'company_id,procedure_id,occurrence_key'}]);
});
for(const[name,response]of Object.entries({error:{data:null,error:{message:'failed'}},partial:{data:row,error:{message:'failed'}},null:{data:null,error:null},empty:{data:{},error:null},otherCompany:{data:{...row,company_id:24},error:null},otherOccurrence:{data:{...row,occurrence_key:'2027-12-31'},error:null},otherStatus:{data:{...row,status:'not_started'},error:null},exception:new Error('lost response')}))test(`保存${name}を成功扱いしない`,async()=>assert.equal(await saveWorkspaceProcedureStatus(fake(undefined,response).client,intent),false));
test('再取得で同じ出現回の状態が一致した場合だけ保存済み',async()=>assert.deepEqual(await reconcileWorkspaceProcedureStatus(fake().client,intent),{status:'saved',map:{'7:2026-12-31':'done'}}));
test('別の状態・別の出現回は保存成功ではない',async()=>{
 for(const data of [[{...row,status:'on_hold'}],[{...row,occurrence_key:'2027-12-31'}]])assert.equal((await reconcileWorkspaceProcedureStatus(fake({data,error:null}).client,intent)).status,'different');
});
test('正常な不存在も未着手の保存成功と混同しない',async()=>assert.deepEqual(await reconcileWorkspaceProcedureStatus(fake({data:[],error:null}).client,{...intent,status:'not_started'}),{status:'different',map:{}}));
test('再取得失敗は結果不明を維持',async()=>assert.deepEqual(await reconcileWorkspaceProcedureStatus(fake(new Error('offline')).client,intent),{status:'unavailable'}));
test('保存記録の会社・状態・出現回を確認する',()=>{
 assert.ok(isProcedureStatusSaveIntent(intent,23));assert.ok(procedureStatusSaveKey(23)!==procedureStatusSaveKey(24));
 for(const x of [null,{}, {...intent,companyId:24},{...intent,status:'invalid'},{...intent,previousStatus:'invalid'},{...intent,dueDate:''}])assert.equal(isProcedureStatusSaveIntent(x,23),false);
});
