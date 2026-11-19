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
    assert.deepEqual(groups, [['福岡市', 7], ['北九州市', 7], ['仙台市', 5], ['さいたま市', 10], ['千葉市', 6]]);
    assert.equal(await sel.inputValue(), '');
    assert.equal(await w1.getByTestId('asset-destination-result').count(), 0);
    ok(`${name}: 5 optgroups [7,7,5,10,6], initial blank`);
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
    // 北九州・福岡の確認日は不変（Kitakyushu 11/18、Fukuoka 案内なし）
    await sel.selectOption('401099');
    assert.ok((await res.innerText()).includes('2026/11/18確認'));
    await sel.selectOption('401315');
    assert.equal(await w1.getByTestId('asset-destination-form-notice').count(), 0);
    ok(`${name}: Kitakyushu 11/18 notice and Fukuoka no-notice unchanged`);
    // 独立性
    assert.equal(await w2.getByTestId('asset-destination-result').count(), 0);
    await w2.locator('select').selectOption('121045');
    assert.match(await w2.getByTestId('asset-destination-result').innerText(), /千葉市 東部市税事務所/);
    assert.match(await res.innerText(), /福岡市 財政局/);
    await w2.locator('select').selectOption('');
    ok(`${name}: widgets independent`);
    // other / blank
    await sel.selectOption('121045');
    await sel.selectOption('other');
    assert.equal(await w1.getByTestId('asset-destination-result').count(), 0);
    assert.equal(await w1.getByTestId('asset-destination-unavailable').count(), 1);
    await sel.selectOption('111104');
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
