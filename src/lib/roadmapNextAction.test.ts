import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoadmapNextAction } from './roadmapSubmissionInfo.ts';
import { protectSubmissionDestination } from './submissionLinkSafety.ts';
import type { ScheduleProcedure } from './scheduleProcedure.ts';

const base: ScheduleProcedure = {
  id: 1, code: 'X', name: '合成手続き', description: '', category: 'tax', timing_label: '', timing_type: 'fixed',
  next_deadline: null, next_deadline_date: null, office: null, official_links: [],
};
const office = (o: Partial<NonNullable<ScheduleProcedure['office']>>): ScheduleProcedure => ({
  ...base, office: { name: '合成窓口', official_url: null, website_url: null, fallback_url: null, ...o },
});
const UNAVAILABLE = 'https://www.city.shibuya.tokyo.jp/kurashi/zeikin/hojin/';

test('Tokyo 23 asset guidance: destination-unconfirmed primary link', () => {
  const p = protectSubmissionDestination({ ...base, code: 'DEPRECIABLE_ASSET_TAX_RETURN' }, { prefectureCode: '13', municipalityCode: '131130' });
  const a = buildRoadmapNextAction(p);
  assert.equal(a.buttonLabel, 'まず、提出先を確認する');
  assert.equal(a.href, 'https://www.tax.metro.tokyo.lg.jp/kazei/work/shokyak_sis');
  assert.ok(a.notes.includes('提出先はまだ確定していません。'));
});

test('confirmed wrong NTA Shibuya URL: CTA uses the corrected page; broken identical copies stay hidden', () => {
  const wrong = 'https://www.nta.go.jp/about/organization/tokyo/shokatsu/shibuya/index.htm';
  const right = 'https://www.nta.go.jp/about/organization/tokyo/location/tokyo/shibuya/index.htm';
  const ok = buildRoadmapNextAction(office({ official_url: wrong, official_url_status: 'ok' }));
  assert.equal(ok.href, right);
  assert.equal(ok.buttonLabel, 'まず、公式案内を確認する');
  const broken = buildRoadmapNextAction(office({ official_url: wrong, website_url: wrong, fallback_url: wrong, official_url_status: 'broken' }));
  assert.equal(broken.href, null);
});

test('official / website / fallback wording never calls related pages official', () => {
  const o = buildRoadmapNextAction(office({ official_url: 'https://a.example/', official_url_status: 'ok' }));
  assert.equal(o.buttonLabel, 'まず、公式案内を確認する');
  assert.deepEqual(o.notes, []);
  for (const f of [{ website_url: 'https://b.example/' }, { fallback_url: 'https://c.example/' }]) {
    const r = buildRoadmapNextAction(office(f));
    assert.equal(r.buttonLabel, 'まず、関連ページを確認する');
    assert.ok(r.notes.some((n) => n.includes('公式ページとは確認できていない')));
  }
});

test('unchecked official link keeps a visible warning', () => {
  const a = buildRoadmapNextAction(office({ official_url: 'https://a.example/', official_url_status: 'unchecked' }));
  assert.equal(a.buttonLabel, 'まず、公式案内を確認する');
  assert.ok(a.notes.includes('このリンクは未確認です。'));
});

test('missing link is "unregistered" and has no button', () => {
  for (const p of [base, office({})]) {
    const a = buildRoadmapNextAction(p);
    assert.equal(a.href, null);
    assert.equal(a.buttonLabel, null);
    assert.deepEqual(a.notes, ['リンクは未登録です。']);
  }
});

test('registered but broken/known-404 is not called unregistered and is never the primary link', () => {
  const broken = buildRoadmapNextAction(office({ official_url: 'https://a.example/', official_url_status: 'broken' }));
  assert.equal(broken.href, null);
  assert.deepEqual(broken.notes, ['利用できる案内リンクがありません。']);
  const known404 = buildRoadmapNextAction(office({ official_url: UNAVAILABLE, official_url_status: 'ok' }));
  assert.equal(known404.href, null);
  assert.deepEqual(known404.notes, ['リンクを確認中です。']);
});

test('unsafe scheme or credentials are rejected without claiming unregistered', () => {
  for (const url of ['javascript:alert(1)', 'ftp://a.example/', 'https://user:pw@a.example/', 'not a url']) {
    const a = buildRoadmapNextAction(office({ official_url: url, official_url_status: 'ok' }));
    assert.equal(a.href, null, url);
    assert.equal(a.buttonLabel, null, url);
    assert.deepEqual(a.notes, ['利用できる案内リンクがありません。'], url);
  }
});
