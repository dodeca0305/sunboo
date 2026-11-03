import test from'node:test';import assert from'node:assert/strict';
import{profileSnapshot,validProfileSaveIntent,saveCompanyProfile,reconcileProfileSave}from'../src/lib/workspaceProfileSave.ts';
import{initial,fixture}from'./fixtures/taxExecutionInputs.mjs';
const expected=profileSnapshot(initial.workspace_companies[0],initial.workspace_company_profiles[0]);
const intent={version:1,companyId:23,expected,values:{...expected,companyFields:{...expected.companyFields,fiscal_month:9}}};
test('profile acknowledgement must match company and every desired value',async()=>{
 assert.equal(validProfileSaveIntent(intent,23),true);
 const ack={company_id:23,result_status:'saved',snapshot:intent.values};
 assert.equal(await saveCompanyProfile({rpc:async()=>({data:ack,error:null})},intent),'saved');
 for(const data of [null,{...ack,company_id:24},{...ack,result_status:'unknown'},{...ack,snapshot:expected}])assert.equal(await saveCompanyProfile({rpc:async()=>({data,error:null})},intent),'unavailable');
 assert.equal(await saveCompanyProfile({rpc:async()=>({data:null,error:{code:'40001'}})},intent),'conflict');
});
test('unknown response never resends and read-only reconciliation distinguishes saved/unchanged/conflict',async()=>{
 let count=0;assert.equal(await saveCompanyProfile({rpc:async()=>{count++;throw Error('lost response')}},intent),'unavailable');assert.equal(count,1);
 const f=fixture();assert.equal(await reconcileProfileSave(f.client,intent),'unchanged');f.data.workspace_companies[0].fiscal_month=9;assert.equal(await reconcileProfileSave(f.client,intent),'saved');f.data.workspace_company_profiles[0].employee_count=99;assert.equal(await reconcileProfileSave(f.client,intent),'conflict');assert.equal(count,1);
});
for(const table of ['workspace_companies','workspace_company_profiles'])test('profile confirmation failure '+table+' stays unknown',async()=>{for(const failure of ['error','throw','malformed']){const f=fixture({failTable:table,failure});assert.equal(await reconcileProfileSave(f.client,intent),'unavailable')}});
test('unregistered profile stays distinct from a registered profile with defaults',()=>{const empty=profileSnapshot(initial.workspace_companies[0],null);assert.equal(empty.profileFields,null);assert.equal(validProfileSaveIntent({...intent,expected:empty},23),true);assert.equal(validProfileSaveIntent({...intent,values:empty},23),false);assert.equal(validProfileSaveIntent(intent,24),false)});
