import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import {
  ensureAppServerAvailable,
} from './ensure-app-server.mjs';

const APP_URL =
  process.env.PREVIEW_APP_URL ??
  'http://localhost:3000';

const STORAGE_STATE_PATH = path.join(
  process.cwd(),
  'playwright',
  '.auth',
  'admin.json',
);

const SCREENSHOT_PATH = path.join(
  process.cwd(),
  'test-results',
  'profile-roadmap.png',
);

const ADDRESS_PLACEHOLDER =
  '例: 1丁目2番3号 ○○ビル4階';

async function assertAuthenticated(page) {
  if (page.url().includes('/admin/login')) {
    throw new Error(
      '認証状態が期限切れです。'
      + 'storageStateを作り直してください。',
    );
  }
}

async function getWorkspacePaths(page) {
  await page.goto(
    `${APP_URL}/admin/workspaces`,
    {
      waitUntil: 'networkidle',
    },
  );

  await assertAuthenticated(page);

  return page
    .locator(
      'a[href^="/admin/workspaces/"]',
    )
    .evaluateAll((anchors) => {
      const paths = anchors
        .map((anchor) =>
          anchor.getAttribute('href'),
        )
        .filter(
          (href) =>
            typeof href === 'string'
            && /^\/admin\/workspaces\/\d+$/.test(
              href,
            ),
        );

      return [...new Set(paths)];
    });
}

async function findWorkspaceWithRoadmap(page) {
  const workspacePaths =
    await getWorkspacePaths(page);

  if (workspacePaths.length === 0) {
    throw new Error(
      '操作できるワークスペースが'
      + '見つかりません。',
    );
  }

  for (const workspacePath of workspacePaths) {
    const roadmapPath =
      `${workspacePath}/roadmap`;

    await page.goto(
      `${APP_URL}${roadmapPath}`,
      {
        waitUntil: 'networkidle',
      },
    );

    await assertAuthenticated(page);

    const heading = page.getByRole(
      'heading',
      {
        name: '年間ロードマップ',
        exact: true,
      },
    );

    if ((await heading.count()) !== 1) {
      continue;
    }

    const statusSelects = page.locator(
      'select[aria-label$="のステータス"]',
    );

    const procedureCount =
      await statusSelects.count();

    if (procedureCount > 0) {
      return {
        workspacePath,
        roadmapPath,
        procedureCount,
      };
    }
  }

  throw new Error(
    '年間ロードマップが生成済みの'
    + 'ワークスペースが見つかりません。',
  );
}

async function saveAddress(
  page,
  address,
) {
  const addressInput =
    page.getByPlaceholder(
      ADDRESS_PLACEHOLDER,
    );

  if ((await addressInput.count()) !== 1) {
    throw new Error(
      '番地・建物名の入力欄を'
      + '一意に取得できません。',
    );
  }

  await addressInput.fill(address);

  const saveButton = page.getByRole(
    'button',
    {
      name: '保存する',
      exact: true,
    },
  );

  await saveButton.click();

  await page
    .getByText(
      '会社情報を保存しました',
      {
        exact: true,
      },
    )
    .waitFor({
      state: 'visible',
    });
}

async function main() {
  if (!existsSync(STORAGE_STATE_PATH)) {
    throw new Error(
      `storageStateが見つかりません: `
      + STORAGE_STATE_PATH,
    );
  }

  if (
    !(await ensureAppServerAvailable(APP_URL))
  ) {
    process.exit(1);
  }

  await mkdir(
    path.dirname(SCREENSHOT_PATH),
    {
      recursive: true,
    },
  );

  const browser = await chromium.launch({
    headless:
      process.env.HEADED !== '1',
  });

  const context = await browser.newContext({
    storageState: STORAGE_STATE_PATH,
  });

  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  const httpErrorResponses = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(
        message.text(),
      );
    }
  });

  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  page.on('response', (response) => {
    if (response.status() >= 500) {
      httpErrorResponses.push(
        `${response.status()} `
        + response.url(),
      );
    }
  });

  let profilePath = null;
  let originalAddress = null;

  try {
    const target =
      await findWorkspaceWithRoadmap(page);

    profilePath =
      `${target.workspacePath}/profile`;

    console.log('=== target ===');
    console.log({
      workspacePath:
        target.workspacePath,
      procedureCount:
        target.procedureCount,
    });

    await page.goto(
      `${APP_URL}${profilePath}`,
      {
        waitUntil: 'networkidle',
      },
    );

    await assertAuthenticated(page);

    await page
      .getByRole(
        'heading',
        {
          name: '会社プロフィール',
          exact: true,
        },
      )
      .waitFor();

    const addressInput =
      page.getByPlaceholder(
        ADDRESS_PLACEHOLDER,
      );

    originalAddress =
      await addressInput.inputValue();

    const temporaryAddress =
      originalAddress === 'E2E確認'
        ? 'E2E確認2'
        : 'E2E確認';

    console.log(
      '1. 会社プロフィール表示を確認',
    );

    await saveAddress(
      page,
      temporaryAddress,
    );

    console.log(
      '2. プロフィール保存を確認',
    );

    await page.reload({
      waitUntil: 'networkidle',
    });

    await assertAuthenticated(page);

    const persistedAddress =
      await page
        .getByPlaceholder(
          ADDRESS_PLACEHOLDER,
        )
        .inputValue();

    if (
      persistedAddress !== temporaryAddress
    ) {
      throw new Error(
        'プロフィール変更がDBへ'
        + '保存されていません。',
      );
    }

    console.log(
      '3. 保存内容の再読込を確認',
    );

    const roadmapLink =
      page.getByRole(
        'link',
        {
          name: '年間ロードマップ',
          exact: true,
        },
      );

    await Promise.all([
      page.waitForNavigation({
        waitUntil: 'networkidle',
      }),
      roadmapLink.click(),
    ]);

    await assertAuthenticated(page);

    const currentPath =
      new URL(page.url()).pathname;

    if (
      currentPath !== target.roadmapPath
    ) {
      throw new Error(
        `ロードマップへの遷移先が`
        + `不正です: ${currentPath}`,
      );
    }

    await page
      .getByRole(
        'heading',
        {
          name: '年間ロードマップ',
          exact: true,
        },
      )
      .waitFor();

    const roadmapItems =
      page.locator(
        'select[aria-label$="のステータス"]',
      );

    const roadmapItemCount =
      await roadmapItems.count();

    if (roadmapItemCount < 1) {
      throw new Error(
        '年間ロードマップに'
        + '手続きが表示されていません。',
      );
    }

    console.log(
      `4. 年間ロードマップ表示を確認: `
      + `${roadmapItemCount}件`,
    );

    if (consoleErrors.length > 0) {
      throw new Error(
        `console.errorが`
        + `${consoleErrors.length}件`
        + '発生しました。',
      );
    }

    if (pageErrors.length > 0) {
      throw new Error(
        `pageerrorが`
        + `${pageErrors.length}件`
        + '発生しました。',
      );
    }

    if (
      httpErrorResponses.length > 0
    ) {
      throw new Error(
        `HTTP 5xxが`
        + `${httpErrorResponses.length}件`
        + '発生しました。',
      );
    }

    await page.screenshot({
      path: SCREENSHOT_PATH,
      fullPage: true,
    });

    console.log(
      '=== verification === PASS',
    );
    console.log(
      `スクリーンショット: `
      + SCREENSHOT_PATH,
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
      profilePath !== null
      && originalAddress !== null
    ) {
      try {
        await page.goto(
          `${APP_URL}${profilePath}`,
          {
            waitUntil: 'networkidle',
          },
        );

        await assertAuthenticated(page);

        const currentAddress =
          await page
            .getByPlaceholder(
              ADDRESS_PLACEHOLDER,
            )
            .inputValue();

        if (
          currentAddress !==
          originalAddress
        ) {
          console.log(
            'cleanup: 番地・建物名を'
            + '元の値へ戻します',
          );

          await saveAddress(
            page,
            originalAddress,
          );

          await page.reload({
            waitUntil: 'networkidle',
          });

          const restoredAddress =
            await page
              .getByPlaceholder(
                ADDRESS_PLACEHOLDER,
              )
              .inputValue();

          if (
            restoredAddress !==
            originalAddress
          ) {
            throw new Error(
              'プロフィールの後片付けに'
              + '失敗しました。',
            );
          }
        }

        console.log(
          'cleanup完了: '
          + '番地・建物名を復元',
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
    'verify-profile-roadmap failed:',
    error,
  );

  process.exitCode = 1;
});
