import test from 'node:test';
import assert from 'node:assert/strict';
import { electronicFilingEntry } from './electronicFilingEntry.ts';
const tax = { code: 'CORP_TAX_RETURN', category: 'tax' as const, e_filing_system_name: 'e-Tax', e_filing_system_url: 'https://www.e-tax.nta.go.jp/' };
test('registered e-Tax separates instructions from corporate login without claiming every form is available', () => {
  const entry = electronicFilingEntry(tax);
  assert.equal(entry?.state, 'ready');
  if (entry?.state !== 'ready') throw Error('missing entry');
  assert.equal(entry.links[0].url, 'https://www.e-tax.nta.go.jp/hojin.html');
  assert.equal(entry.links[1].url, 'https://login.e-tax.nta.go.jp/login/reception/loginCorporate');
  assert.match(entry.note, /税務ソフトが必要な場合/);
});
test('registered eLTAX leads to the current official software selection, not an assumed WEB-only filing flow', () => {
  const entry = electronicFilingEntry({ ...tax, code: 'DEPRECIABLE_ASSET_TAX_RETURN', category: 'local_tax', e_filing_system_name: 'eLTAX（地方税ポータルシステム）', e_filing_system_url: 'https://www.eltax.lta.go.jp/' });
  assert.equal(entry?.state, 'ready');
  if (entry?.state !== 'ready') throw Error('missing entry');
  assert.equal(entry.links.length, 1); assert.equal(entry.links[0].url, 'https://www.lta.go.jp/eltax/shinkoku/pcdesk/');
  assert.match(entry.note, /税目や手続きの内容/);
});
test('missing registration differs from invalid or mismatched metadata and does not invent a destination', () => {
  assert.deepEqual(electronicFilingEntry({ code: 'CORP_TAX_RETURN', category: 'tax' }), { state: 'missing' });
  for (const e_filing_system_url of [null, 'javascript:alert(1)', 'https://e-tax.nta.go.jp.evil.invalid/', 'http://www.e-tax.nta.go.jp/', 'https://user:pass@www.e-tax.nta.go.jp/', 'https://www.e-tax.nta.go.jp/?company=23', 'https://www.e-tax.nta.go.jp/other']) {
    assert.deepEqual(electronicFilingEntry({ ...tax, e_filing_system_url }), { state: 'unavailable' });
  }
  assert.deepEqual(electronicFilingEntry({ ...tax, e_filing_system_name: 'eLTAX' }), { state: 'unavailable' });
  assert.deepEqual(electronicFilingEntry({ ...tax, code: 'DEPRECIABLE_ASSET_TAX_RETURN' }), { state: 'unavailable' });
  assert.deepEqual(electronicFilingEntry({ ...tax, code: 'UNKNOWN_NEW_TAX' }), { state: 'unavailable' });
  assert.equal(electronicFilingEntry({ ...tax, category: 'legal' }), null);
});
