import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { chromium } from "playwright-core";
import { initial } from "../tests/fixtures/taxExecutionInputs.mjs";
process.loadEnvFile(".env.local");
const origin = "http://127.0.0.1:3119",
  file = path.resolve("test-results/tax-execution-control.json");
await mkdir("test-results", { recursive: true });
const base = structuredClone(initial);
base.workspace_tax_control_results = [];
base.workspace_tax_review_cases = [];
const auth = JSON.parse(
  readFileSync("playwright/.auth/share-expiry-session.json", "utf8"),
);
// The real authenticated email is used only for synthetic membership matching. Never print it.
let server,
  browser,
  logs = "";
const update = async (extra = {}) =>
  writeFile(file, JSON.stringify({ data: structuredClone(base), ...extra }));
const calls = () =>
  existsSync(file + ".calls")
    ? readFileSync(file + ".calls", "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
    : [];
try {
  await update();
  server = spawn(
    process.execPath,
    [
      "--import",
      path.resolve("playwright/tax-execution-safety-fetch.mjs"),
      "node_modules/next/dist/bin/next",
      "dev",
      "--webpack",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3119",
    ],
    {
      env: { ...process.env, TAX_EXECUTION_CONTROL_FILE: file },
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.on("data", (c) => (logs += c));
  server.stderr.on("data", (c) => (logs += c));
  for (let i = 0; i < 100; i++) {
    assert.equal(server.exitCode, null);
    try {
      if ((await fetch(origin + "/admin/login")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies(
    auth.cookies.map(({ name, value }) => ({
      name,
      value,
      url: origin,
      sameSite: "Lax",
    })),
  );
  await context.route("**/rest/v1/**", (r) => r.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  // Auth is checked by Supabase, while only the company member query is synthesized by the test hook.
  // Derive the email without logging credentials or session material.
  const tokenCookie = auth.cookies
    .filter((c) => c.name.includes("auth-token"))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => c.value)
    .join("");
  let decoded = tokenCookie;
  if (decoded.startsWith("base64-"))
    decoded = Buffer.from(decoded.slice(7), "base64url").toString();
  const user = JSON.parse(decoded).user;
  const email = user.email;
  base.workspace_members = [{ company_id: 23, email, role: "owner" }];
  const url = origin + "/admin/workspaces/23/tax-review";
  const execute = page.getByRole("button", {
    name: "評価して保存",
    exact: true,
  });
  const verify = page.getByRole("button", {
    name: "保存結果を確認",
    exact: true,
  });
  async function fresh(extra = {}) {
    await update(extra);
    await page.goto(origin + "/admin/login");
    await page.evaluate(() => sessionStorage.clear());
    await page.goto(url, { waitUntil: "networkidle" });
    await execute.waitFor();
    assert.equal(await execute.isEnabled(), true);
  }
  for (const table of [
    "workspace_company_profiles",
    "workspace_tax_return_profiles",
    "tax_rules",
  ]) {
    await fresh({ failTable: table });
    const count = calls().length;
    await execute.click();
    await page
      .getByRole("alert")
      .filter({ hasText: /取得できません/ })
      .waitFor();
    assert.equal(calls().length, count);
    assert.equal(await execute.isDisabled(), true);
    await update();
    await verify.click();
    await page.getByRole("button", { name: "同じ実行IDで再試行" }).waitFor();
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await execute.isDisabled(), true);
    await verify.click();
    await page.getByRole("button", { name: "同じ実行IDで再試行" }).click();
    await page
      .getByRole("status")
      .filter({ hasText: /保存しました/ })
      .waitFor();
  }
  await fresh({ lostResponse: true });
  const before = calls().length;
  await execute.click();
  await page
    .getByRole("alert")
    .filter({ hasText: /保存結果を確認/ })
    .waitFor();
  assert.equal(calls().length, before + 1);
  assert.equal(await execute.isDisabled(), true);
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await execute.isDisabled(), true);
  const c = JSON.parse(readFileSync(file, "utf8"));
  c.lostResponse = false;
  await writeFile(file, JSON.stringify(c));
  await verify.click();
  await page
    .getByRole("status")
    .filter({ hasText: /保存済み/ })
    .waitFor();
  assert.equal(calls().length, before + 1);
  await fresh({ saveFailure: true });
  await execute.click();
  await verify.waitFor();
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await execute.isDisabled(), true);
  await update();
  await verify.click();
  await page.getByRole("button", { name: "同じ実行IDで再試行" }).waitFor();
  const count = calls().length;
  await page.getByRole("button", { name: "同じ実行IDで再試行" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: /保存しました/ })
    .waitFor();
  assert.equal(calls().length, count + 1);
  assert.equal(existsSync(file + ".blocked"), false);
  await writeFile(
    "test-results/tax-execution-e2e.json",
    JSON.stringify(
      {
        readFailureStops: true,
        normalRecovery: true,
        reloadPreservesPending: true,
        responseLossRecoveryWithoutResend: true,
        saveFailureRecovery: true,
        productionBusinessWrites: 0,
      },
      null,
      2,
    ),
  );
  console.log(
    "Synthetic execution UI safety passed; production business writes: 0",
  );
} catch (e) {
  await writeFile("test-results/tax-execution-server.log", logs);
  throw e;
} finally {
  await browser?.close();
  if (server)
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {}
}
