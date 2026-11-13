import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCOUNTANT_LINES, CORPORATE_FILING_CHOICES, corporateDestinationNotice, corporateFilingView,
  isCorporateFilingChoice, usesCorporateFilingChoice,
} from './corporateFilingChoice.ts';
import { buildRoadmapNextAction } from './roadmapSubmissionInfo.ts';
import { electronicFilingEntry } from './electronicFilingEntry.ts';
import type { ScheduleProcedure } from './scheduleProcedure.ts';

const corp: ScheduleProcedure = {
  id: 1, code: 'CORP_TAX_RETURN', name: '合成法人税申告', description: '', category: 'tax', timing_label: '', timing_type: 'fixed',
  next_deadline: null, next_deadline_date: null, office: null, official_links: [],
  e_filing_system_name: 'e-Tax', e_filing_system_url: 'https://www.e-tax.nta.go.jp/',
};
const withOffice = (o: Partial<NonNullable<ScheduleProcedure['office']>>): ScheduleProcedure => ({
  ...corp, office: { name: '合成窓口', official_url: null, website_url: null, fallback_url: null, ...o },
});

test('only the exact CORP_TAX_RETURN code uses the chooser', () => {
  assert.equal(usesCorporateFilingChoice(corp), true);
  for (const code of ['CORPORATE_TAX_RETURN', 'MUNICIPAL_RESIDENT_TAX_RETURN', 'WITHHOLDING_TAX', 'corp_tax_return', '']) {
    assert.equal(usesCorporateFilingChoice({ code }), false, code);
  }
});

test('exactly three choices in order; unknown values are rejected', () => {
  assert.deepEqual(CORPORATE_FILING_CHOICES.map((c) => c.label), ['税理士にお願いする', '自分で電子申告する', 'どうすればいいか相談する']);
  assert.equal(isCorporateFilingChoice('accountant'), true);
  assert.equal(isCorporateFilingChoice(''), false);
  assert.equal(isCorporateFilingChoice('other'), false);
});

test('accountant: two short lines, no contact/assignment wording', () => {
  const v = corporateFilingView('accountant', corp);
  assert.equal(v.kind, 'accountant');
  if (v.kind !== 'accountant') return;
  assert.deepEqual(v.lines, ACCOUNTANT_LINES);
  assert.ok(v.lines.length <= 2 && v.lines.every((l) => l.length <= 30));
  assert.ok(!v.lines.join('').match(/https?:|担当に設定|保存しました|完了/));
});

test('self: reuses curated e-Tax entry; missing and unsafe stay explicit', () => {
  const ready = corporateFilingView('self', corp);
  assert.deepEqual(ready.kind === 'self' && ready.entry, electronicFilingEntry(corp));
  assert.equal(ready.kind === 'self' && ready.entry?.state, 'ready');
  const urls = ready.kind === 'self' && ready.entry?.state === 'ready' ? ready.entry.links.map((l) => l.url) : [];
  assert.deepEqual(urls, ['https://www.e-tax.nta.go.jp/hojin.html', 'https://login.e-tax.nta.go.jp/login/reception/loginCorporate']);
  const missing = corporateFilingView('self', { ...corp, e_filing_system_name: null, e_filing_system_url: null });
  assert.equal(missing.kind === 'self' && missing.entry?.state, 'missing');
  for (const url of ['https://e-tax.nta.go.jp.evil.invalid/', 'http://www.e-tax.nta.go.jp/', 'https://user@www.e-tax.nta.go.jp/', 'not a url']) {
    const bad = corporateFilingView('self', { ...corp, e_filing_system_url: url });
    assert.equal(bad.kind === 'self' && bad.entry?.state, 'unavailable', url);
  }
});

test('consult: safe office link relabelled; unavailable keeps the existing note without a link', () => {
  const ok = corporateFilingView('consult', withOffice({ official_url: 'https://a.example/', official_url_status: 'ok' }));
  assert.equal(ok.kind === 'consult' && ok.action.buttonLabel, '相談先の案内を開く');
  assert.equal(ok.kind === 'consult' && ok.action.href, 'https://a.example/');
  assert.equal(ok.kind === 'consult' && ok.action.sourceName, '合成窓口');
  const unchecked = corporateFilingView('consult', withOffice({ official_url: 'https://a.example/', official_url_status: 'unchecked' }));
  assert.ok(unchecked.kind === 'consult' && unchecked.action.notes.includes('このリンクは未確認です。'));
  const related = corporateFilingView('consult', withOffice({ website_url: 'https://b.example/' }));
  assert.ok(related.kind === 'consult' && related.action.notes.some((n) => n.includes('公式ページとは確認できていない')));
  const broken = corporateFilingView('consult', withOffice({ official_url: 'https://a.example/', official_url_status: 'broken' }));
  assert.ok(broken.kind === 'consult' && broken.action.href === null && broken.action.buttonLabel === null);
  const none = corporateFilingView('consult', corp);
  assert.ok(none.kind === 'consult' && none.action.href === null && none.action.notes.includes('リンクは未登録です。'));
  const unsafe = corporateFilingView('consult', withOffice({ official_url: 'javascript:alert(1)' }));
  assert.ok(unsafe.kind === 'consult' && unsafe.action.href === null);
});

test('consult: known wrong NTA Shibuya URL is corrected; no wrong URL leaks', () => {
  const wrong = 'https://www.nta.go.jp/about/organization/tokyo/shokatsu/shibuya/index.htm';
  const right = 'https://www.nta.go.jp/about/organization/tokyo/location/tokyo/shibuya/index.htm';
  const v = corporateFilingView('consult', withOffice({ official_url: wrong, official_url_status: 'ok' }));
  assert.equal(v.kind === 'consult' && v.action.href, right);
  const broken = corporateFilingView('consult', withOffice({ official_url: wrong, website_url: wrong, fallback_url: wrong, official_url_status: 'broken' }));
  assert.equal(broken.kind === 'consult' && broken.action.href, null);
  // Same answer as the existing generic next action apart from the label.
  const generic = buildRoadmapNextAction(withOffice({ official_url: wrong, official_url_status: 'ok' }));
  assert.equal(generic.href, right);
});

test('unconfirmed destination notice is available outside the chooser', () => {
  assert.equal(corporateDestinationNotice(corp), null);
  assert.equal(corporateDestinationNotice({ submissionGuidance: { message: 'x', reference: { label: 'l', url: 'https://a.example/' } } } as never), '提出先はまだ確定していません。');
});
