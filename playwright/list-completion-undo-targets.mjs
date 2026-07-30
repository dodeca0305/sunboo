import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import path from 'node:path';

const APP_URL =
  process.env.PREVIEW_APP_URL ?? 'http://localhost:3000';

const STORAGE_STATE_PATH = path.join(
  process.cwd(),
  'playwright',
  '.auth',
  'admin.json',
);

async function main() {
  if (!existsSync(STORAGE_STATE_PATH)) {
    console.error(
      `storageStateが見つかりません: ${STORAGE_STATE_PATH}`,
    );
    process.exit(1);
  }

  const browser = await chromium.launch({
    headless: process.env.HEADED !== '1',
  });

  const context = await browser.newContext({
    storageState: STORAGE_STATE_PATH,
  });

  const page = await context.newPage();

  await page.goto(`${APP_URL}/admin/workspaces`, {
    waitUntil: 'networkidle',
  });

  if (page.url().includes('/admin/login')) {
    console.error(
      '認証状態が期限切れです。storageStateを作り直してください。',
    );
    await browser.close();
    process.exit(1);
  }

  const workspacePaths = await page
    .locator('a[href^="/admin/workspaces/"]')
    .evaluateAll((anchors) => {
      const paths = anchors
        .map((anchor) => anchor.getAttribute('href'))
        .filter(
          (href) =>
            typeof href === 'string' &&
            /^\/admin\/workspaces\/\d+$/.test(href),
        );

      return [...new Set(paths)];
    });

  if (workspacePaths.length === 0) {
    console.error('操作できるワークスペースが見つかりません。');
    await browser.close();
    process.exit(1);
  }

  console.log(`ワークスペース数: ${workspacePaths.length}`);

  for (const workspacePath of workspacePaths) {
    const workspaceId =
      workspacePath.match(/\/(\d+)$/)?.[1] ?? 'unknown';

    await page.goto(`${APP_URL}${workspacePath}/roadmap`, {
      waitUntil: 'networkidle',
    });

    if (page.url().includes('/admin/login')) {
      console.error(
        `workspace ${workspaceId}: ログイン画面へ戻されました。`,
      );
      continue;
    }

    const heading =
      (await page.locator('h1').first().textContent().catch(() => null)) ??
      '年間ロードマップ';

    const selects = page.locator(
      'select[aria-label$="のステータス"]',
    );

    const count = await selects.count();

    console.log('');
    console.log(`=== workspace ${workspaceId}: ${heading.trim()} ===`);

    if (count === 0) {
      console.log('操作可能な手続きなし');
      continue;
    }

    for (let index = 0; index < count; index += 1) {
      const select = selects.nth(index);

      const label = await select.getAttribute('aria-label');
      const status = await select.inputValue();

      console.log(
        JSON.stringify({
          workspaceId: Number(workspaceId),
          procedureName:
            label?.replace(/のステータス$/, '') ?? null,
          status,
        }),
      );
    }
  }

  await browser.close();
}

main().catch((error) => {
  console.error('list-completion-undo-targets failed:', error);
  process.exit(1);
});
