import test from 'node:test';
import assert from 'node:assert/strict';
import { missingProfileInputs, profileInputId } from './profileInputGuidance.ts';

test('正常に取得したnullだけを未入力として、入力順に案内する',()=>{
  assert.deepEqual(missingProfileInputs({fiscalMonth:null,establishedDate:null,capital:null}).map(field=>field.key),['fiscalMonth','establishedDate','capital']);
});
test('資本金0を未入力にせず、登録済み部分を不足一覧に混ぜない',()=>{
  const profile={fiscalMonth:3,establishedDate:null,capital:0};
  assert.deepEqual(missingProfileInputs(profile).map(field=>field.key),['establishedDate']);
  assert.deepEqual(profile,{fiscalMonth:3,establishedDate:null,capital:0});
});
test('既存の入力が揃った場合は不足を作らない',()=>{
  assert.deepEqual(missingProfileInputs({fiscalMonth:3,establishedDate:'2020-04-01',capital:5000000}),[]);
});
test('ホームとフォームで同じ入力欄の識別子を使用する',()=>{
  assert.equal(profileInputId('establishedDate'),'company-profile-establishedDate');
});
