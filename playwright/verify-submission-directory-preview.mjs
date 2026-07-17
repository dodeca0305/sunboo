// ── Preview Route 認証済みブラウザ検証（補強作業3）───────────────────────
//
// 対象: /admin/submission-directory-preview
// 前提: playwright/.auth/admin.json（storageState）が存在すること
//       （playwright/save-admin-storage-state.mjs を先に実行して作成する）。
//       npm run dev が起動していること。
//
// 実行方法:
//   node playwright/verify-submission-directory-preview.mjs
//
// 【重要】このスクリプトは Cookie・トークン・認証ヘッダーの値そのものをログへ出力しない。
// storageState はファイルパスの読み込み元として使うのみで、内容を console.log しない。
//
// 前提: playwright-core が実行環境にインストールされていること
// （本プロジェクトの node_modules には現状インストールされていない。要install）。

import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import path from 'node:path';

const APP_URL = process.env.PREVIEW_APP_URL ?? 'http://localhost:3000';
const PREVIEW_PATH = '/admin/submission-directory-preview';
const STORAGE_STATE_PATH = path.join(process.cwd(), 'playwright', '.auth', 'admin.json');
const SCREENSHOT_PATH = path.join(process.cwd(), 'test-results', 'submission-directory-preview.png');

const EXPECTED_CASES = [
  { label: '札幌市中央区 × 法人市民税申告', status: 'resolved', office: '中央市税事務所諸税課法人市民税係' },
  { label: '札幌市清田区 × 償却資産申告', status: 'resolved', office: '中央市税事務所固定資産税課償却資産担当', matchedRuleId: '3' },
  { label: '福岡市中央区 × 法人市民税申告', status: 'resolved', office: '財政局法人税務課法人市民税係' },
  { label: '北九州市門司区 × 償却資産申告', status: 'not_supported', office: '（該当窓口なし）' },
];

async function main() {
  if (!existsSync(STORAGE_STATE_PATH)) {
    console.error(`storageStateが見つかりません: ${STORAGE_STATE_PATH}`);
    console.error('先に node playwright/save-admin-storage-state.mjs を実行してください。');
    process.exit(1);
  }

  const consoleErrors = [];
  const pageErrors = [];
  const httpErrorResponses = [];
  const supabaseIssues = [];

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: STORAGE_STATE_PATH });
  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });
  page.on('response', (res) => {
    const status = res.status();
    if (status >= 500 && status <= 599) {
      httpErrorResponses.push(`${status} ${res.url()}`);
    }
    if (res.url().includes('supabase.co')) {
      if (status === 401 || status === 403 || status >= 500) {
        supabaseIssues.push(`${status} ${res.url()}`);
      }
    }
  });
  page.on('requestfailed', (req) => {
    if (req.url().includes('supabase.co')) {
      supabaseIssues.push(`requestfailed(${req.failure()?.errorText ?? 'unknown'}) ${req.url()}`);
    }
  });

  const response = await page.goto(`${APP_URL}${PREVIEW_PATH}`, { waitUntil: 'networkidle' });
  const httpStatus = response ? response.status() : null;

  const title = await page.textContent('h1').catch(() => null);
  const bodyText = await page.textContent('body').catch(() => '');

  const caseResults = EXPECTED_CASES.map((c) => {
    const hasLabel = bodyText.includes(c.label);
    const hasStatus = bodyText.includes(c.status);
    const hasOffice = bodyText.includes(c.office);
    const hasRuleId = c.matchedRuleId ? bodyText.includes(c.matchedRuleId) : true;
    return {
      label: c.label,
      pass: hasLabel && hasStatus && hasOffice && hasRuleId,
      hasLabel,
      hasStatus,
      hasOffice,
      hasRuleId,
    };
  });

  await mkdirForScreenshot(SCREENSHOT_PATH);
  await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });

  await browser.close();

  console.log('=== HTTP status ===', httpStatus);
  console.log('=== title ===', title);
  console.log('=== case results ===');
  for (const r of caseResults) console.log(JSON.stringify(r));
  console.log('=== console.error count ===', consoleErrors.length);
  for (const e of consoleErrors) console.log('  console.error:', e);
  console.log('=== pageerror count ===', pageErrors.length);
  for (const e of pageErrors) console.log('  pageerror:', e);
  console.log('=== HTTP 5xx count ===', httpErrorResponses.length);
  for (const e of httpErrorResponses) console.log('  5xx:', e);
  console.log('=== supabase issue count ===', supabaseIssues.length);
  for (const e of supabaseIssues) console.log('  supabase issue:', e);
  console.log('=== screenshot ===', SCREENSHOT_PATH);

  const allPass =
    httpStatus === 200 &&
    title === '提出先ディレクトリ Preview（内部確認用）' &&
    caseResults.every((r) => r.pass) &&
    consoleErrors.length === 0 &&
    pageErrors.length === 0 &&
    httpErrorResponses.length === 0 &&
    supabaseIssues.length === 0;

  console.log('=== overall ===', allPass ? 'PASS' : 'FAIL');
  process.exit(allPass ? 0 : 1);
}

async function mkdirForScreenshot(filePath) {
  const { mkdir } = await import('node:fs/promises');
  await mkdir(path.dirname(filePath), { recursive: true });
}

main().catch((err) => {
  console.error('verify-submission-directory-preview failed:', err);
  process.exit(1);
});
