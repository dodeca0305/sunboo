// 実AnnualRoadmapView/ProcedureCompletionFlowを合成データで描画する局所試験。
// ローカルのwebpack(next同梱)+typescript.transpileModuleでバンドルし、file URLをChromeで開く。
// supabase/navigation/analytics/担当欄はスタブ。.env・認証・本番通信・サーバー起動は一切なし。
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

const require = createRequire(import.meta.url);
const root = process.cwd();
// ハーネスの生成物（バンドル・スタブ）はlint対象に混ざらないようリポジトリ外へ出す。ログ/PNGだけtest-resultsへ。
const out = path.resolve(process.env.HARNESS_OUT ?? path.join(os.tmpdir(), 'sunboo-document-completion-flow-harness'));
const logLines = [];
let count = 0;
function ok(cond, label) { assert.ok(cond, label); count++; logLines.push(`ok ${count} ${label}`); }
function eq(a, b, label) { assert.deepEqual(a, b, label); count++; logLines.push(`ok ${count} ${label}`); }

// ── ビルド ─────────────────────────────────────────────
async function build() {
  await mkdir(path.join(out, 'stubs'), { recursive: true });
  const stubs = {
    'supabase.js': `
function builder(table){
  const st={};
  const b={select(){return b;},eq(){return b;},single(){return b;},upsert(row){st.upsert=row;return b;},
    then(res,rej){return run().then(res,rej);}};
  async function run(){
    const db=window.__db;
    if(table!=='workspace_procedure_statuses') return {data:[],error:null};
    if(st.upsert){
      const r=st.upsert;db.writes.push({...r});
      if(db.gate) await db.gate;
      if(db.mode==='error') return {data:null,error:{message:'synthetic'}};
      if(db.mode==='nothing-stored-lost') throw new Error('lost');
      const row={company_id:r.company_id,procedure_id:r.procedure_id,occurrence_key:r.occurrence_key,status:r.status};
      db.rows=db.rows.filter(x=>!(x.procedure_id===row.procedure_id&&x.occurrence_key===row.occurrence_key)).concat(row);
      if(db.mode==='lost') throw new Error('lost');
      return {data:row,error:null};
    }
    db.reads++;
    if(db.readFail) return {data:null,error:{message:'synthetic'}};
    return {data:db.rows.map(x=>({...x})),error:null};
  }
  return b;
}
export function createBrowserSupabase(){return {from:builder};}`,
    'nav.js': `
export function useRouter(){return {push:u=>window.__pushes.push(u),refresh:()=>{window.__refreshes++;}};}
export function usePathname(){return window.__pathname;}`,
    'analytics.js': 'export function trackEvent(){}',
    'resp.js': 'export function ProcedureResponsibilityField(){return null;}',
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
    entry: path.resolve('playwright/fixtures/document-completion-flow.tsx'),
    output: { path: out, filename: 'bundle.js' },
    resolve: {
      extensions: ['.tsx', '.ts', '.js'], modules: [path.resolve('node_modules')],
      alias: {
        '@/lib/supabase/browser': stub('supabase.js'), '@/components/ProcedureResponsibility': stub('resp.js'),
        '@/lib/analytics': stub('analytics.js'), 'next/navigation': stub('nav.js'),
        '@': path.resolve('src'),
      },
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

// ── 合成データ ──────────────────────────────────────────
const doc = (name, extra = {}) => ({ name, form_number: null, is_required: true, notes: null, item_type: 'document', sort_order: 0, ...extra });
const DOCS = [
  doc('申告書A', { sort_order: 1 }), doc('明細書B', { sort_order: 2 }), doc('任意C', { is_required: false, sort_order: 3 }),
  doc('事前準備X', { item_type: 'preparation', sort_order: 4 }), doc('提出前Y', { item_type: 'checklist', sort_order: 5 }),
];
const KEY = '101:2027-01-31';
const TARGET = 'roadmap-procedure-101-2027-01-31';
const NAME = '合成償却資産申告';

const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
let httpRequests = 0, pageErrors = 0, consoleErrors = 0;

async function open(opts = {}) {
  const docs = 'docs' in opts ? opts.docs : DOCS;
  const { mode = 'editable', statusMap = {}, rows = [], dbMode = 'success', viewport = { width: 1000, height: 900 }, gate = false } = opts;
  const context = await browser.newContext({ viewport });
  await context.route(/^https?:/, (route) => { httpRequests++; return route.abort(); });
  const page = await context.newPage();
  page.on('pageerror', () => { pageErrors++; });
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors++; });
  await page.addInitScript(({ mode, docs, statusMap, rows, dbMode, gate }) => {
    window.__initial = { mode, companyId: 1, docs, statusMap, version: 0 };
    window.__db = { rows, mode: dbMode, writes: [], reads: 0, readFail: false, gate: null };
    if (gate) window.__db.gate = new Promise((r) => { window.__release = r; });
    window.__pushes = []; window.__refreshes = 0; window.__pathname = '/admin/workspaces/1/roadmap';
    window.__want = 0;
    window.__update = (f) => { window.__want++; window.__setCfg((c) => ({ ...f(c), version: c.version + 1 })); };
  }, { mode, docs, statusMap, rows, dbMode, gate });
  page.setDefaultTimeout(5000);
  await page.goto('file://' + path.join(out, 'index.html'));
  await page.locator('#' + TARGET).waitFor();
  return { page, context };
}
// 対象手続き101のカード（期限が変わっても追従する）。
const card = (page) => page.locator('[id^="roadmap-procedure-101-"]');
const flow = (page) => card(page).getByTestId('completion-flow');
const select = (page) => card(page).getByRole('combobox', { name: `${NAME}の対応状況` });
const db = (page) => page.evaluate(() => ({ writes: window.__db.writes, reads: window.__db.reads, rows: window.__db.rows, pushes: window.__pushes, refreshes: window.__refreshes }));
const boxes = (page) => flow(page).getByRole('checkbox');
async function checkAllDocs(page) { await flow(page).getByRole('checkbox', { name: /申告書A/ }).check(); await flow(page).getByRole('checkbox', { name: /明細書B/ }).check(); }
async function toConfirm(page) { await checkAllDocs(page); await flow(page).getByRole('button', { name: '提出後の確認へ' }).click(); }
async function bothConfirms(page) { for (const b of await boxes(page).all()) await b.check(); }
const checkedStates = async (page) => boxes(page).evaluateAll((els) => els.map((e) => e.checked));
// 親の更新（__update）が描画に反映されるまで待ってから読む（固定待ちは使わない）。
async function update(page, fn, arg) {
  await page.evaluate(({ src, arg }) => {
    const f = new Function('c', 'arg', `return (${src})(c, arg)`);
    window.__update((c) => f(c, arg));
  }, { src: fn.toString(), arg });
  await page.waitForFunction(() => document.querySelector('main')?.dataset.version === String(window.__want));
}
// 更新後にチェック状態が期待に確定するまで待つ（旧DOMを読まない）。
async function settled(page, states) {
  await page.waitForFunction((s) => {
    const f = document.querySelector('[data-testid=completion-flow]');
    const c = f ? [...f.querySelectorAll('input[type=checkbox]')].map((e) => e.checked) : null;
    return JSON.stringify(c) === JSON.stringify(s);
  }, states);
  return checkedStates(page);
}

try {
  await build();
  ok(existsSync(path.join(out, 'bundle.js')), '実コンポーネントのバンドル成功');

  // 1. 読み取り専用・対象外
  for (const mode of ['share', 'public']) {
    const { page, context } = await open({ mode });
    eq(await flow(page).count(), 0, `${mode}: 確認導線なし`);
    eq(await page.getByRole('checkbox').count(), 0, `${mode}: チェック欄なし`);
    eq(await page.getByRole('combobox', { name: /対応状況/ }).count(), 0, `${mode}: 状態変更UIなし`);
    eq(await page.getByTestId('procedure-completion-guide').count(), 2, `${mode}: 静的案内を維持`);
    ok(await card(page).getByText('必要書類').count() === 1, `${mode}: 従来の必要書類表示を維持`);
    await context.close();
  }
  {
    const { page, context } = await open();
    eq(await page.getByTestId('completion-flow').count(), 1, '編集: 対象カードだけ確認導線');
    eq(await page.locator('#roadmap-procedure-102-2027-02-28').getByTestId('completion-flow').count(), 0, '他コード: 導線なし');
    eq(await page.locator('#roadmap-procedure-102-2027-02-28').getByTestId('procedure-completion-guide').count(), 1, '他コード: 静的案内を維持');
    eq(await card(page).getByTestId('procedure-completion-guide').count(), 0, '導線表示中は同じ2条件の静的案内を隠す');
    await context.close();
  }

  // 2. 書類：実データ・任意・準備/チェック
  {
    const { page, context } = await open();
    await flow(page).getByRole('heading', { name: '書類を用意' }).waitFor();
    eq(await boxes(page).count(), 2, '必須書類だけチェック欄（任意・準備・提出前チェックは非ゲート）');
    ok(await flow(page).getByText('任意C').count() === 1 && (await flow(page).innerText()).includes('完了の条件ではありません'), '任意は情報のみ');
    ok((await card(page).innerText()).includes('事前準備X') && (await card(page).innerText()).includes('提出前Y'), '事前準備・提出前チェックは案内のまま');
    eq(await checkedStates(page), [false, false], '初期は未チェック');
    ok(await flow(page).getByRole('button', { name: '提出後の確認へ' }).isDisabled(), '初期: 次へ無効');
    ok((await flow(page).getByTestId('completion-docs-status').innerText()).includes('0/2'), '初期: 0/2');
    await flow(page).getByRole('checkbox', { name: /申告書A/ }).check();
    ok(await flow(page).getByRole('button', { name: '提出後の確認へ' }).isDisabled(), '一部: 次へ無効');
    ok((await flow(page).getByTestId('completion-docs-status').innerText()).includes('1/2'), '一部: 1/2');
    await flow(page).getByRole('checkbox', { name: /明細書B/ }).check();
    ok((await flow(page).getByTestId('completion-docs-status').innerText()).includes('準備できました'), '全て: 準備できました');
    ok(await flow(page).getByRole('button', { name: '提出後の確認へ' }).isEnabled(), '全て: 次へ有効');
    let d = await db(page);
    eq([d.writes.length, d.reads, d.pushes.length, d.refreshes], [0, 0, 0, 0], '準備完了だけでは保存・遷移なし');
    eq(await select(page).inputValue(), 'not_started', '状態は未着手のまま');
    await context.close();
  }

  // 3. 書類欠落・空・必須0件は保留
  for (const [label, docs, text] of [
    ['未取得(undefined)', undefined, '必要書類の登録を確認できない'],
    ['空配列', [], '必要書類の登録を確認できない'],
    ['任意のみ', [doc('任意だけ', { is_required: false })], '必須の書類が登録されていない'],
  ]) {
    const { page, context } = await open({ docs });
    ok((await flow(page).getByTestId('completion-flow-blocked').innerText()).includes(text), `${label}: 新規完了を保留し理由を表示`);
    eq(await boxes(page).count(), 0, `${label}: チェック欄なし（空の全チェック扱いをしない）`);
    eq(await flow(page).getByRole('button').count(), 0, `${label}: 完了ボタンなし`);
    await select(page).selectOption('done');
    const d = await db(page);
    eq(d.writes.length, 0, `${label}: 対応状況のdoneも即保存しない`);
    await context.close();
  }

  // 4. 提出後の確認・完了・二重クリック
  {
    const { page, context } = await open();
    await toConfirm(page);
    await flow(page).getByRole('heading', { name: '提出後の確認' }).waitFor();
    const labels = await flow(page).locator('label').allInnerTexts();
    ok(labels[0].startsWith('申告書を提出した') && labels[1].startsWith('受付を確認し、控えを保管した'), '既存filing_onlyの2行をそのまま表示');
    ok((await flow(page).innerText()).includes('公式案内に沿って申告書を提出します。'), '既存の補足を失わない');
    const finish = flow(page).getByRole('button', { name: '完了にする' });
    ok(await finish.isDisabled(), '確認前は完了不可');
    await boxes(page).nth(0).check();
    ok(await finish.isDisabled(), '1つだけでは完了不可');
    await boxes(page).nth(1).check();
    ok(await finish.isEnabled(), '2つで完了可');
    let d = await db(page);
    eq([d.writes.length, d.pushes.length], [0, 0], '2確認が揃っても自動保存・自動完了しない');
    await finish.dblclick();
    await page.waitForFunction(() => window.__pushes.length > 0);
    d = await db(page);
    eq(d.writes.length, 1, '完了は1回だけ送信（二重クリック）');
    eq([d.writes[0].company_id, d.writes[0].procedure_id, d.writes[0].occurrence_key, d.writes[0].status], [1, 101, '2027-01-31', 'done'], '会社・手続き・期限・doneで保存');
    eq(d.pushes, ['/admin/workspaces/1'], '保存確認後に会社ホームへ');
    const fb = await page.evaluate(() => sessionStorage.getItem('sunboo:workspace:1:completion-feedback'));
    ok(fb && JSON.parse(fb).previousStatus === 'not_started' && JSON.parse(fb).procedureId === 101, '既存の完了通知を設定');
    eq(await page.evaluate(() => sessionStorage.getItem('sunboo:workspace:1:pending-procedure-status')), null, '保存確認後に未確認記録を消去');
    await context.close();
  }

  // 5. 戻る・解除
  {
    const { page, context } = await open();
    await toConfirm(page);
    await boxes(page).nth(0).check();
    await flow(page).getByRole('button', { name: '戻る' }).click();
    eq(await checkedStates(page), [true, true], '戻っても書類チェックを保持');
    await flow(page).getByRole('button', { name: '提出後の確認へ' }).click();
    eq(await checkedStates(page), [true, false], '戻っても提出後の確認を保持');
    await boxes(page).nth(1).check();
    await flow(page).getByRole('button', { name: '戻る' }).click();
    await flow(page).getByRole('checkbox', { name: /申告書A/ }).uncheck();
    ok(await flow(page).getByRole('button', { name: '提出後の確認へ' }).isDisabled(), '解除で次へ無効');
    await flow(page).getByRole('checkbox', { name: /申告書A/ }).check();
    await flow(page).getByRole('button', { name: '提出後の確認へ' }).click();
    eq(await checkedStates(page), [false, false], '書類解除で提出後の確認を消去し再確認が必要');
    ok(await flow(page).getByRole('button', { name: '完了にする' }).isDisabled(), '再確認まで完了不可');
    eq((await db(page)).writes.length, 0, '戻る・解除で保存しない');
    await context.close();
  }

  // 6. 対応状況の選択
  {
    const { page, context } = await open();
    await select(page).selectOption('done');
    eq((await db(page)).writes.length, 0, '「完了」を選んでも即保存しない');
    eq(await select(page).inputValue(), 'not_started', '選択表示は保存済み状態のまま');
    ok(await flow(page).getByRole('heading').first().evaluate((el) => document.activeElement === el), '確認導線へ移動（フォーカス）');
    await select(page).selectOption('in_progress');
    await page.waitForFunction(() => window.__refreshes > 0);
    let d = await db(page);
    eq(d.writes.map((w) => w.status), ['in_progress'], '進行中は従来どおり保存');
    await select(page).selectOption('on_hold');
    await page.waitForFunction(() => window.__refreshes > 1);
    d = await db(page);
    eq(d.writes.map((w) => w.status), ['in_progress', 'on_hold'], '保留も従来どおり保存');
    await select(page).selectOption('not_started');
    await page.waitForFunction(() => window.__refreshes > 2);
    eq((await db(page)).writes.map((w) => w.status).pop(), 'not_started', '未着手も従来どおり保存');
    // 他カードの完了は従来どおり即保存
    await page.locator('#roadmap-procedure-102-2027-02-28').getByRole('combobox', { name: '合成法人税申告の対応状況' }).selectOption('done');
    await page.waitForFunction(() => window.__pushes.length > 0);
    eq((await db(page)).writes.pop().procedure_id, 102, '他手続きは従来どおり直接保存');
    await context.close();
  }

  // 7. 保存中の遮断
  {
    const { page, context } = await open({ gate: true });
    await toConfirm(page); await bothConfirms(page);
    await flow(page).getByRole('button', { name: '完了にする' }).click();
    await page.getByText('手続き状態を保存中…').waitFor();
    ok(await flow(page).getByRole('button', { name: '完了にする' }).isDisabled(), '保存中は完了ボタン無効');
    ok(await boxes(page).first().isDisabled(), '保存中はチェック無効');
    ok(await select(page).isDisabled(), '保存中は状態選択無効');
    eq((await db(page)).pushes.length, 0, '保存確認前に成功遷移しない');
    await page.evaluate(() => window.__release());
    await page.waitForFunction(() => window.__pushes.length > 0);
    eq((await db(page)).writes.length, 1, '保存中の追加送信なし');
    await context.close();
  }

  // 8. 失敗・結果不明・再取得
  {
    const { page, context } = await open({ dbMode: 'error' });
    await toConfirm(page); await bothConfirms(page);
    await flow(page).getByRole('button', { name: '完了にする' }).click();
    await page.getByRole('alert').filter({ hasText: '保存結果を確認できませんでした' }).waitFor();
    let d = await db(page);
    eq([d.writes.length, d.pushes.length], [1, 0], '失敗: 成功表示・遷移なし');
    ok(await flow(page).getByRole('button', { name: '完了にする' }).isDisabled() && await boxes(page).first().isDisabled(), '結果未確認中は再送・操作停止');
    ok(await page.evaluate(() => !!sessionStorage.getItem('sunboo:workspace:1:pending-procedure-status')), '未確認記録を保持');
    await page.evaluate(() => { window.__db.readFail = true; });
    await page.getByRole('button', { name: '保存結果を確認' }).click();
    await page.getByRole('alert').filter({ hasText: '保存結果を取得できませんでした' }).waitFor();
    ok(await page.evaluate(() => !!sessionStorage.getItem('sunboo:workspace:1:pending-procedure-status')), '再取得失敗: 未確認状態を維持');
    ok(await flow(page).getByRole('button', { name: '完了にする' }).isDisabled() && await boxes(page).first().isDisabled() && await select(page).isDisabled(), '再取得失敗: 操作停止を維持');
    eq(await select(page).inputValue(), 'not_started', '再取得失敗: 未着手等へ置換しない（表示は直前の保存済み状態）');
    eq((await db(page)).pushes.length, 0, '再取得失敗: 完了にならない');
    await page.evaluate(() => { window.__db.readFail = false; });
    await page.getByRole('button', { name: '保存結果を確認' }).click();
    await page.getByRole('alert').filter({ hasText: '送信した状態と異なります' }).waitFor();
    d = await db(page);
    eq([d.writes.length, d.pushes.length], [1, 0], '再取得で未保存と判明: 再送なし・完了にならない');
    ok(await boxes(page).first().isEnabled(), '再確認後に操作を再開');
    await context.close();
  }
  {
    const { page, context } = await open({ dbMode: 'lost' });
    await toConfirm(page); await bothConfirms(page);
    await flow(page).getByRole('button', { name: '完了にする' }).click();
    await page.getByRole('button', { name: '保存結果を確認' }).waitFor();
    eq((await db(page)).pushes.length, 0, '応答喪失: 完了を表示しない');
    await page.getByRole('button', { name: '保存結果を確認' }).click();
    await page.waitForFunction(() => window.__pushes.length > 0);
    const d = await db(page);
    eq([d.writes.length, d.pushes], [1, ['/admin/workspaces/1']], '再取得で保存済みと確認できた場合だけ完了扱い（再送なし）');
    await context.close();
  }

  // 9. 条件・文脈の変更
  {
    const { page, context } = await open();
    await toConfirm(page); await bothConfirms(page);
    const optionalD = { name: '任意D', form_number: null, is_required: false, notes: null, item_type: 'document', sort_order: 9 };
    await update(page, (c, a) => ({ ...c, docs: [...a.docs, a.extra] }), { docs: DOCS, extra: optionalD });
    ok(await flow(page).getByRole('heading', { name: '提出後の確認' }).isVisible() && (await checkedStates(page)).every(Boolean), '任意書類の追加は確認を変えない（描画反映後に確認）');
    await update(page, (c, a) => ({ ...c, docs: a.docs.map((d) => (d.name === '明細書B' ? { ...d, notes: '補足あり' } : d)) }), { docs: DOCS });
    eq(await settled(page, [false, false]), [false, false], '書類の補足だけの変更でも確認をリセット');
    await flow(page).getByRole('heading', { name: '書類を用意' }).waitFor();
    await checkAllDocs(page);
    await update(page, (c, a) => ({ ...c, docs: a.docs.filter((d) => d.name !== '明細書B') }), { docs: DOCS });
    eq(await settled(page, [false]), [false], '必須書類の変更で古いチェックを流用しない');
    await update(page, (c) => ({ ...c, docs: undefined }));
    await flow(page).getByTestId('completion-flow-blocked').waitFor();
    ok(true, '取得元が欠けたら準備済みにせず保留');
    await update(page, (c, a) => ({ ...c, docs: a.docs }), { docs: DOCS });
    eq(await settled(page, [false, false]), [false, false], '復帰しても以前のチェックは戻らない');
    await checkAllDocs(page);
    await page.evaluate(() => { window.__pathname = '/admin/workspaces/1/other'; });
    await update(page, (c) => c);
    eq(await settled(page, [false, false]), [false, false], '画面（pathname）が変わったらリセット');
    await checkAllDocs(page);
    await update(page, (c) => ({ ...c, companyId: 2 }));
    eq(await settled(page, [false, false]), [false, false], '会社が変わったらリセット');
    await checkAllDocs(page);
    await update(page, (c) => ({ ...c, dueDate: '2028-01-31' }));
    await page.locator('#roadmap-procedure-101-2028-01-31').waitFor();
    eq(await settled(page, [false, false]), [false, false], '期限（年度）が変わったらリセット');
    await checkAllDocs(page);
    await page.reload();
    await page.locator('#' + TARGET).waitFor();
    eq(await settled(page, [false, false]), [false, false], '再読込で画面内の確認は消える（保存されない）');
    eq((await db(page)).writes.length, 0, '上記の変更・再読込で保存なし');
    await context.close();
  }
  {
    const { page, context } = await open();
    await toConfirm(page); await bothConfirms(page);
    await update(page, (c, a) => ({ ...c, statusMap: { [a.k]: 'in_progress' } }), { k: KEY });
    eq(await settled(page, [false, false]), [false, false], '外部更新で別の未完了状態になったら古い確認を流用しない');
    await flow(page).getByRole('heading', { name: '書類を用意' }).waitFor();
    eq(await select(page).inputValue(), 'in_progress', '現在の保存状態を優先');
    await toConfirm(page); await bothConfirms(page);
    await update(page, (c, a) => ({ ...c, statusMap: { [a.k]: 'done' } }), { k: KEY });
    await flow(page).waitFor({ state: 'detached' });
    eq(await flow(page).count(), 0, '外部で完了済みになったら保留中の確認を破棄');
    eq(await select(page).inputValue(), 'done', '保存済み完了を表示');
    eq((await db(page)).writes.length, 0, '外部更新で保存しない');
    await update(page, (c, a) => ({ ...c, statusMap: { [a.k]: 'not_started' } }), { k: KEY });
    eq(await settled(page, [false, false]), [false, false], '再び未完了でも古い確認は復活しない');
    await context.close();
  }

  // 10. 既存の完了
  {
    const { page, context } = await open({ statusMap: { [KEY]: 'done' }, rows: [{ company_id: 1, procedure_id: 101, occurrence_key: '2027-01-31', status: 'done' }] });
    eq(await flow(page).count(), 0, '既存完了は新しい確認なしで完了表示');
    eq(await select(page).inputValue(), 'done', '完了のまま（未完了へ戻さない）');
    eq(await card(page).getByTestId('procedure-completion-guide').count(), 1, '既存完了は従来の静的案内');
    eq((await db(page)).writes.length, 0, '表示だけで保存・降格なし');
    await select(page).selectOption('in_progress');
    await page.waitForFunction(() => window.__refreshes > 0);
    const w = (await db(page)).writes;
    eq(w.map((x) => x.status), ['in_progress'], '明示的な状態変更（既存契約）は従来どおり');
    await context.close();
  }

  // 11. 他カードの入力保持
  {
    const { page, context } = await open();
    const amount = page.locator('#roadmap-procedure-102-2027-02-28').getByRole('textbox', { name: '合成法人税申告の支払う予定額（円）' });
    await amount.fill('12345');
    await toConfirm(page); await bothConfirms(page);
    await flow(page).getByRole('button', { name: '戻る' }).click();
    await flow(page).getByRole('checkbox', { name: /申告書A/ }).uncheck();
    eq(await amount.inputValue(), '12,345', '他カードの入力途中の値を保持');
    await context.close();
  }

  // 12. キーボード・44px・はみ出し・画像
  for (const [label, viewport] of [['desktop', { width: 1000, height: 900 }], ['375', { width: 375, height: 800 }]]) {
    const { page, context } = await open({ viewport });
    await flow(page).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/document-completion-flow-${label}-1-docs.png`, fullPage: true });
    const cb = flow(page).getByRole('checkbox', { name: /申告書A/ });
    await cb.focus(); await page.keyboard.press('Space');
    ok(await cb.isChecked(), `${label}: キーボード(Space)でチェック`);
    await page.keyboard.press('Space');
    ok(!(await cb.isChecked()), `${label}: キーボード(Space)で解除`);
    await page.keyboard.press('Space');
    await flow(page).getByRole('checkbox', { name: /明細書B/ }).focus(); await page.keyboard.press('Space');
    await page.keyboard.press('Tab');
    ok(await page.evaluate(() => document.activeElement?.textContent === '提出後の確認へ'), `${label}: Tabで次へボタン`);
    await page.keyboard.press('Enter');
    await flow(page).getByRole('heading', { name: '提出後の確認' }).waitFor();
    for (const el of await flow(page).locator('label, button').all()) {
      const b = await el.boundingBox();
      ok(b.height >= 43.5, `${label}: 操作要素の高さ44px以上(${Math.round(b.height)})`);
    }
    await boxes(page).nth(0).focus(); await page.keyboard.press('Space');
    await boxes(page).nth(1).focus(); await page.keyboard.press('Space');
    await page.screenshot({ path: `test-results/document-completion-flow-${label}-2-confirm.png`, fullPage: true });
    ok(await flow(page).getByRole('button', { name: '完了にする' }).isEnabled(), `${label}: キーボードで確認完了後に有効`);
    eq(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${label}: 横はみ出しなし`);
    eq((await db(page)).writes.length, 0, `${label}: キーボード操作でも保存しない`);
    await context.close();
  }
  {
    const { page, context } = await open({ viewport: { width: 375, height: 800 }, docs: [] });
    await page.screenshot({ path: 'test-results/document-completion-flow-375-3-blocked.png', fullPage: true });
    eq(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, '375 保留表示: 横はみ出しなし');
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
  await writeFile('test-results/document-completion-flow-log.txt', logLines.join('\n') + '\n');
}
