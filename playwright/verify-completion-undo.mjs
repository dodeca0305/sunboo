import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const APP_URL =
  process.env.PREVIEW_APP_URL ?? 'http://localhost:3000';

const WORKSPACE_ID = Number(
  process.env.WORKSPACE_ID ?? '17',
);

const PROCEDURE_NAME =
  process.env.PROCEDURE_NAME ?? '役員変更登記';

const STORAGE_STATE_PATH = path.join(
  process.cwd(),
  'playwright',
  '.auth',
  'admin.json',
);

const SCREENSHOT_PATH = path.join(
  process.cwd(),
  'test-results',
  'completion-undo.png',
);

const ROADMAP_PATH =
  `/admin/workspaces/${WORKSPACE_ID}/roadmap`;

const DASHBOARD_PATH =
  `/admin/workspaces/${WORKSPACE_ID}`;

function waitForStatusWrite(page) {
  return page.waitForResponse((response) => {
    const request = response.request();

    return (
      response.url().includes(
        '/rest/v1/workspace_procedure_statuses',
      ) &&
      ['POST', 'PATCH'].includes(request.method())
    );
  });
}

async function assertSuccessfulWrite(response, action) {
  if (!response.ok()) {
    throw new Error(
      `${action}に失敗しました: HTTP ${response.status()}`,
    );
  }
}

async function getUniqueStatusSelect(page) {
  const label = `${PROCEDURE_NAME}のステータス`;
  const select = page.getByLabel(label, { exact: true });
  const count = await select.count();

  if (count !== 1) {
    throw new Error(
      `${label}が${count}件見つかりました。1件である必要があります。`,
    );
  }

  return select;
}

async function changeStatus(
  page,
  select,
  status,
  { navigation = false } = {},
) {
  if (navigation) {
    const [response] = await Promise.all([
      waitForStatusWrite(page),
      page.waitForNavigation({
        waitUntil: 'networkidle',
      }),
      select.selectOption(status),
    ]);

    await assertSuccessfulWrite(
      response,
      `ステータスを${status}へ変更`,
    );

    return;
  }

  const [response] = await Promise.all([
    waitForStatusWrite(page),
    select.selectOption(status),
  ]);

  await assertSuccessfulWrite(
    response,
    `ステータスを${status}へ変更`,
  );
}

async function assertAuthenticated(page) {
  if (page.url().includes('/admin/login')) {
    throw new Error(
      '認証状態が期限切れです。storageStateを作り直してください。',
    );
  }
}

async function main() {
  if (!existsSync(STORAGE_STATE_PATH)) {
    throw new Error(
      `storageStateが見つかりません: ${STORAGE_STATE_PATH}`,
    );
  }

  if (!Number.isInteger(WORKSPACE_ID)) {
    throw new Error('WORKSPACE_IDが整数ではありません。');
  }

  await mkdir(path.dirname(SCREENSHOT_PATH), {
    recursive: true,
  });

  const browser = await chromium.launch({
    headless: process.env.HEADED !== '1',
  });

  const context = await browser.newContext({
    storageState: STORAGE_STATE_PATH,
  });

  const page = await context.newPage();

  let originalStatus = null;

  try {
    await page.goto(`${APP_URL}${ROADMAP_PATH}`, {
      waitUntil: 'networkidle',
    });

    await assertAuthenticated(page);

    let select = await getUniqueStatusSelect(page);
    originalStatus = await select.inputValue();

    console.log('=== target ===');
    console.log({
      workspaceId: WORKSPACE_ID,
      procedureName: PROCEDURE_NAME,
      originalStatus,
    });

    if (originalStatus === 'done') {
      throw new Error(
        '対象はすでに完了済みです。別の対象を指定してください。',
      );
    }

    const previousStatus =
      originalStatus === 'in_progress'
        ? 'on_hold'
        : 'in_progress';

    console.log(
      `1. ${originalStatus} → ${previousStatus}`,
    );

    await changeStatus(
      page,
      select,
      previousStatus,
    );

    await page.reload({
      waitUntil: 'networkidle',
    });

    select = await getUniqueStatusSelect(page);

    if ((await select.inputValue()) !== previousStatus) {
      throw new Error(
        `${previousStatus}がDBへ保存されていません。`,
      );
    }

    console.log(`2. ${previousStatus} → done`);

    await changeStatus(
      page,
      select,
      'done',
      { navigation: true },
    );

    if (
      new URL(page.url()).pathname !== DASHBOARD_PATH
    ) {
      throw new Error(
        `完了後の遷移先が不正です: ${page.url()}`,
      );
    }

    const feedback = page.getByRole('status');

    await feedback.waitFor({
      state: 'visible',
    });

    const feedbackText =
      await feedback.textContent();

    if (
      !feedbackText?.includes('完了しました') ||
      !feedbackText.includes(PROCEDURE_NAME)
    ) {
      throw new Error(
        '完了通知に期待する内容が表示されていません。',
      );
    }

    console.log('3. 完了通知を確認');

    const undoButton = page.getByRole(
      'button',
      {
        name: '元に戻す',
        exact: true,
      },
    );

    await undoButton.waitFor({
      state: 'visible',
    });

    console.log('4. 元に戻す');

    const [undoResponse] = await Promise.all([
      waitForStatusWrite(page),
      page.waitForNavigation({
        waitUntil: 'networkidle',
      }),
      undoButton.click(),
    ]);

    await assertSuccessfulWrite(
      undoResponse,
      '元に戻す処理',
    );

    await page.goto(`${APP_URL}${ROADMAP_PATH}`, {
      waitUntil: 'networkidle',
    });

    select = await getUniqueStatusSelect(page);

    const restoredStatus =
      await select.inputValue();

    if (restoredStatus !== previousStatus) {
      throw new Error(
        `Undo後の状態が不正です。期待=${previousStatus}、実際=${restoredStatus}`,
      );
    }

    await page.screenshot({
      path: SCREENSHOT_PATH,
      fullPage: true,
    });

    console.log('=== verification === PASS');
    console.log(
      `Undo後ステータス: ${restoredStatus}`,
    );
    console.log(
      `スクリーンショット: ${SCREENSHOT_PATH}`,
    );
  } catch (error) {
    await page
      .screenshot({
        path: SCREENSHOT_PATH,
        fullPage: true,
      })
      .catch(() => {});

    throw error;
  } finally {
    if (
      originalStatus !== null &&
      originalStatus !== 'done'
    ) {
      try {
        await page.goto(`${APP_URL}${ROADMAP_PATH}`, {
          waitUntil: 'networkidle',
        });

        await assertAuthenticated(page);

        const select =
          await getUniqueStatusSelect(page);

        const currentStatus =
          await select.inputValue();

        if (currentStatus !== originalStatus) {
          console.log(
            `cleanup: ${currentStatus} → ${originalStatus}`,
          );

          await changeStatus(
            page,
            select,
            originalStatus,
          );

          await page.reload({
            waitUntil: 'networkidle',
          });

          const restoredSelect =
            await getUniqueStatusSelect(page);

          if (
            (await restoredSelect.inputValue()) !==
            originalStatus
          ) {
            throw new Error(
              '元のステータスへの後片付けに失敗しました。',
            );
          }
        }

        console.log(
          `cleanup完了: ${originalStatus}`,
        );
      } catch (cleanupError) {
        console.error(
          'cleanup failed:',
          cleanupError,
        );

        process.exitCode = 1;
      }
    }

    await browser.close();
  }
}

main().catch((error) => {
  console.error(
    'verify-completion-undo failed:',
    error,
  );

  process.exitCode = 1;
});
