import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDiagnosisOfficeSummaries, selectProcedureReference } from './diagnosisSubmissionInfo.ts';
import { protectSubmissionDestination } from './submissionLinkSafety.ts';
import type { ScheduleProcedure } from './scheduleProcedure';
const bad = 'https://www.city.shibuya.tokyo.jp/kurashi/zeikin/hojin/';
const office = { name: '合成窓口', official_url: bad, website_url: bad, map_url: 'https://maps.example.invalid/old', official_url_status: 'ok' as const };
const proc = { id: 66, code: 'DEPRECIABLE_ASSET_TAX_RETURN', name: '合成申告', office, official_links: [] } as unknown as ScheduleProcedure;
const legacy = [{ ...office, id: 3, municipality_id: 1, office_type: 'municipal_tax', address: '旧住所', phone: '旧電話' }];
test('protected destinations cannot reappear from the legacy summary', () => {
  const protectedProc = protectSubmissionDestination(proc, { prefectureCode: '13', municipalityCode: '131130' });
  assert.deepEqual(buildDiagnosisOfficeSummaries(legacy, [protectedProc]), []);
  assert.deepEqual(buildDiagnosisOfficeSummaries(legacy, []), []);
});
test('same-name overlay wins without inheriting the old contact data', () => {
  const changed = { ...proc, office: { ...office, official_url: 'https://example.invalid/new', website_url: null, map_url: null } };
  const [summary] = buildDiagnosisOfficeSummaries(legacy, [changed]);
  assert.equal(summary.link.url, 'https://example.invalid/new');
  assert.equal(summary.address, null); assert.equal(summary.phone, null); assert.equal(summary.map_url, null);
});
test('matching contacts survive; shared office lists its actual procedures; distinct URLs stay distinct', () => {
  const result = buildDiagnosisOfficeSummaries(legacy, [proc, { ...proc, name: '別手続き' }, { ...proc, office: { ...office, official_url: 'https://example.invalid/another' } }]);
  assert.equal(result.length, 2); assert.equal(result[0].address, '旧住所');
  assert.deepEqual(result[0].procedureNames, ['合成申告', '別手続き']);
  assert.equal(result[0].link.url, null); assert.ok(result[0].link.notice);
});
test('broken, known unavailable and non-web references never return their original URL', () => {
  for (const url of [bad, 'javascript:alert(1)', 'bad']) assert.equal(selectProcedureReference({ label: '説明', url }), null);
  for (const fallback_url of [undefined, null, bad]) assert.equal(selectProcedureReference({ label: '説明', url: bad, status: 'broken', fallback_url }), null);
  assert.equal(selectProcedureReference({ label: '説明', url: 'https://example.invalid/broken', status: 'broken', fallback_url: 'https://example.invalid/broken' }), null);
  assert.deepEqual(selectProcedureReference({ label: '説明', url: bad, status: 'ok', fallback_url: 'https://example.invalid/help' }), { href: 'https://example.invalid/help', fallback: true });
  assert.deepEqual(selectProcedureReference({ label: '説明', url: 'https://example.invalid/good', status: 'ok' }), { href: 'https://example.invalid/good', fallback: false });
});
