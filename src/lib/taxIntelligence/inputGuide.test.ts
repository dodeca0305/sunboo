import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTaxInputGuide, taxInputStep } from './inputGuide.ts';
import type { SupabaseClient } from '../supabase';
import type { WorkspaceCompanyRow } from '../workspaceCompanyProfile';

const profile = { fiscalMonth: 3 };
test('normal empty returns offer conditional registration without claiming a problem-free result', () => {
  const step = taxInputStep(23, profile, []);
  assert.equal(step.kind, 'new-return');
  assert.match(step.reason, /申告済みの実績がある場合だけ/);
  assert.equal(step.href, '/admin/workspaces/23/tax-returns?entry=new&field=fiscalYearEndDate');
});
test('guidance selects the latest fiscal period, never the greatest row ID or input order', () => {
  const rows = [
    {id:'99',fiscalYearEndDate:'2024-03-31',filedDate:'2024-05-01'},
    {id:'7',fiscalYearEndDate:'2026-03-31',filedDate:null},
  ];
  const before = structuredClone(rows);
  const step = taxInputStep(23, profile, rows);
  assert.equal(step.kind, 'filed-date');
  assert.equal(step.href, '/admin/workspaces/23/tax-returns?entry=7&field=filedDate');
  assert.deepEqual(rows, before);
  assert.equal(taxInputStep(23, profile, [{...rows[1],filedDate:'2026-05-01'}]).kind,'complete');
});
test('existing scope and a normally missing fiscal month receive distinct guidance', () => {
  assert.equal(taxInputStep(23,profile,[{id:'1',fiscalYearEndDate:'2022-03-31',filedDate:null}]).kind,'outside-scope');
  const step = taxInputStep(23,{fiscalMonth:null},[]);
  assert.equal(step.kind,'profile');
  assert.equal(step.href,'/admin/workspaces/23/profile#company-profile-fiscalMonth');
});
test('communication failures hold the input recommendation instead of claiming missing or complete', async () => {
  const client = {from(){throw Error('synthetic failure');}} as unknown as SupabaseClient;
  const company = {id:23} as WorkspaceCompanyRow;
  assert.deepEqual(await loadTaxInputGuide(client,company),{status:'unavailable'});
});
