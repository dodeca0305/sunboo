// ── 管理者ログイン済みセッションの保存（手動実行専用スクリプト）─────────────
//
// 目的: submission-directory-preview 等の admin/(protected) 配下ルートをPlaywrightで
// 検証するために必要な認証済み storageState（playwright/.auth/admin.json）を作成する。
//
// 【重要】このスクリプトは認証情報を一切保持しない。ブラウザを開いた状態で待機するだけで、
// ログイン操作（メールアドレス・パスワードの入力）は実行者が手動でブラウザ上に行う。
// Cookie・トークン自体は playwright/.auth/admin.json に保存されるが、このファイルは
// .gitignore 対象であり、コミットしない・ログにも出力しない。
//
// 実行方法（開発者本人のローカル環境で、npm run dev を別ターミナルで起動した状態で実行）:
//   node playwright/save-admin-storage-state.mjs
//
// 前提: playwright-core が実行環境にインストールされていること
// （本プロジェクトの node_modules には現状インストールされていない。要install、詳細は
// このスクリプトを追加した際の報告を参照）。

import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const APP_URL = process.env.PREVIEW_APP_URL ?? 'http://localhost:3000';
const OUTPUT_PATH = path.join(process.cwd(), 'playwright', '.auth', 'admin.json');

async function main() {
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${APP_URL}/admin/login`);

  console.log('');
  console.log('ブラウザが開きました。画面上で管理者アカウントのメールアドレス・パスワードを');
  console.log('手動で入力し、ログインしてください。');
  console.log('ログイン成功後（/admin 配下のいずれかのページへ遷移した後）、');
  console.log('このターミナルで Enter キーを押すと storageState を保存します。');
  console.log('');

  await new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.once('data', resolve);
  });

  await context.storageState({ path: OUTPUT_PATH });
  console.log(`storageState を保存しました: ${OUTPUT_PATH}`);
  console.log('（このファイルは .gitignore 対象です。コミットされないことを確認してください）');

  await browser.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('save-admin-storage-state failed:', err);
  process.exit(1);
});
