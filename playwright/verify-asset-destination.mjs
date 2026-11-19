// 資産所在地ウィジェットの合成ブラウザQA。実コンポーネントを/private/tmpの隔離フィクスチャへwebpackで束ね、
// 外部通信を全遮断したChromiumで操作する。認証・本番・.envには触れない。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const REPO = process.cwd();
const require = createRequire(path.join(REPO, 'package.json'));
const webpack = require('next/dist/compiled/webpack/webpack').webpack;
const FIX = '/private/tmp/sunboo-asset-destination-fixture';
const OUT = path.join(REPO, 'test-results');
rmSync(FIX, { recursive: true, force: true });
mkdirSync(FIX, { recursive: true });
mkdirSync(OUT, { recursive: true });

// 最小のTS変換ローダー（型検査なし）。
writeFileSync(path.join(FIX, 'loader.cjs'), `const ts=require(${JSON.stringify(path.join(REPO, 'node_modules/typescript'))});
module.exports=function(src){return ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2019,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;};`);
writeFileSync(path.join(FIX, 'entry.tsx'), `import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import AssetSubmissionDestination from '@/components/AssetSubmissionDestination';
function App(){const [d,setD]=useState(false);return <div style={{padding:16}}>
<button id="toggle" onClick={()=>setD(!d)}>toggle</button>
<div id="w1"><AssetSubmissionDestination disabled={d}/></div>
<div id="w2"><AssetSubmissionDestination/></div></div>;}
createRoot(document.getElementById('root')!).render(<App/>);`);
writeFileSync(path.join(FIX, 'index.html'), '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:sans-serif}.form-input{border:1px solid #333;padding:4px}.btn-secondary{border:1px solid #333;padding:4px 8px;margin:4px 0}</style><div id="root"></div><script src="bundle.js"></script>');

await new Promise((resolve, reject) => webpack({
  mode: 'development', devtool: false, context: REPO, entry: path.join(FIX, 'entry.tsx'),
  output: { path: FIX, filename: 'bundle.js' },
  resolve: { extensions: ['.tsx', '.ts', '.js'], alias: { '@': path.join(REPO, 'src') }, modules: [path.join(REPO, 'node_modules')] },
  resolveLoader: { modules: [path.join(REPO, 'node_modules')] },
  module: { rules: [{ test: /\.tsx?$/, use: path.join(FIX, 'loader.cjs') }] },
}, (err, stats) => err ? reject(err) : stats.hasErrors() ? reject(new Error(stats.toString('errors-only'))) : resolve()));

const browser = await chromium.launch({ headless: true });
// 期待値は画面コードの鏡ではなく、別ファイル（SQLパッチ・公開マスタSQL）から読む。
const PATCH = readFileSync(path.join(REPO, 'scripts/sql/20261119-designated-cities-stage1.sql'), 'utf8');
const GEO = readFileSync(path.join(REPO, 'supabase/migration_designated_cities_geography.sql'), 'utf8');
const STAGE1 = ['仙台市', 'さいたま市', '千葉市'].map((city) => {
  const m = PATCH.match(new RegExp(`\\('${city}', '\\d+', '\\d+', '([^']+)', '([^']+)',\\s*'([^']+)', '([^']+)',\\s*'([^']+)'`));
  assert.ok(m, city);
  const [, office, postal, address, phone, url] = m;
  const wards = [...GEO.matchAll(new RegExp(`'(\\d{6})','${city}([^']+)'`, 'g'))].map((x) => [x[1], x[2]]);
  return { city, office, postal, address, phone, url, wards };
});
assert.deepEqual(STAGE1.map((c) => c.wards.length), [5, 10, 6]);
// 第2弾（横浜市・川崎市・相模原市）：窓口・URLは第2弾SQLパッチ、区コード・区名は公開マスタSQLから読む。
const PATCH2 = readFileSync(path.join(REPO, 'scripts/sql/20261119-designated-cities-stage2.sql'), 'utf8');
const STAGE2_NOTE = {
  横浜市: '資産がある区ごとに書類を用意し、この提出先へ出します。',
  川崎市: '資産がある区ごとに書類を用意します。電話は川崎区・幸区が1321、その他5区が1322です。',
  相模原市: '資産がある区ごとに書類を用意し、この提出先へ郵送します。',
};
const STAGE2 = ['横浜市', '川崎市', '相模原市'].map((city) => {
  const m = PATCH2.match(new RegExp(`\\('${city}', ARRAY\\[[^\\]]+\\], '14', '([^']+)', '([^']+)',\\s*'([^']+)', '([^']+)',\\s*'([^']+)'`));
  assert.ok(m, city);
  const [, office, postal, address, phone, url] = m;
  const snap = PATCH2.match(new RegExp(`'(\\{"patch":"designated-cities-stage2-20261119"[^']*"form_page_url":"([^"]+)"[^']*\\})'::jsonb`, 'g')).find((x) => x.includes(url));
  assert.ok(snap, city + ' snapshot');
  const formUrl = snap.match(/"form_page_url":"([^"]+)"/)[1];
  assert.notEqual(formUrl, url); // 様式案内の遷移先は公式ページURLと別
  const wards = [...GEO.matchAll(new RegExp(`'(\\d{6})','${city}([^']+)'`, 'g'))].map((x) => [x[1], x[2]]);
  return { city, office, postal, address, phone, url, formUrl, note: STAGE2_NOTE[city], wards };
});
assert.deepEqual(STAGE2.map((c) => c.wards.length), [18, 7, 3]);
assert.equal(STAGE2[1].formUrl, 'https://www.city.kawasaki.jp/230/page/0000053635.html');
assert.equal(STAGE2[1].phone, '044-200-1321／044-200-1322');
// 第3弾（新潟市・静岡市・浜松市）：窓口・URLは第3弾SQLパッチ、区コード・区名は公開マスタSQLから読む。
// 様式案内の遷移先は3市とも公式ページURLと同じで正しい（別URLを要求しない）。
const PATCH3 = readFileSync(path.join(REPO, 'scripts/sql/20261119-designated-cities-stage3.sql'), 'utf8');
const STAGE3_NOTE = {
  新潟市: '資産がある区ごとに書類を用意し、この提出先へ出します。区役所・出張所では受け付けていません。',
  静岡市: '資産がある区ごとに書類を用意し、この提出先へ出します。',
  浜松市: '資産がある区ごとに書類を用意し、郵送はこの提出先へ出します。',
};
const STAGE3 = ['新潟市', '静岡市', '浜松市'].map((city) => {
  const m = PATCH3.match(new RegExp(`\\('${city}', ARRAY\\[[^\\]]+\\], '\\d+', '([^']+)', '([^']+)',\\s*'([^']+)', '([^']+)',\\s*'([^']+)'`));
  assert.ok(m, city);
  const [, office, postal, address, phone, url] = m;
  const snap = PATCH3.match(/'(\{"patch":"designated-cities-stage3-20261119"[^']*\})'::jsonb/g).find((x) => x.includes(`"contact_filing_url":"${url}"`));
  assert.ok(snap, city + ' snapshot');
  const formUrl = snap.match(/"form_page_url":"([^"]+)"/)[1];
  const wards = [...GEO.matchAll(new RegExp(`'(\\d{6})','${city}([^']+)'`, 'g'))].map((x) => [x[1], x[2]]);
  return { city, office, postal, address, phone, url, formUrl, note: STAGE3_NOTE[city], wards };
});
assert.deepEqual(STAGE3.map((c) => c.wards.length), [8, 3, 3]);
assert.equal(STAGE3[0].phone, '025-226-2277');
assert.deepEqual(STAGE3[2].wards.map((w) => w[1]), ['中央区', '浜名区', '天竜区']);
// 第4弾（名古屋市・京都市・大阪市）：窓口・URLは第4弾SQLパッチ、区コード・区名は公開マスタSQLから読む（別ファイルの独立期待値）。
// 名古屋のみ様式案内URLが公式ページと別。京都・大阪は同じで正しい。
const PATCH4 = readFileSync(path.join(REPO, 'scripts/sql/20261119-designated-cities-stage4.sql'), 'utf8');
const STAGE4_NOTE = {
  名古屋市: '資産がある区ごとに書類を用意し、金山市税事務所へ出します。2026年4月から全区の窓口が集約されています。',
  京都市: '資産がある区ごとに書類を用意し、この提出先へ出します。区役所・支所・出張所では受け付けていません。',
  大阪市: '資産がある区ごとに書類を用意し、郵送はこの提出先へ出します。区役所では受け付けていません。',
};
const STAGE4 = ['名古屋市', '京都市', '大阪市'].map((city) => {
  const m = PATCH4.match(new RegExp(`\\('${city}', ARRAY\\[[^\\]]+\\], '\\d+', '([^']+)', '([^']+)',\\s*'([^']+)', '([^']+)',\\s*'([^']+)'`));
  assert.ok(m, city);
  const [, office, postal, address, phone, url] = m;
  const snap = PATCH4.match(/'(\{"patch":"designated-cities-stage4-20261119"[^']*\})'::jsonb/g).find((x) => x.includes(`"contact_filing_url":"${url}"`));
  assert.ok(snap, city + ' snapshot');
  const formUrl = snap.match(/"form_page_url":"([^"]+)"/)[1];
  const wards = [...GEO.matchAll(new RegExp(`'(\\d{6})','${city}([^']+)'`, 'g'))].map((x) => [x[1], x[2]]);
  return { city, office, postal, address, phone, url, formUrl, note: STAGE4_NOTE[city], wards };
});
assert.deepEqual(STAGE4.map((c) => c.wards.length), [16, 11, 24]);
assert.equal(STAGE4[0].formUrl, 'https://www.city.nagoya.jp/kurashi/zeikin/1037356/1011931/1011953/1011956.html');
assert.notEqual(STAGE4[0].formUrl, STAGE4[0].url);
assert.equal(STAGE4[1].formUrl, STAGE4[1].url); assert.equal(STAGE4[2].formUrl, STAGE4[2].url);
assert.equal(STAGE4[2].phone, '06-4705-2941');
const results = [];
const blocked = [];
const ok = (n) => { results.push(n); console.log('PASS', n); };
try {
  for (const [name, vp] of [['pc', { width: 1280, height: 900 }], ['mobile', { width: 375, height: 800 }]]) {
    const ctx = await browser.newContext({ viewport: vp });
    // 外部通信は全遮断。file:のみ許可。
    await ctx.route('**/*', (r) => { const u = r.request().url(); if (u.startsWith('file:')) return r.continue(); blocked.push(u); return r.abort(); });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('file://' + path.join(FIX, 'index.html'));
    const w1 = page.locator('#w1'), w2 = page.locator('#w2');
    const sel = w1.locator('select');
    // 選択肢
    const groups = await sel.locator('optgroup').evaluateAll((g) => g.map((x) => [x.label, x.querySelectorAll('option').length]));
    assert.deepEqual(groups, [['福岡市', 7], ['北九州市', 7], ['仙台市', 5], ['さいたま市', 10], ['千葉市', 6], ['横浜市', 18], ['川崎市', 7], ['相模原市', 3], ['新潟市', 8], ['静岡市', 3], ['浜松市', 3], ['名古屋市', 16], ['京都市', 11], ['大阪市', 24]]);
    assert.equal(await sel.inputValue(), '');
    assert.equal(await w1.getByTestId('asset-destination-result').count(), 0);
    ok(`${name}: 14 optgroups [7,7,5,10,6,18,7,3,8,3,3,16,11,24], initial blank`);
    // 北九州小倉北
    await sel.selectOption('401064');
    const res = w1.getByTestId('asset-destination-result');
    const t = await res.innerText();
    assert.match(t, /北九州市 財政・変革局 税務部 固定資産税課 償却資産係（市役所6階）/);
    assert.match(t, /093-582-3210/); assert.match(t, /803-8501/);
    assert.match(t, /令和9年度の様式は公開を確認できていません（2026\/11\/18確認）。/);
    const link = res.getByRole('link', { name: '北九州市の公式案内を開く（別タブ）' });
    assert.equal(await link.getAttribute('href'), 'https://www.city.kitakyushu.lg.jp/contents/924_00364.html');
    const nl = res.getByRole('link', { name: /最新の様式を公式サイトで確認/ });
    assert.equal(await nl.getAttribute('href'), 'https://www.city.kitakyushu.lg.jp/contents/division260list.html');
    for (const l of [link, nl]) { assert.equal(await l.getAttribute('target'), '_blank'); assert.match(await l.getAttribute('rel'), /noopener/); }
    // 注意書きは折り畳みの外で可視
    assert.ok(await w1.getByTestId('asset-destination-form-notice').isVisible());
    assert.equal(await w1.locator('details').evaluate((d) => d.open), false);
    assert.doesNotMatch(t, /福岡市/);
    ok(`${name}: Kitakyushu office/link/notice/attrs`);
    await page.screenshot({ path: path.join(OUT, `asset-destination-kitakyushu-${name}.png`), fullPage: true });
    // 福岡城南へ切替
    await sel.selectOption('401366');
    const t2 = await res.innerText();
    assert.match(t2, /福岡市 財政局 資産課税課/); assert.match(t2, /092-292-2479/);
    assert.doesNotMatch(t2, /北九州|令和9年度/);
    assert.equal(await w1.getByTestId('asset-destination-form-notice').count(), 0);
    assert.equal(await res.getByRole('link', { name: '福岡市の公式案内を開く（別タブ）' }).getAttribute('href'), 'https://www.city.fukuoka.lg.jp/zaisei/zeisei/life/koteisisanzei/003.html');
    ok(`${name}: switch to Fukuoka 401366 resets office/link/notice`);
    await page.screenshot({ path: path.join(OUT, `asset-destination-fukuoka-${name}.png`), fullPage: true });
    // 第1弾3市：全21区で窓口・電話・リンク・R9案内（日付11/19）を、SQLパッチ側の値と照合
    for (const c of STAGE1) {
      for (const [code, ward] of c.wards) {
        await sel.selectOption(code);
        assert.equal(await sel.locator('option:checked').innerText(), c.city + ward);
        const tt = await res.innerText();
        assert.ok(tt.includes(c.office), `${code} office`);
        assert.ok(tt.includes(`〒${c.postal}`) && tt.includes(c.address) && tt.includes(`電話：${c.phone}`), `${code} contact`);
        assert.match(tt, /資産がある区ごとに書類を用意し、この提出先へ出します。/);
        assert.ok(tt.includes('令和9年度の様式は公開を確認できていません（2026/11/19確認）。'), `${code} R9`);
                assert.doesNotMatch(tt, /福岡|北九州|11\/18/);
        const l1 = res.getByRole('link', { name: `${c.city}の公式案内を開く（別タブ）` });
        assert.equal(await l1.getAttribute('href'), c.url);
        const l2 = res.getByRole('link', { name: /最新の様式を公式サイトで確認/ });
        assert.equal(await l2.getAttribute('href'), c.url);
        for (const l of [l1, l2]) { assert.equal(await l.getAttribute('target'), '_blank'); assert.match(await l.getAttribute('rel'), /noopener/); }
        assert.equal(await w1.locator('details').evaluate((d) => d.open), false);
        await w1.locator('summary').click();
        assert.ok((await w1.locator('details').innerText()).includes('確認日 2026-11-19'), `${code} date`);
        await w1.locator('summary').click();
      }
      await sel.selectOption(c.wards[0][0]);
      await page.screenshot({ path: path.join(OUT, `asset-destination-${c.city === '仙台市' ? 'sendai' : c.city === 'さいたま市' ? 'saitama' : 'chiba'}-${name}.png`), fullPage: true });
    }
    ok(`${name}: Sendai/Saitama/Chiba all 21 wards match SQL-patch values, R9 notice 11/19, links safe`);
    // 第2弾3市：全28区で窓口・電話・注記・R9案内・リンクを、SQLパッチ/公開マスタ側の値と照合
    const SHOT = { 横浜市: 'yokohama', 川崎市: 'kawasaki', 相模原市: 'sagamihara' };
    for (const c of STAGE2) {
      for (const [code, ward] of c.wards) {
        await sel.selectOption(code);
        assert.equal(await sel.locator('option:checked').innerText(), c.city + ward);
        const tt = await res.innerText();
        assert.ok(tt.includes(c.office), `${code} office`);
        assert.ok(tt.includes(`〒${c.postal}`) && tt.includes(c.address) && tt.includes(`電話：${c.phone}`), `${code} contact`);
        assert.ok(tt.includes(c.note), `${code} note`);
        assert.ok(tt.includes('令和9年度の様式は公開を確認できていません（2026/11/19確認）。'), `${code} R9`);
        assert.doesNotMatch(tt, /福岡|北九州|仙台|さいたま|千葉|11\/18|未公開|未確認/);
        if (c.city === '川崎市') assert.ok(tt.includes('044-200-1321') && tt.includes('044-200-1322'));
        const l1 = res.getByRole('link', { name: `${c.city}の公式案内を開く（別タブ）` });
        assert.equal(await l1.getAttribute('href'), c.url);
        const l2 = res.getByRole('link', { name: /最新の様式を公式サイトで確認/ });
        assert.equal(await l2.getAttribute('href'), c.formUrl);
        for (const l of [l1, l2]) { assert.equal(await l.getAttribute('target'), '_blank'); assert.match(await l.getAttribute('rel'), /noopener/); assert.match(await l.getAttribute('href'), /^https:\/\//); }
        assert.ok(await w1.getByTestId('asset-destination-form-notice').isVisible());
        assert.equal(await w1.locator('details').evaluate((d) => d.open), false);
        await w1.locator('summary').click();
        assert.ok((await w1.locator('details').innerText()).includes('確認日 2026-11-19'), `${code} date`);
        await w1.locator('summary').click();
      }
      await sel.selectOption(c.wards[0][0]);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${c.city} no horizontal scroll`);
      await page.screenshot({ path: path.join(OUT, `asset-destination-${SHOT[c.city]}-${name}.png`), fullPage: true });
    }
    ok(`${name}: Yokohama/Kawasaki/Sagamihara all 28 wards match SQL-patch/geography values, note, R9 notice 11/19, forms-index links safe`);
    // 第3弾3市：全14区で窓口・電話・注記・R9案内・リンクを、SQLパッチ/公開マスタ側の値と照合
    const SHOT3 = { 新潟市: 'niigata', 静岡市: 'shizuoka', 浜松市: 'hamamatsu' };
    for (const c of STAGE3) {
      for (const [code, ward] of c.wards) {
        await sel.selectOption(code);
        assert.equal(await sel.locator('option:checked').innerText(), c.city + ward);
        const tt = await res.innerText();
        assert.ok(tt.includes(c.office), `${code} office`);
        assert.ok(tt.includes(`〒${c.postal}`) && tt.includes(c.address) && tt.includes(`電話：${c.phone}`), `${code} contact`);
        assert.ok(tt.includes(c.note), `${code} note`);
        assert.ok(tt.includes('令和9年度の様式は公開を確認できていません（2026/11/19確認）。'), `${code} R9`);
        assert.doesNotMatch(tt, /福岡|北九州|仙台|さいたま|千葉|横浜|川崎|相模原|11\/18|未公開|未確認|2266|令和8/);
        if (c.city === '新潟市') assert.ok(tt.includes('古町ルフル3階') && tt.includes('025-226-2277') && tt.includes('区役所・出張所では受け付けていません'));
        const l1 = res.getByRole('link', { name: `${c.city}の公式案内を開く（別タブ）` });
        assert.equal(await l1.getAttribute('href'), c.url);
        const l2 = res.getByRole('link', { name: /最新の様式を公式サイトで確認/ });
        assert.equal(await l2.getAttribute('href'), c.formUrl);
        for (const l of [l1, l2]) { assert.equal(await l.getAttribute('target'), '_blank'); assert.match(await l.getAttribute('rel'), /noopener/); assert.match(await l.getAttribute('href'), /^https:\/\//); }
        assert.ok(await w1.getByTestId('asset-destination-form-notice').isVisible());
        assert.equal(await w1.locator('details').evaluate((d) => d.open), false);
        await w1.locator('summary').click();
        assert.ok((await w1.locator('details').innerText()).includes('確認日 2026-11-19'), `${code} date`);
        await w1.locator('summary').click();
      }
      await sel.selectOption(c.wards[0][0]);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${c.city} no horizontal scroll`);
      await page.screenshot({ path: path.join(OUT, `asset-destination-${SHOT3[c.city]}-${name}.png`), fullPage: true });
    }
    ok(`${name}: Niigata/Shizuoka/Hamamatsu all 14 wards match SQL-patch/geography values, note, R9 notice 11/19, links safe`);
    // 第4弾3市：全51区で窓口・電話・注記・R9案内・リンクを、SQLパッチ/公開マスタ側の値と照合
    const SHOT4 = { 名古屋市: 'nagoya', 京都市: 'kyoto', 大阪市: 'osaka' };
    for (const c of STAGE4) {
      for (const [code, ward] of c.wards) {
        await sel.selectOption(code);
        assert.equal(await sel.locator('option:checked').innerText(), c.city + ward);
        const tt = await res.innerText();
        assert.ok(tt.includes(c.office), `${code} office`);
        assert.ok(tt.includes(`〒${c.postal}`) && tt.includes(c.address) && tt.includes(`電話：${c.phone}`), `${code} contact`);
        assert.ok(tt.includes(c.note), `${code} note`);
        assert.ok(tt.includes('令和9年度の様式は公開を確認できていません（2026/11/19確認）。'), `${code} R9`);
        assert.doesNotMatch(tt, /福岡|北九州|仙台|さいたま|千葉|横浜|川崎|相模原|新潟|静岡|浜松|11\/18|未公開|未確認|2948|令和8/);
        const l1 = res.getByRole('link', { name: `${c.city}の公式案内を開く（別タブ）` });
        assert.equal(await l1.getAttribute('href'), c.url);
        const l2 = res.getByRole('link', { name: /最新の様式を公式サイトで確認/ });
        assert.equal(await l2.getAttribute('href'), c.formUrl);
        for (const l of [l1, l2]) { assert.equal(await l.getAttribute('target'), '_blank'); assert.match(await l.getAttribute('rel'), /noopener/); assert.match(await l.getAttribute('href'), /^https:\/\//); }
        assert.ok(await w1.getByTestId('asset-destination-form-notice').isVisible());
        assert.equal(await w1.locator('details').evaluate((d) => d.open), false);
        await w1.locator('summary').click();
        assert.ok((await w1.locator('details').innerText()).includes('確認日 2026-11-19'), `${code} date`);
        await w1.locator('summary').click();
      }
      // 画像：各市の先頭の区と、大阪は2710/2711/2712・名古屋は2310/2311・京都は2610/2611の端
      await sel.selectOption(c.wards[0][0]);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${c.city} no horizontal scroll`);
      await page.screenshot({ path: path.join(OUT, `asset-destination-${SHOT4[c.city]}-${name}.png`), fullPage: true });
    }
    const edges = { 名古屋市: ['231096', '231100'], 京都市: ['261092', '261106'], 大阪市: ['271098', '271110', '271195', '271209'] };
    for (const c of STAGE4) for (const code of edges[c.city]) {
      await sel.selectOption(code);
      assert.match(await res.innerText(), new RegExp(c.office.slice(0, 12)));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    }
    ok(`${name}: Nagoya/Kyoto/Osaka all 51 wards match SQL-patch/geography values, note, R9 notice 11/19, prefix edges, links safe`);
    await sel.selectOption('271209');
    await sel.selectOption('231100');
    assert.match(await res.innerText(), /金山市税事務所/); assert.doesNotMatch(await res.innerText(), /船場|京都/);
    await sel.selectOption('261106');
    assert.match(await res.innerText(), /京都市 市税事務所/); assert.doesNotMatch(await res.innerText(), /金山|船場/);
    ok(`${name}: switch among Stage4 cities resets`);
    await sel.selectOption('221406');
    await sel.selectOption('151084');
    assert.match(await res.innerText(), /新潟市 資産税課/); assert.doesNotMatch(await res.innerText(), /浜松|元目/);
    await sel.selectOption('221015');
    assert.match(await res.innerText(), /静岡市 固定資産税課/); assert.doesNotMatch(await res.innerText(), /新潟|古町/);
    ok(`${name}: switch among Stage3 cities resets`);
    // 旧市へ切り戻し：新市の窓口・案内が残らない
    await sel.selectOption('401366');
    const back = await res.innerText();
    assert.match(back, /福岡市 財政局 資産課税課/); assert.doesNotMatch(back, /横浜|川崎|相模原|新潟|静岡|浜松|名古屋|京都|大阪|金山|船場|令和9年度/);
    assert.equal(await w1.getByTestId('asset-destination-form-notice').count(), 0);
    await sel.selectOption('141330');
    await sel.selectOption('121045');
    assert.match(await res.innerText(), /千葉市 東部市税事務所/); assert.doesNotMatch(await res.innerText(), /川崎|1321/);
    ok(`${name}: switch back from new cities to old cities resets`);
    // 北九州・福岡の確認日は不変（Kitakyushu 11/18、Fukuoka 案内なし）
    await sel.selectOption('401099');
    assert.ok((await res.innerText()).includes('2026/11/18確認'));
    await sel.selectOption('401315');
    assert.equal(await w1.getByTestId('asset-destination-form-notice').count(), 0);
    ok(`${name}: Kitakyushu 11/18 notice and Fukuoka no-notice unchanged`);
    // 独立性
    assert.equal(await w2.getByTestId('asset-destination-result').count(), 0);
    await w2.locator('select').selectOption('221392');
    assert.match(await w2.getByTestId('asset-destination-result').innerText(), /浜松市 資産税課/);
    assert.match(await res.innerText(), /福岡市 財政局/);
    await w2.locator('select').selectOption('');
    ok(`${name}: widgets independent`);
    // other / blank
    await sel.selectOption('271284');
    await sel.selectOption('other');
    assert.equal(await w1.getByTestId('asset-destination-result').count(), 0);
    assert.equal(await w1.getByTestId('asset-destination-unavailable').count(), 1);
    await sel.selectOption('231169');
    await sel.selectOption('');
    assert.equal(await w1.getByTestId('asset-destination-result').count(), 0);
    assert.equal(await w1.getByTestId('asset-destination-unavailable').count(), 0);
    ok(`${name}: other/blank clears`);
    // disabled
    await page.click('#toggle');
    assert.ok(await sel.isDisabled()); assert.ok(!(await w2.locator('select').isDisabled()));
    ok(`${name}: disabled prop`);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
  assert.deepEqual(blocked, []);
  ok('no network requests attempted');
} finally {
  await browser.close();
  writeFileSync(path.join(OUT, 'asset-destination-qa.log'), results.join('\n') + '\n');
}
console.log(`ALL ${results.length} PASS`);
