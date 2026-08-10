import { chromium } from 'playwright-core';
import { createServerClient } from '@supabase/ssr';
import {
  existsSync,
  readFileSync,
} from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import {
  ensureAppServerAvailable,
} from './ensure-app-server.mjs';

const APP_URL =
  process.env.PREVIEW_APP_URL
  ?? 'http://localhost:3000';

const STORAGE_STATE_PATH = path.join(
  process.cwd(),
  'playwright',
  '.auth',
  'admin.json',
);

const SCREENSHOT_PATH = path.join(
  process.cwd(),
  'test-results',
  'share-link-access.png',
);

const INVALID_LINK_MESSAGE =
  'このリンクは無効か、有効期限が切れています。'
  + '共有元にお問い合わせください。';

function readEnv(name) {
  if (process.env[name]) {
    return process.env[name];
  }

  const text = readFileSync(
    '.env.local',
    'utf8',
  );

  for (
    const rawLine
    of text.split(/\r?\n/)
  ) {
    const line = rawLine.trim();

    if (
      !line
      || line.startsWith('#')
      || !line.startsWith(`${name}=`)
    ) {
      continue;
    }

    let value =
      line.slice(name.length + 1).trim();

    if (
      (
        value.startsWith('"')
        && value.endsWith('"')
      )
      || (
        value.startsWith("'")
        && value.endsWith("'")
      )
    ) {
      value = value.slice(1, -1);
    }

    return value;
  }

  throw new Error(
    `${name} が .env.local に`
    + '見つかりません。',
  );
}

function createAdminSupabase() {
  const storageState = JSON.parse(
    readFileSync(
      STORAGE_STATE_PATH,
      'utf8',
    ),
  );

  let cookies =
    storageState.cookies.map(
      ({ name, value }) => ({
        name,
        value,
      }),
    );

  return createServerClient(
    readEnv(
      'NEXT_PUBLIC_SUPABASE_URL',
    ),
    readEnv(
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    ),
    {
      cookies: {
        getAll() {
          return cookies;
        },

        setAll(updates) {
          for (
            const update
            of updates
          ) {
            cookies =
              cookies.filter(
                (cookie) =>
                  cookie.name
                  !== update.name,
              );

            cookies.push({
              name: update.name,
              value: update.value,
            });
          }
        },
      },
    },
  );
}

async function assertAuthenticated(page) {
  if (
    page.url().includes(
      '/admin/login',
    )
  ) {
    throw new Error(
      '認証状態が期限切れです。'
      + 'storageStateを'
      + '作り直してください。',
    );
  }
}

async function findWorkspacePath(page) {
  await page.goto(
    `${APP_URL}/admin/workspaces`,
    {
      waitUntil: 'networkidle',
    },
  );

  await assertAuthenticated(page);

  const paths = await page
    .locator(
      'a[href^="/admin/workspaces/"]',
    )
    .evaluateAll((anchors) => {
      const values = anchors
        .map((anchor) =>
          anchor.getAttribute('href'),
        )
        .filter(
          (href) =>
            typeof href === 'string'
            && /^\/admin\/workspaces\/\d+$/
              .test(href),
        );

      return [...new Set(values)];
    });

  if (paths.length === 0) {
    throw new Error(
      '操作できるワークスペースが'
      + '見つかりません。',
    );
  }

  return paths[0];
}

async function main() {
  if (
    !existsSync(
      STORAGE_STATE_PATH,
    )
  ) {
    throw new Error(
      'storageStateが'
      + '見つかりません: '
      + STORAGE_STATE_PATH,
    );
  }

  if (
    !(await ensureAppServerAvailable(
      APP_URL,
    ))
  ) {
    process.exit(1);
  }

  await mkdir(
    path.dirname(
      SCREENSHOT_PATH,
    ),
    {
      recursive: true,
    },
  );

  const adminSupabase =
    createAdminSupabase();

  const {
    data: { user },
    error: userError,
  } =
    await adminSupabase.auth.getUser();

  if (
    userError
    || !user
  ) {
    throw new Error(
      '管理者セッションを'
      + '確認できません: '
      + (
        userError?.message
        ?? 'user not found'
      ),
    );
  }

  const browser =
    await chromium.launch({
      headless:
        process.env.HEADED !== '1',
    });

  const adminContext =
    await browser.newContext({
      storageState:
        STORAGE_STATE_PATH,
    });

  const anonymousContext =
    await browser.newContext();

  const adminPage =
    await adminContext.newPage();

  const publicPage =
    await anonymousContext.newPage();

  let createdLinkId = null;

  try {
    const workspacePath =
      await findWorkspacePath(
        adminPage,
      );

    const shareAdminPath =
      `${workspacePath}/share`;

    await adminPage.goto(
      `${APP_URL}${shareAdminPath}`,
      {
        waitUntil: 'networkidle',
      },
    );

    await assertAuthenticated(
      adminPage,
    );

    const createButton =
      adminPage.getByRole(
        'button',
        {
          name:
            '新しい共有リンクを発行',
          exact: true,
        },
      );

    await createButton.waitFor();

    const existingInputs =
      adminPage.locator(
        'input[readonly]',
      );

    const oldFirstUrl =
      (await existingInputs.count())
        > 0
        ? await existingInputs
          .first()
          .inputValue()
        : null;

    await createButton.click();

    await adminPage.waitForFunction(
      (previousUrl) => {
        const input =
          document.querySelector(
            'input[readonly]',
          );

        return (
          input
          instanceof HTMLInputElement
          && input.value.length > 0
          && input.value
            !== previousUrl
        );
      },
      oldFirstUrl,
    );

    const newInput =
      adminPage
        .locator(
          'input[readonly]',
        )
        .first();

    const shareUrl =
      await newInput.inputValue();

    const sharePath =
      new URL(shareUrl).pathname;

    const tokenMatch =
      sharePath.match(
        /^\/share\/([^/]+)$/,
      );

    if (!tokenMatch) {
      throw new Error(
        '発行された共有URLの形式が'
        + `不正です: ${sharePath}`,
      );
    }

    const token =
      tokenMatch[1];

    const {
      data: createdLink,
      error: linkSelectError,
    } =
      await adminSupabase
        .from(
          'workspace_share_links',
        )
        .select(
          'id, shared_sections, '
          + 'revoked_at',
        )
        .eq(
          'token',
          token,
        )
        .single();

    if (
      linkSelectError
      || !createdLink
    ) {
      throw new Error(
        '発行した共有リンクを'
        + 'DBから確認できません: '
        + (
          linkSelectError
            ?.message
          ?? 'not found'
        ),
      );
    }

    createdLinkId =
      createdLink.id;

    console.log(
      '1. 共有リンク発行を確認',
    );

    await publicPage.goto(
      shareUrl,
      {
        waitUntil: 'networkidle',
      },
    );

    const companyHeading =
      publicPage
        .locator('h1')
        .first();

    await companyHeading.waitFor();

    const companyName =
      (
        await companyHeading
          .textContent()
      )?.trim();

    if (!companyName) {
      throw new Error(
        '匿名共有ページに'
        + '会社名が表示されていません。',
      );
    }

    await publicPage
      .getByRole(
        'heading',
        {
          name:
            '年間ロードマップ',
          exact: true,
        },
      )
      .waitFor();

    console.log(
      '2. 匿名閲覧と'
      + 'ロードマップ表示を確認',
    );

    const {
      error: sectionUpdateError,
    } =
      await adminSupabase
        .from(
          'workspace_share_links',
        )
        .update({
          shared_sections: [
            'company',
            'profile',
          ],
        })
        .eq(
          'id',
          createdLinkId,
        );

    if (sectionUpdateError) {
      throw new Error(
        'shared_sectionsの'
        + '更新に失敗しました: '
        + sectionUpdateError.message,
      );
    }

    await publicPage.reload({
      waitUntil: 'networkidle',
    });

    await publicPage
      .getByRole(
        'heading',
        {
          name: companyName,
          exact: true,
        },
      )
      .waitFor();

    const roadmapHeading =
      publicPage.getByRole(
        'heading',
        {
          name:
            '年間ロードマップ',
          exact: true,
        },
      );

    if (
      await roadmapHeading.count()
      !== 0
    ) {
      throw new Error(
        'roadmap未共有なのに'
        + '年間ロードマップが'
        + '表示されています。',
      );
    }

    console.log(
      '3. roadmap未共有時の'
      + '非表示を確認',
    );

    const linkControls =
      newInput.locator(
        'xpath=..',
      );

    adminPage.once(
      'dialog',
      (dialog) =>
        dialog.accept(),
    );

    await linkControls
      .getByRole(
        'button',
        {
          name:
            '失効させる',
          exact: true,
        },
      )
      .click();

    await linkControls
      .locator('xpath=..')
      .getByText(
        '失効済み',
        {
          exact: true,
        },
      )
      .waitFor();

    console.log(
      '4. 管理画面から'
      + '共有リンク失効を確認',
    );

    await publicPage.reload({
      waitUntil: 'networkidle',
    });

    await publicPage
      .getByText(
        INVALID_LINK_MESSAGE,
        {
          exact: true,
        },
      )
      .waitFor();

    console.log(
      '5. 失効後の匿名アクセス'
      + '拒否を確認',
    );

    await publicPage.screenshot({
      path: SCREENSHOT_PATH,
      fullPage: true,
    });

    console.log(
      '=== verification === PASS',
    );

    console.log(
      'スクリーンショット: '
      + SCREENSHOT_PATH,
    );
  } catch (error) {
    await publicPage
      .screenshot({
        path: SCREENSHOT_PATH,
        fullPage: true,
      })
      .catch(() => {});

    throw error;
  } finally {
    if (
      createdLinkId !== null
    ) {
      try {
        console.log(
          'cleanup: '
          + 'テスト共有リンクを削除',
        );

        const {
          error: deleteError,
        } =
          await adminSupabase
            .from(
              'workspace_share_links',
            )
            .delete()
            .eq(
              'id',
              createdLinkId,
            );

        if (deleteError) {
          throw deleteError;
        }

        const {
          data: remainingLink,
          error:
            remainingLinkError,
        } =
          await adminSupabase
            .from(
              'workspace_share_links',
            )
            .select('id')
            .eq(
              'id',
              createdLinkId,
            )
            .maybeSingle();

        if (remainingLinkError) {
          throw remainingLinkError;
        }

        if (remainingLink) {
          throw new Error(
            '削除後も共有リンクが'
            + '残っています。',
          );
        }

        console.log(
          'cleanup完了: '
          + 'テスト共有リンクを削除',
        );
      } catch (cleanupError) {
        console.error(
          'cleanup failed:',
          cleanupError,
        );

        process.exitCode = 1;
      }
    }

    await adminContext.close();
    await anonymousContext.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(
    'verify-share-link-access '
    + 'failed:',
    error,
  );

  process.exitCode = 1;
});
