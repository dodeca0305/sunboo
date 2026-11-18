// /start の地域選択を、ローカル合成fixtureだけで実ブラウザ確認する。
// 偽装するのは公開の都道府県/市区町村SELECT応答のみ。実ネットワーク/実セッションは使わない。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdir, rm, symlink, writeFile, mkdtemp } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { chromium } from 'playwright-core';

const syntheticApi = 'https://synthetic-start.supabase.co';
// 元リポジトリでは next dev/build を起動しない。/private/tmp の隔離コピー(git archive HEAD + 対象差分)で実行する。
const repo = process.cwd();
const out = path.join(repo, 'test-results'); // 結果ログ/スクリーンショットだけ元リポジトリへ出力
const scopedFiles = [
  'src/app/(site)/start/page.tsx',
  'src/lib/startGeography.ts',
  'src/app/(site)/help/page.tsx',
  'src/app/(site)/page.tsx',
  'src/app/(site)/layout.tsx',
];
let fixture;
let port;
let origin;
async function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port: p } = s.address();
      s.close(() => resolve(p));
    });
  });
}
async function prepareFixture() {
  fixture = await mkdtemp('/private/tmp/start-geography-fixture-');
  await new Promise((resolve, reject) => {
    const archive = spawn('git', ['archive', 'HEAD'], { cwd: repo, stdio: ['ignore', 'pipe', 'inherit'] });
    const tar = spawn('tar', ['-x', '-C', fixture], { stdio: ['pipe', 'inherit', 'inherit'] });
    archive.stdout.pipe(tar.stdin);
    tar.on('close', (c) => (c === 0 ? resolve() : reject(new Error('tar failed'))));
    archive.on('error', reject);
  });
  for (const f of scopedFiles) await cp(path.join(repo, f), path.join(fixture, f));
  await symlink(path.join(repo, 'node_modules'), path.join(fixture, 'node_modules')); // 既存node_modulesへの絶対パスsymlink
  port = await freePort();
  origin = `http://127.0.0.1:${port}`;
}
const results = [];
let logs = '';

const prefs = [
  { code: '01', name: '合成道' },
  { code: '13', name: '合成都' },
  { code: '27', name: '合成府' },
  { code: '40', name: '合成県' },
];
const idOf = (code) => Number(code) + 100;
const munis = {
  13: [{ code: '13001', name: '合成区A' }, { code: '13002', name: '合成区B' }],
  27: [{ code: '27001', name: '合成市C' }],
  40: [{ code: '40001', name: '復旧後の市D' }],
};
// 都道府県コードごとの挙動: ok | empty | unregistered | fail | null | delay
const mode = {};
let delayReleases = {};
let prefListFail = false;

function cleanEnv() {
  // 既存の環境値(SUPABASE等)を引き継がず、合成値だけを明示する
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('NEXT_PUBLIC_') || k.startsWith('SUPABASE')) delete env[k];
  return env;
}
async function startServer(env) {
  const server = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(port)],
    { cwd: fixture, env: { ...cleanEnv(), ...env, NEXT_PUBLIC_GA_MEASUREMENT_ID: '' }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  server.stdout.on('data', (c) => (logs += c));
  server.stderr.on('data', (c) => (logs += c));
  try {
    for (let i = 0; i < 120; i++) {
      assert.equal(server.exitCode, null, 'dev server exited');
      try {
        if ((await fetch(origin + '/start', { signal: AbortSignal.timeout(30000) })).ok) return server;
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error('server not ready');
  } catch (error) {
    stopServer(server); // 準備待ちに失敗しても自分の子サーバーを確実に終了する
    throw error;
  }
}
function stopServer(server) {
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {}
}

async function newPage(browser, { synthetic }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await context.addInitScript(() => localStorage.setItem('sunboo:analytics-consent', 'denied'));
  await context.route('**/*', (route) => {
    const o = new URL(route.request().url()).origin;
    return o === origin || (synthetic && o === syntheticApi) ? route.fallback() : route.abort();
  });
  if (synthetic) {
    const cors = { 'access-control-allow-origin': origin };
    await context.route(syntheticApi + '/rest/v1/**', async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') {
        return route.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-methods': 'GET,OPTIONS', 'access-control-allow-headers': req.headers()['access-control-request-headers'] ?? '*' } });
      }
      assert.equal(req.method(), 'GET', '書き込み系通信は発生しない');
      const url = new URL(req.url());
      const table = url.pathname.split('/').at(-1);
      const json = (body, status = 200) => route.fulfill({ status, json: body, headers: cors });
      if (table === 'prefectures' && !url.searchParams.get('code')) return prefListFail ? json({ message: 'Synthetic failure' }, 500) : json(prefs);
      if (table === 'prefectures') {
        const code = url.searchParams.get('code').replace('eq.', '');
        // supabase-js の maybeSingle(GET)は配列応答を受け、0件ならdata null/error nullにする
        if (mode[code] === 'unregistered') return json([]);
        if (mode[code] === 'prefFail') return json({ message: 'Synthetic failure' }, 500);
        return json([{ id: idOf(code) }]);
      }
      if (table === 'municipalities') {
        const id = Number(url.searchParams.get('prefecture_id').replace('eq.', ''));
        const code = String(id - 100).padStart(2, '0');
        results.push(`muni-request:${code}`);
        if (mode[code] === 'delay') {
          await new Promise((r) => (delayReleases[code] = r));
          return json(munis[code] ?? []);
        }
        if (mode[code] === 'fail') return json({ message: 'Synthetic failure' }, 500);
        if (mode[code] === 'null') return route.fulfill({ status: 200, body: 'null', contentType: 'application/json', headers: cors });
        if (mode[code] === 'empty') return json([]);
        return json(munis[code] ?? []);
      }
      return json({ message: 'unexpected table ' + table }, 400);
    });
  }
  return context.newPage();
}

const shot = (page, name) => page.screenshot({ path: path.join(out, `start-geography-${name}.png`), fullPage: false });

async function syntheticScenarios(browser) {
  const page = await newPage(browser, { synthetic: true });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  // 0. 都道府県一覧の取得失敗 → 送信阻止 → 再試行で回復 → 旧prefエラーが消える
  prefListFail = true;
  await page.goto(origin + '/start');
  await page.getByRole('alert').filter({ hasText: '都道府県の一覧を取得できませんでした' }).waitFor();
  assert.equal(await page.getByText('未対応です').count(), 0);
  await page.getByRole('button', { name: '診断結果を見る' }).click();
  await page.getByText('都道府県の一覧を読み込めていません').waitFor();
  assert.ok(page.url().endsWith('/start'), '一覧取得失敗中は送信できない');
  await page.getByRole('alert').filter({ hasText: '都道府県の一覧を取得できませんでした' }).scrollIntoViewIfNeeded();
  await shot(page, 'pref-list-failure');
  prefListFail = false;
  await page.getByRole('button', { name: '再試行' }).click();
  await page.locator('#start-pref option[value="13"]').waitFor({ state: 'attached' });
  assert.equal(await page.getByText('都道府県の一覧を読み込めていません').count(), 0, '再試行直後に旧prefエラーが残らない');
  await page.getByRole('button', { name: '診断結果を見る' }).click();
  await page.getByText('都道府県を選択してください').waitFor();
  mode['13'] = 'ok';
  await page.selectOption('#start-pref', '13');
  await page.locator('#start-muni').waitFor();
  assert.equal(await page.getByText('都道府県を選択してください').count(), 0, '地域選択後に旧prefエラーが消える');
  await page.selectOption('#start-pref', '');
  results.push('pref list failure/retry/old error cleared: ok');
  assert.equal(await page.getByText('サンプル地域データ').count(), 0, '実接続ではサンプル表記を出さない');

  // 1. 登録あり
  mode['13'] = 'ok';
  await page.selectOption('#start-pref', '13');
  await page.locator('#start-muni').waitFor();
  assert.deepEqual(await page.locator('#start-muni option').allTextContents(), ['選択してください', '合成区A', '合成区B']);
  await page.selectOption('#start-muni', '13002');
  await shot(page, 'success');
  results.push('success: ok');

  // 2. 正常な0件 / 都道府県未登録(maybeSingle成功null)
  mode['01'] = 'empty';
  await page.selectOption('#start-pref', '01');
  await page.getByText('選択した地域の市区町村一覧は、現在登録されていないか利用できません').waitFor();
  assert.equal(await page.locator('#start-muni').count(), 0);
  assert.equal(await page.getByText('東京都渋谷区のみ').count(), 0, '古い渋谷のみ案内は出ない');
  assert.equal(await page.getByRole('button', { name: '再試行' }).count(), 0);
  await page.getByText('すべての窓口・様式に対応しているとは限りません').waitFor();
  await shot(page, 'empty');
  await page.getByRole('button', { name: '診断結果を見る' }).click();
  await page.getByText('市区町村一覧が登録されていないため、先へ進めません').waitFor();
  assert.ok(page.url().endsWith('/start'), '空の地域では送信できない');
  results.push('empty: ok (blocked)');

  mode['27'] = 'unregistered';
  await page.selectOption('#start-pref', '27');
  await page.getByText('現在登録されていないか利用できません').waitFor();
  results.push('unregistered(maybeSingle null): ok');

  // 3. 取得失敗は未対応/空と区別。失敗応答・null応答・都道府県照会失敗
  for (const m of ['fail', 'null', 'prefFail']) {
    mode['40'] = m;
    await page.selectOption('#start-pref', '');
    await page.selectOption('#start-pref', '40');
    const alert = page.getByRole('alert').filter({ hasText: '市区町村の一覧を取得できませんでした' });
    await alert.waitFor();
    assert.equal(await page.getByText('現在登録されていないか利用できません').count(), 0, `${m}: 未登録と表示しない`);
    assert.equal(await page.getByText('未対応です').count(), 0);
    assert.equal(await page.getByText('読み込み中...').count(), 0, `${m}: 読み込み状態が解除される`);
    await page.getByRole('button', { name: '診断結果を見る' }).click();
    await page.getByText('市区町村を取得できませんでした。再試行してください').waitFor();
    if (m === 'fail') {
      // 対象の地域カード(alertと赤い送信エラー)が写るよう、スクロールしてから撮影する
      await alert.scrollIntoViewIfNeeded();
      await page.locator('#start-pref').scrollIntoViewIfNeeded();
      await alert.scrollIntoViewIfNeeded();
      await shot(page, 'failure');
    }
    results.push(`failure(${m}): ok`);
  }

  // 4. 再試行で回復（キーボードで操作）
  mode['40'] = 'ok';
  await page.getByRole('button', { name: '再試行' }).focus();
  await page.keyboard.press('Enter');
  await page.locator('#start-muni').waitFor();
  assert.deepEqual(await page.locator('#start-muni option').allTextContents(), ['選択してください', '復旧後の市D']);
  assert.equal(await page.getByText('市区町村を取得できませんでした。再試行してください').count(), 0, '回復後に旧失敗エラーが残らない');
  assert.equal(await page.getByRole('alert').filter({ hasText: '取得できませんでした' }).count(), 0, '回復後に取得失敗alertが残らない');
  await page.locator('#start-muni').scrollIntoViewIfNeeded();
  await shot(page, 'retry-recovered');
  results.push('retry recovery: ok');

  // 5. 古い応答の上書き防止: 13(遅延)→27 に素早く切替え、13 の応答を後で解放
  mode['13'] = 'delay';
  mode['27'] = 'ok';
  delayReleases = {};
  await page.selectOption('#start-pref', '13');
  await page.waitForFunction(() => true);
  await page.getByText('読み込み中...').waitFor();
  await page.selectOption('#start-pref', '27');
  await page.locator('#start-muni').waitFor();
  assert.deepEqual(await page.locator('#start-muni option').allTextContents(), ['選択してください', '合成市C']);
  for (let i = 0; i < 50 && !delayReleases['13']; i++) await new Promise((r) => setTimeout(r, 100));
  assert.ok(delayReleases['13'], '13 の遅延要求が発行された');
  delayReleases['13']();
  await new Promise((r) => setTimeout(r, 800));
  assert.deepEqual(await page.locator('#start-muni option').allTextContents(), ['選択してください', '合成市C'], '古い応答で上書きされない');
  assert.equal(await page.locator('#start-pref').inputValue(), '27');
  await shot(page, 'stale-ignored');
  results.push('stale response ignored: ok');

  // 6. 都道府県変更で旧市区町村選択をクリアし、新一覧に無い選択では送信不可
  mode['13'] = 'ok';
  await page.selectOption('#start-pref', '13');
  await page.locator('#start-muni option[value="13001"]').waitFor({ state: 'attached' });
  await page.selectOption('#start-muni', '13001');
  await page.selectOption('#start-pref', '27');
  await page.locator('#start-muni option[value="27001"]').waitFor({ state: 'attached' });
  assert.equal(await page.locator('#start-muni').inputValue(), '', '旧市区町村選択はクリアされる');
  await page.getByRole('button', { name: '診断結果を見る' }).click();
  await page.getByText('市区町村を選択してください').first().waitFor();
  assert.ok(page.url().endsWith('/start'));
  await shot(page, 'blocked-invalid-selection');
  results.push('selection cleared / submit blocked: ok');

  assert.deepEqual(pageErrors, []);
  await page.context().close();
}

async function noSupabaseScenario(browser) {
  const page = await newPage(browser, { synthetic: false });
  await page.goto(origin + '/start');
  await page.locator('#start-pref option[value="13"]').waitFor({ state: 'attached' });
  await page.getByText('ローカル確認用のサンプル地域データです').first().waitFor();
  await page.selectOption('#start-pref', '13');
  await page.locator('#start-muni').waitFor();
  await page.getByText('ローカル確認用のサンプル地域データです').nth(1).waitFor();
  assert.deepEqual(await page.locator('#start-muni option').allTextContents(), ['選択してください', '渋谷区']);
  await shot(page, 'no-supabase-sample');
  await page.selectOption('#start-pref', '01');
  await page.getByText('サンプル地域データに、この地域の市区町村一覧はありません').waitFor();
  results.push('no-supabase sample branch labelled: ok');
  await page.context().close();
}

let server;
let browser;
try {
  await mkdir(out, { recursive: true });
  await prepareFixture();
  results.push('fixture: ' + fixture + ' port: ' + port);
  browser = await chromium.launch({ headless: true });
  server = await startServer({ NEXT_PUBLIC_SUPABASE_URL: syntheticApi, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-only' });
  await syntheticScenarios(browser);
  stopServer(server);
  await new Promise((r) => setTimeout(r, 1500));
  server = await startServer({ NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_ANON_KEY: '' });
  await noSupabaseScenario(browser);
  results.push('ALL PASS');
} catch (error) {
  results.push('FAILED: ' + (error?.stack ?? error));
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (server) stopServer(server);
  await writeFile(path.join(out, 'start-geography-qa.log'), results.join('\n') + '\n\n--- server log ---\n' + logs.slice(-4000));
  await new Promise((r) => setTimeout(r, 1500));
  if (fixture) await rm(fixture, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }).catch((e) => results.push('fixture cleanup incomplete: ' + e.code));
  await writeFile(path.join(out, 'start-geography-qa.log'), results.join('\n') + '\n\n--- server log ---\n' + logs.slice(-4000));
  console.log(results.join('\n'));
}
