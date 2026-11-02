import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import {
  setup,
  claims,
  args,
  sql,
  parameters,
  snapshotSQL,
  identity,
} from "./fixtures/taxExecutionDatabase.mjs";
test("tax execution: atomic persistence, replay and DB authorization", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(setup);
    await identity(db);
    const call = (a = args) => db.query(sql, parameters(a));
    const snapshot = async () => (await db.query(snapshotSQL)).rows[0].data;
    const first = (await call()).rows;
    const original = await snapshot();
    await t.test(
      "same request returns same IDs without new history",
      async () => {
        assert.deepEqual((await call()).rows, first);
        assert.deepEqual(await snapshot(), original);
      },
    );
    for (const index of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
      await t.test("changed payload refused at argument " + index, async () => {
        const changed = structuredClone(args);
        if (index === 0) changed[0] = 24;
        else if (index === 1) changed[1] = 11;
        else if (index === 2) changed[2] = "2026-11-02";
        else if (index === 3) changed[3] = false;
        else if (index === 4) changed[4] = "review";
        else if (index === 7) changed[7].value = 2;
        else if (index === 8) changed[8] = [{ contentHash: "different" }];
        else changed[index] = "different";
        await assert.rejects(call(changed));
        assert.deepEqual(await snapshot(), original);
      });
    await t.test(
      "missing/malformed/foreign-company execution identity rejected",
      async () => {
        for (const meta of [
          undefined,
          {},
          { id: "bad" },
          {
            ...args[7]._sunboo_execution,
            intent: { ...args[7]._sunboo_execution.intent, companyId: 24 },
          },
        ]) {
          const a = structuredClone(args);
          a[7]._sunboo_execution = meta;
          await assert.rejects(call(a));
        }
        assert.deepEqual(await snapshot(), original);
      },
    );
    for (const table of [
      "workspace_tax_control_results",
      "workspace_tax_review_cases",
      "workspace_tax_review_case_events",
    ])
      await t.test("all-row rollback at " + table, async () => {
        const a = structuredClone(args);
        a[7]._sunboo_execution.id = crypto.randomUUID();
        await db.query("select set_config('test.fail',$1,false)", [table]);
        await assert.rejects(call(a), /synthetic stage failure/);
        await db.query("select set_config('test.fail','',false)");
        assert.deepEqual(await snapshot(), original);
      });
    await t.test(
      "response loss followed by replay cannot duplicate",
      async () => {
        const a = structuredClone(args);
        a[7]._sunboo_execution.id = crypto.randomUUID();
        const committed = (await call(a)).rows;
        const before = await snapshot();
        assert.deepEqual((await call(a)).rows, committed);
        assert.deepEqual(await snapshot(), before);
      },
    );
    await t.test(
      "later review resolution remains unchanged on replay",
      async () => {
        await db.exec(
          `UPDATE workspace_tax_review_cases SET status='resolved',resolution_summary='synthetic resolved',title='edited after save',issue_summary='edited issue' WHERE id=${first[0].review_case_id}`,
        );
        const before = await snapshot();
        assert.deepEqual((await call()).rows, first);
        assert.deepEqual(await snapshot(), before);
      },
    );
    await t.test("a new intentional operation can append", async () => {
      const a = structuredClone(args);
      a[7]._sunboo_execution.id = crypto.randomUUID();
      assert.notDeepEqual((await call(a)).rows, first);
    });
    for (const [label, jwt, role, member] of [
      ["anon", {}, "anon", "owner"],
      [
        "anonymous session",
        { ...claims, is_anonymous: true },
        "authenticated",
        "owner",
      ],
      ["missing uid", { email: claims.email }, "authenticated", "owner"],
      [
        "nonadmin",
        { ...claims, email: "other@example.invalid" },
        "authenticated",
        "owner",
      ],
      ["viewer", claims, "authenticated", "viewer"],
      ["outside company", claims, "authenticated", "none"],
      ["member", claims, "authenticated", "member"],
    ])
      await t.test("authorization " + label, async () => {
        await db.exec("RESET ROLE");
        await db.query("UPDATE workspace_members SET role=$1", [member]);
        await identity(db, jwt, role);
        if (label === "member") assert.deepEqual((await call()).rows, first);
        else await assert.rejects(call());
      });
    await db.exec("RESET ROLE; UPDATE workspace_members SET role='owner'");
    await identity(db);
    await t.test(
      "authorized company 23 cannot read or reuse company 24 result",
      async () => {
        await db.exec("RESET ROLE");
        await db.exec(
          "INSERT INTO workspace_members VALUES(24,'admin@example.invalid','owner')",
        );
        await identity(db);
        const a = structuredClone(args);
        a[0] = 24;
        a[7]._sunboo_execution.intent.companyId = 24;
        const other = (await call(a)).rows[0];
        await db.exec(
          "RESET ROLE;DELETE FROM workspace_members WHERE company_id=24",
        );
        await identity(db);
        assert.equal(
          (
            await db.query(
              "SELECT id FROM workspace_tax_control_results WHERE id=$1",
              [other.control_result_id],
            )
          ).rows.length,
          0,
        );
        await assert.rejects(call(a));
        assert.deepEqual((await call()).rows, first);
      },
    );
    await t.test(
      "unsafe transaction snapshot isolation is rejected",
      async () => {
        await db.exec("BEGIN ISOLATION LEVEL REPEATABLE READ");
        await assert.rejects(call(), /read committed/);
        await db.exec("ROLLBACK");
      },
    );
    await t.test('changed complete input snapshot is rejected',async()=>{
      const changed=structuredClone(args);changed[7]._sunboo_execution.inputSnapshot={synthetic:'different'};
      await assert.rejects(call(changed),/different input/);
    });
  } finally {
    await db.close();
  }
});
