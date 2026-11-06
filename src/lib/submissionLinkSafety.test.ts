import test from 'node:test';
import assert from 'node:assert/strict';
import type { ScheduleProcedure } from './scheduleProcedure';
import { protectSubmissionDestination, isKnownUnavailableSubmissionUrl, isTokyoSpecialWard } from './submissionLinkSafety.ts';
import { buildRoadmapSubmissionInfo } from './roadmapSubmissionInfo.ts';
import { buildRoadmapExportRows } from './roadmapExport.ts';
import { trialExecutionLinks } from './trialActionGuide.ts';
const bad = 'https://www.city.shibuya.tokyo.jp/kurashi/zeikin/hojin/';
const tokyo = {prefectureCode:'13',municipalityCode:'131130'};
const office = {name:'旧区役所の共通窓口',official_url:bad,website_url:bad,fallback_url:bad,map_url:'https://maps.example.invalid/old',official_url_status:'ok' as const};
const procedure: ScheduleProcedure = {id:66,code:'DEPRECIABLE_ASSET_TAX_RETURN',name:'合成償却資産申告',description:'test',category:'local_tax',timing_type:'fixed_date',timing_label:'1/31',next_deadline:'2027年1月31日',next_deadline_date:'2027-01-31',office,official_links:[],caution_note:'既存の注意',submission_method:'eLTAX、郵送、窓口'};
function item(p:ScheduleProcedure){return [{year:2027,items:[{procedure:p,dueDate:'2027-01-31',confidence:'confirmed' as const}]}]}
test('Tokyo ward range handles legacy/new codes without covering cities outside the 23 wards',()=>{
 for(let n=1;n<=23;n++){assert.equal(isTokyoSpecialWard({prefectureCode:'13',municipalityCode:'131'+String(n).padStart(2,'0')}),true)}
 for(const municipalityCode of ['132012','13199','401331',null,'1311','x131130'])assert.equal(isTokyoSpecialWard({prefectureCode:'13',municipalityCode}),false);
 assert.equal(isTokyoSpecialWard({prefectureCode:'40',municipalityCode:'131130'}),false);
});
test('known unavailable URLs normalize host/query/slash; a different page or deceptive host is not matched',()=>{
 for(const url of [bad,bad+'?ref=trial#top','http://city.shibuya.tokyo.jp/kurashi/zeikin/hojin'])assert.equal(isKnownUnavailableSubmissionUrl(url),true);
 for(const url of [null,'bad',bad.replace('city.shibuya.tokyo.jp','city.shibuya.tokyo.jp.evil.invalid'),'https://www.city.shibuya.tokyo.jp/other/'])assert.equal(isKnownUnavailableSubmissionUrl(url),false);
});
test('23-ward asset filing withholds the office, map and old URL without changing deadlines or tax criteria',()=>{
 const p=protectSubmissionDestination(procedure,tokyo);
 assert.equal(p.office,null);assert.ok(p.submissionGuidance);
 assert.deepEqual({...p,office,submissionGuidance:undefined},{...procedure,submissionGuidance:undefined});
 assert.equal(procedure.office,office);assert.equal(office.official_url,bad);
 const s=buildRoadmapSubmissionInfo(p);assert.equal(s.officeName,null);assert.match(s.notice!,/本店所在地だけでは提出先を確定できません/);assert.match(s.notice!,/23区外/);assert.equal(s.url,'https://www.tax.metro.tokyo.lg.jp/kazei/work/shokyak_sis');assert.notEqual(s.label,'公式ページ');
 // The same hold applies when office read is successful but normally empty.
 assert.equal(protectSubmissionDestination({...procedure,office:null},tokyo).office,null);
 assert.ok(protectSubmissionDestination({...procedure,office:null},tokyo).submissionGuidance);
});
test('a known-wrong Shibuya asset destination is never kept just because company location is missing',()=>{
 assert.equal(protectSubmissionDestination(procedure,{prefectureCode:null,municipalityCode:null}).office,null);
});
test('23-ward municipal resident tax is an explanation link, never a fabricated ward/city office',()=>{
 const p=protectSubmissionDestination({...procedure,id:65,code:'MUNICIPAL_RESIDENT_TAX_RETURN'},tokyo);
 const s=buildRoadmapSubmissionInfo(p);assert.equal(s.officeName,null);assert.match(s.notice!,/法人都民税/);assert.equal(s.url,'https://www.tax.metro.tokyo.lg.jp/shitsumon/work/a1');
});
test('other regions, unrelated procedures and existing directory pilots retain object identity',()=>{
 const verified={...procedure,office:{...office,official_url:'https://city.example.invalid/assets',website_url:null}};
 for(const municipalityCode of ['011011','401331','401013','132012'])assert.equal(protectSubmissionDestination(verified,{prefectureCode:municipalityCode.slice(0,2),municipalityCode}),verified);
 const unrelated={...procedure,code:'CORPORATE_TAX_RETURN'};assert.equal(protectSubmissionDestination(unrelated,tokyo),unrelated);
});
test('marked broken official URL cannot return through identical website/fallback fields',()=>{
 const p={...procedure,office:{...office,official_url:'https://example.invalid/broken',website_url:'https://example.invalid/broken',fallback_url:'https://example.invalid/broken',official_url_status:'broken' as const}};
 assert.equal(buildRoadmapSubmissionInfo(p).url,null);
 assert.equal(buildRoadmapSubmissionInfo({...p,office:{...p.office,fallback_url:'https://example.invalid/list'}}).url,'https://example.invalid/list');
 assert.equal(buildRoadmapSubmissionInfo(procedure).url,null);
 assert.match(buildRoadmapSubmissionInfo(procedure).notice!,/リンク切れ/);
 assert.deepEqual(trialExecutionLinks({official_links:[{label:'bad',url:bad,status:'ok'},{label:'broken',url:'https://example.invalid/broken',status:'broken',fallback_url:'https://example.invalid/broken'}]}),[]);
});
test('Excel/PDF common rows carry the held destination, official explanation and notice; status/deadline unchanged',()=>{
 const before=buildRoadmapExportRows(item(procedure),{'66:2027-01-31':'in_progress'});
 const rows=buildRoadmapExportRows(item(protectSubmissionDestination(procedure,tokyo)),{'66:2027-01-31':'in_progress'});
 assert.equal(rows[0].officeName,'提出先は要確認');assert.equal(rows[0].url,'https://www.tax.metro.tokyo.lg.jp/kazei/work/shokyak_sis');assert.match(rows[0].cautionNote,/本店所在地だけでは/);assert.match(rows[0].cautionNote,/既存の注意/);
 for(const key of ['dueDate','year','month','status','confidence','procedureName','submissionMethod'] as const)assert.equal(rows[0][key],before[0][key]);
 assert.equal(JSON.stringify(rows).includes(bad),false);
});
