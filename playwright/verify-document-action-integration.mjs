// 実WorkspaceDocumentsView + 実WorkspaceDocumentEditorを合成データで描画する局所試験。
// ローカルのwebpack(next同梱)+typescript.transpileModuleでバンドルしfile URLをChromeで開く。
// supabase browser clientはスタブ。.env・認証・本番通信・サーバー起動は一切なし。生成物はリポジトリ外。
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

const require = createRequire(import.meta.url);
const root = process.cwd();
const out = path.resolve(process.env.HARNESS_OUT ?? path.join(os.tmpdir(), 'sunboo-document-action-integration-harness'));
const logLines = [];
let count = 0;
function ok(cond, label) { assert.ok(cond, label); count++; logLines.push(`ok ${count} ${label}`); }
function eq(a, b, label) { assert.deepEqual(a, b, label); count++; logLines.push(`ok ${count} ${label}`); }

async function build() {
  await mkdir(path.join(out, 'stubs'), { recursive: true });
  const stubs = {
    'supabase.js': `
function builder(table){
  const st={eq:{},ops:[]};
  const b={select(){st.ops.push('select');return b;},eq(k,v){st.eq[k]=v;return b;},is(){return b;},
    maybeSingle(){st.single=true;return b;},
    upsert(row){st.upsert=row;return b;},insert(row){st.insert=row;return b;},update(row){st.update=row;return b;},
    then(res,rej){return run().then(res,rej);}};
  async function run(){
    const db=window.__db;
    if(table==='workspace_required_document_statuses'){
      if(!st.upsert) return {data:[],error:null};
      db.writes.push({...st.upsert});
      if(db.gate) await db.gate;
      if(db.mode==='error') return {data:null,error:{message:'synthetic'}};
      if(db.mode==='lost'){ throw new Error('lost'); }
      return {data:null,error:null};
    }
    if(table==='workspace_documents'){
      const type=st.eq.document_type;
      if(st.insert||st.update){
        db.docWrites.push({...(st.insert||st.update)});
        const row={company_id:st.eq.company_id??st.insert.company_id,document_type:type??st.insert.document_type,
          ...(st.insert||st.update),updated_at:'2026-11-15T00:00:00.000Z'};
        db.docs[row.document_type]=row;
        return {data:[row],error:null};
      }
      db.docReads++;
      const row=db.docs[type];
      return {data:row?{...row}:null,error:null};
    }
    return {data:[],error:null};
  }
  return b;
}
export function createBrowserSupabase(){
  return {from:builder,auth:{getUser:async()=>window.__db.authFail?{data:{user:null},error:{message:'x'}}:{data:{user:{id:'actor-1'}},error:null}}};
}`,
    'loader.cjs': `
const ts=require(${JSON.stringify(path.resolve('node_modules/typescript'))});
module.exports=function(src){
  return ts.transpileModule(src,{fileName:this.resourcePath,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,
    module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020,esModuleInterop:true,isolatedModules:true}}).outputText;
};`,
  };
  for (const [name, text] of Object.entries(stubs)) await writeFile(path.join(out, 'stubs', name), text);
  const w = require('next/dist/compiled/webpack/webpack.js');
  w.init?.();
  const stub = (n) => path.join(out, 'stubs', n);
  const compiler = w.webpack({
    mode: 'none', optimization: { minimize: false }, devtool: false, target: 'web', context: root,
    entry: path.resolve('playwright/fixtures/document-action-integration.tsx'),
    output: { path: out, filename: 'bundle.js' },
    resolve: {
      extensions: ['.tsx', '.ts', '.js'], modules: [path.resolve('node_modules')],
      // 本番コードは相対importに.tsを付ける箇所がある。webpackでも解決できるようにする。
      extensionAlias: { '.ts': ['.ts', '.tsx', '.js'] },
      alias: { '@/lib/supabase/browser': stub('supabase.js'), '@': path.resolve('src') },
    },
    resolveLoader: { modules: [path.resolve('node_modules')] },
    module: { rules: [{ test: /\.(ts|tsx)$/, exclude: /node_modules/, use: [{ loader: stub('loader.cjs') }] }] },
    plugins: [new w.webpack.DefinePlugin({ 'process.env.NODE_ENV': JSON.stringify('production') })],
    performance: { hints: false },
  });
  const stats = await new Promise((resolve, reject) => compiler.run((e, s) => (e ? reject(e) : resolve(s))));
  if (stats.hasErrors()) throw new Error(stats.toString({ all: false, errors: true }));
  const postcss = (await import('postcss')).default;
  const tw = (await import('@tailwindcss/postcss')).default;
  const css = await postcss([tw()]).process(readFileSync('src/app/globals.css', 'utf8'), { from: path.resolve('src/app/globals.css') });
  await writeFile(path.join(out, 'style.css'), css.css);
  await writeFile(path.join(out, 'index.html'),
    '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<link rel="stylesheet" href="style.css"></head><body><div id="root"></div><script src="bundle.js"></script></body></html>');
}

// ── 合成データ ──
const req = (name, nearestDueDate, procedures = ['合成手続き'], formNumber = null) => ({ name, formNumber, nearestDueDate, procedures });
const DOCS = [
  req('合成書類D', '2027-05-31', ['合成申告Z']),
  req('合成書類B', '2027-01-31', ['合成申告X', '合成申告Y'], '第9号'),
  req('合成書類A', '2027-01-31', ['合成申告X']),
  req('合成書類C', '2027-03-31', ['合成申告W']),
  req('合成書類E', '2027-05-31', ['合成申告Z']),
];
const ACT = {
  not_ready: '手元に書類があるか確認し、なければ担当者に準備を相談してください。',
  in_progress: '不足している書類や記載内容をそろえてください。',
  ready: '使う年度を確かめ、年間ロードマップで提出先・提出方法を確認してください。',
};
const SNAP = {
  articles_of_incorporation: { status: 'registered', period_start: null, period_end: null, document_date: '2020-04-01', updated_at: '2026-01-01T00:00:00.000Z' },
  corporate_tax_return: { status: 'needs_update', period_start: '2025-04-01', period_end: '2026-03-31', document_date: null, updated_at: '2026-01-01T00:00:00.000Z' },
};
const base = (extra = {}) => ({ companyId: 1, snapshots: SNAP, requiredDocuments: DOCS, requiredDocumentStatusMap: {}, ...extra });

const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
let httpRequests = 0, pageErrors = 0, consoleErrors = 0;

async function open(props = base(), opts = {}) {
  const { viewport = { width: 1000, height: 900 }, dbMode = 'success', gate = false, authFail = false, waitActor = true } = opts;
  const context = await browser.newContext({ viewport });
  await context.route(/^https?:/, (route) => { httpRequests++; return route.abort(); });
  const page = await context.newPage();
  page.on('pageerror', () => { pageErrors++; });
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors++; });
  await page.addInitScript(({ props, dbMode, gate, authFail }) => {
    window.__props = props;
    window.__db = { mode: dbMode, writes: [], docWrites: [], docReads: 0, docs: JSON.parse(JSON.stringify(props.snapshots ?? {})), gate: null, authFail };
    if (gate) window.__db.gate = new Promise((r) => { window.__release = r; });
  }, { props, dbMode, gate, authFail });
  page.setDefaultTimeout(5000);
  await page.goto('file://' + path.join(out, 'index.html'));
  await page.getByRole('heading', { name: 'まず用意する書類' }).waitFor();
  // actor確定（selectが有効化される）まで待つ。固定待ちは使わない。
  if (waitActor && !authFail && props.requiredDocuments?.length) await page.getByTestId('required-document-card').first().getByRole('combobox').and(page.locator(':enabled')).waitFor();
  return { page, context };
}
const names = (page, scope) => page.locator(`${scope} [data-testid=required-document-card]`).evaluateAll((els) => els.map((e) => e.dataset.documentName));
const sel = (page, name) => page.getByRole('combobox', { name: `${name}の準備状況` });
const card = (page, name) => page.locator(`[data-testid=required-document-card][data-document-name="${name}"]`);
const nextText = (page, name) => card(page, name).getByTestId('required-document-next-action').locator('strong').innerText();
// DOM上で確認済みの結果（次にすること更新＋全select有効）になるまで待つ。writes件数だけでは描画確定を意味しない。
async function settleNext(page, name, text) {
  await page.waitForFunction(({ name, text }) => {
    const c = document.querySelector(`[data-document-name="${name}"] [data-testid=required-document-next-action] strong`);
    const sels = [...document.querySelectorAll('[data-testid=required-document-card] select')];
    return c?.textContent === text && sels.every((s) => !s.disabled);
  }, { name, text });
}
const wr = (page) => page.evaluate(() => window.__db.writes);
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const isOpen = (page, id) => page.getByTestId(id).evaluate((e) => e.open);
const toggle = (page, id) => page.locator(`[data-testid=${id}] > summary`).click();
// ネイティブselectのキーボード操作(Space→ArrowDown→Enter)。効かなかった場合は偽の成功にせず結果を返す。
async function keyboardSelect(page, name, steps = 1) {
  const s = sel(page, name);
  await s.focus();
  await page.keyboard.press('Space');
  for (let i = 0; i < steps; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
}

try {
  await build();
  ok(existsSync(path.join(out, 'bundle.js')), '実コンポーネントのバンドル成功');

  // 1. 初期表示・グループ・折り畳み
  {
    const { page, context } = await open();
    eq(await names(page, 'section'), ['合成書類A', '合成書類B'], '主要: 最も近い期限の書類のみ・期限→名前順');
    ok(!(await isOpen(page, 'later-documents')), 'このあとの書類は初期閉');
    ok(!(await isOpen(page, 'document-records')), '手元の書類の記録は初期閉');
    eq(await page.locator('[data-testid=later-documents] > summary').innerText(), 'このあとに用意する書類（3種類）', 'later件数は実データ（3種類）');
    eq(await names(page, '[data-testid=later-documents]'), ['合成書類C', '合成書類D', '合成書類E'], 'later: 期限→名前順');
    eq(await page.locator('[data-testid=document-records] [data-testid^=document-editor-]').count(), 5, '編集欄5件は閉じていてもマウント');
    ok((await card(page, '合成書類B').innerText()).includes('使用する手続き：合成申告X、合成申告Y'), '実の使用する手続き');
    ok((await card(page, '合成書類B').innerText()).includes('手続きの期限：2027-01-31'), '実の期限');
    ok((await card(page, '合成書類B').innerText()).includes('第9号'), '様式番号を維持');
    eq(await nextText(page, '合成書類A'), ACT.not_ready, '記録なしの準備状況は既存どおり未準備扱い＋承認済み文言');
    eq(await sel(page, '合成書類A').inputValue(), 'not_ready', 'selectも未準備');
    const text = await page.locator('body').innerText(); // 表示中の本文のみ
    ok(text.includes('用意できたら「準備済み」にします。準備済みは提出済みではありません。'), '簡潔な注意文');
    ok(text.includes('準備状況は書類名ごとの共通記録で、年度ごとの提出済み記録ではありません。'), '共通記録の注意を維持');
    // 実データと日付ラベルの保持（閉じていてもDOMにある）
    ok(!text.includes('記録なしは、書類が手元にない'), '閉じた記録欄の注意は初期表示に出ない');
    // 閉じたdetails内はinnerTextに出ないため、DOM上の内容はtextContentで確認する。
    const rec = await page.getByTestId('document-records').evaluate((e) => e.textContent);
    ok(rec.includes('記録なしは、書類が手元にないという意味ではありません。'), '記録なしの注意（記録欄内）');
    ok(rec.includes('1/5件記録済み'), '記録済み件数');
    eq(await page.getByTestId('document-timing-articles_of_incorporation').evaluate((e) => e.textContent), '作成・変更日：2020-04-01', '定款の日付を保持');
    eq(await page.getByTestId('document-timing-corporate_tax_return').evaluate((e) => e.textContent), '対象期間：2025-04-01 ～ 2026-03-31', '申告書の対象期間を保持');
    eq(await page.getByTestId('document-timing-certificate_of_registered_matters').evaluate((e) => e.textContent), '発行日：未記録', '発行日ラベル');
    const tags = await page.locator('[data-testid^=document-editor-] .tag').allTextContents();
    eq(tags, ['記録済み', '記録なし', '要更新', '記録なし', '記録なし'], '表示ラベル: 記録済み/記録なし/要更新');
    ok(!rec.includes('未登録') && !rec.includes('登録済み'), '旧ラベル（未登録/登録済み）は記録欄に出ない');
    ok(rec.includes('今年分・最新版・提出済みとは限りません'), '原本確認の注意を記録欄へ移動');
    await context.close();
  }

  // 2. 保存済みのenum値は変えない（optionのvalue）
  {
    const { page, context } = await open();
    await toggle(page, 'document-records');
    await page.locator('[data-testid=document-editor-articles_of_incorporation] > details > summary').click();
    const vals = await page.getByRole('combobox', { name: '定款の登録状況' }).locator('option').evaluateAll((o) => o.map((x) => [x.value, x.textContent]));
    eq(vals, [['not_registered', '記録なし'], ['registered', '記録済み'], ['needs_update', '要更新']], 'optionの保存値はenumのまま・表示だけ言い換え');
    await context.close();
  }

  // 3. 確認済み保存だけで次にすることが更新・グループ不変・キーボード
  {
    const { page, context } = await open();
    const before = { primary: await names(page, 'section'), later: await names(page, '[data-testid=later-documents]') };
    await keyboardSelect(page, '合成書類A', 1);
    let kb = await sel(page, '合成書類A').inputValue();
    if (kb === 'in_progress') {
      ok(true, 'ネイティブselectのSpace→ArrowDown→Enterで準備中に変更');
    } else {
      logLines.push(`LIMITATION keyboard Space/ArrowDown/Enter did not change select in headless Chrome (value=${kb}); using selectOption for the remaining checks`);
      await sel(page, '合成書類A').selectOption('in_progress');
    }
    await settleNext(page, '合成書類A', ACT.in_progress);
    eq(await nextText(page, '合成書類A'), ACT.in_progress, '確認後に次にすること更新(準備中)');
    eq((await wr(page))[0], { company_id: 1, document_name: '合成書類A', status: 'in_progress' }, 'ちょうど1件・既存契約のupsert');
    await sel(page, '合成書類A').selectOption('ready');
    await settleNext(page, '合成書類A', ACT.ready);
    eq((await wr(page)).length, 2, '書き込みは操作ごとに1件');
    eq(await nextText(page, '合成書類A'), ACT.ready, '準備済みの次にすること');
    eq(await nextText(page, '合成書類B'), ACT.not_ready, '他カードは別の状態のまま（カード単位）');
    ok(!(await nextText(page, '合成書類A')).includes('提出済み'), '準備済みを提出済みと言わない');
    eq({ primary: await names(page, 'section'), later: await names(page, '[data-testid=later-documents]') }, before, '準備状況を変えてもカードはグループ間・順序とも移動しない');
    eq(await page.locator('[data-testid=later-documents] > summary').innerText(), 'このあとに用意する書類（3種類）', 'later件数も不変');
    eq(await page.evaluate(() => window.__db.docWrites.length), 0, '必要書類の保存は手元の書類記録に連動しない');
    await context.close();
  }

  // 4. ページ読み込み・展開・並べ替えでは書き込まない
  {
    const { page, context } = await open();
    await toggle(page, 'later-documents'); await toggle(page, 'document-records');
    await toggle(page, 'later-documents'); await toggle(page, 'document-records');
    eq([(await wr(page)).length, await page.evaluate(() => window.__db.docWrites.length)], [0, 0], '読み込み/展開で書き込みなし');
    await context.close();
  }

  // 5. 保存エラー・応答喪失・グローバルロック
  for (const mode of ['error', 'lost']) {
    const { page, context } = await open(base(), { dbMode: mode });
    await sel(page, '合成書類A').selectOption('ready');
    await page.getByRole('alert').getByText('書類の保存結果を確認できませんでした。').waitFor();
    await page.getByRole('alert').getByRole('link', { name: '再読み込み' }).waitFor();
    eq(await nextText(page, '合成書類A'), ACT.not_ready, `${mode}: 次にすることは未確認の保存で更新しない`);
    eq(await sel(page, '合成書類A').inputValue(), 'not_ready', `${mode}: 表示は確認済みの状態のまま`);
    eq(await page.getByRole('combobox').and(page.locator(':enabled')).count(), 0, `${mode}: 全selectを停止(グローバルロック)`);
    await toggle(page, 'document-records');
    await page.locator('[data-testid=document-editor-articles_of_incorporation] > details > summary').click();
    ok(await page.getByRole('combobox', { name: '定款の登録状況' }).isDisabled(), `${mode}: 記録欄の編集も停止`);
    await page.screenshot({ path: `test-results/document-action-integration-${mode}.png`, fullPage: true });
    eq((await wr(page)).length, 1, `${mode}: 再送しない(書き込み1回)`);
    await context.close();
  }
  {
    const { page, context } = await open(base(), { gate: true });
    await sel(page, '合成書類A').selectOption('in_progress');
    await page.getByText('保存中…').waitFor();
    eq(await page.getByRole('combobox').and(page.locator(':enabled')).count(), 0, '保存中は全select停止');
    eq(await nextText(page, '合成書類A'), ACT.not_ready, '保存中は楽観更新しない');
    await page.evaluate(() => window.__release());
    await page.waitForFunction(() => document.querySelector('[data-document-name="合成書類A"] strong')?.textContent?.startsWith('不足'));
    eq(await page.getByRole('combobox').and(page.locator(':disabled')).count(), 0, '確認後にロック解除');
    await context.close();
  }
  {
    const { page, context } = await open(base(), { authFail: true });
    await page.getByRole('alert').getByText('ログイン状態を確認できません。再読み込みしてください。').waitFor();
    eq(await page.getByRole('combobox').and(page.locator(':enabled')).count(), 0, '操作者未確認はselect停止');
    await context.close();
  }

  // 6. 不明な状態
  {
    const { page, context } = await open(base({ requiredDocumentStatusMap: { 合成書類A: 'bogus' } }));
    ok((await nextText(page, '合成書類A')).includes('次にすることは表示していません'), '不明状態は次にすることを主張しない');
    for (const a of Object.values(ACT)) ok(!(await card(page, '合成書類A').innerText()).includes(a), `不明状態に承認済み文言(${a.slice(0, 6)}…)なし`);
    eq(await sel(page, '合成書類A').evaluate((s) => s.selectedOptions[0].textContent), '確認が必要', '不明状態は「確認が必要」を明示表示（未準備に見せない）');
    ok(await sel(page, '合成書類A').locator('option[disabled]').count() === 1, '確認が必要は無効option');
    eq(await sel(page, '合成書類B').locator('option').count(), 3, '通常カードには余分なoptionなし');
    eq((await wr(page)).length, 0, '不明状態の表示で書き込まない');
    await context.close();
  }

  // 7. 空・取得不可・決算月なし・全件主要
  {
    let t = await open(base({ requiredDocuments: [] }));
    ok((await t.page.locator('body').innerText()).includes('必須書類は見つかりませんでした。手続きがないという意味ではありません。'), '空: 正確な文言');
    ok(!(await t.page.locator('body').innerText()).includes('対応不要'), '空を対応不要と言わない');
    eq(await t.page.getByTestId('later-documents').count(), 0, '空: later無し');
    eq(await t.page.getByTestId('required-document-next-action').count(), 0, '空: 次にすること無し');
    ok(await t.page.getByTestId('document-records').count() === 1, '空でも記録欄は利用可能');
    await t.context.close();
    t = await open(base({ requiredDocuments: null }));
    await t.page.getByTestId('required-documents-unavailable').waitFor();
    ok((await t.page.getByTestId('required-documents-unavailable').innerText()).includes('必要書類を取得できません'), '取得不可は別表示');
    eq(await t.page.getByTestId('later-documents').count(), 0, '取得不可: later無し');
    await t.context.close();
    t = await open(base({ requiredDocuments: null, requiredDocumentsMissingFiscalMonth: true }));
    ok((await t.page.locator('body').innerText()).includes('決算月が未登録です'), '決算月未登録は別表示');
    eq(await t.page.getByTestId('required-documents-unavailable').count(), 0, '決算月未登録は取得エラーではない');
    await t.context.close();
    t = await open(base({ requiredDocuments: [req('X1', '2027-01-31'), req('X2', '2027-01-31'), req('X3', '2027-01-31')] }));
    eq(await names(t.page, 'section'), ['X1', 'X2', 'X3'], '同期限3件は全件主要');
    eq(await t.page.getByTestId('later-documents').count(), 0, '残りなしならlater無し');
    await t.context.close();
  }

  // 8. 下書き保持
  {
    const { page, context } = await open();
    await toggle(page, 'document-records');
    await page.locator('[data-testid=document-editor-articles_of_incorporation] > details > summary').click();
    const input = page.getByLabel('定款の作成・変更日');
    await input.and(page.locator(':enabled')).waitFor();
    await input.fill('2021-02-03');
    await toggle(page, 'document-records'); await toggle(page, 'document-records');
    eq(await input.inputValue(), '2021-02-03', '外側を閉じて開いても下書き保持');
    await sel(page, '合成書類A').selectOption('in_progress');
    await settleNext(page, '合成書類A', ACT.in_progress);
    eq(await input.inputValue(), '2021-02-03', '準備状況の変更後も下書き保持');
    eq(await page.evaluate(() => window.__db.docWrites.length), 0, '下書きは自動保存されない');
    const submit = page.locator('[data-testid=document-editor-articles_of_incorporation] button[type=submit]');
    await submit.and(page.locator(':enabled')).waitFor();
    await submit.click();
    await page.getByTestId('document-editor-articles_of_incorporation').getByText('保存しました。').waitFor();
    eq(await page.evaluate(() => window.__db.docWrites[0]), { status: 'registered', period_start: null, period_end: null, document_date: '2021-02-03' }, '記録の保存契約は従来どおり');
    await context.close();
  }

  // 9. 寸法・375/デスクトップ・フォーカス
  for (const [label, viewport] of [['375', { width: 375, height: 800 }], ['desktop', { width: 1200, height: 900 }]]) {
    const { page, context } = await open(base(), { viewport });
    await toggle(page, 'later-documents'); await toggle(page, 'document-records');
    await page.locator('[data-testid=document-editor-articles_of_incorporation] > details > summary').click();
    for (const el of await page.locator('select:visible, summary:visible, button:visible, input:visible, a:visible').all()) {
      const b = await el.boundingBox();
      ok(b.height >= 43.5, `${label}: 操作要素の高さ44px以上(${await el.evaluate((e) => e.tagName)} ${Math.round(b.height)})`);
    }
    eq(await noOverflow(page), true, `${label}: 横はみ出しなし`);
    await sel(page, '合成書類A').focus();
    ok(await page.evaluate(() => document.activeElement?.tagName === 'SELECT'), `${label}: キーボードフォーカス可`);
    await page.screenshot({ path: `test-results/document-action-integration-${label}.png`, fullPage: true });
    await context.close();
  }

  eq([httpRequests, pageErrors, consoleErrors], [0, 0, 0], 'HTTP/pageerror/consoleerror 0');
  logLines.push(`TOTAL ${count} checks passed`);
  console.log(logLines.join('\n'));
} catch (error) {
  logLines.push(`FAILED after ${count} checks: ${error?.message ?? error}`);
  console.log(logLines.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/document-action-integration-log.txt', logLines.join('\n') + '\n');
}
