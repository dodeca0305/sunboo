import test from "node:test";
import assert from "node:assert/strict";
import {
  executeProductionTaxControl,
  ExecutionOutcomeUnknown,
} from "../src/lib/taxIntelligence/productionExecution.ts";
import {
  recoverTaxExecution,
  validPendingExecution,
} from "../src/lib/taxIntelligence/executionRecovery.ts";
import { initial, fixture } from "./fixtures/taxExecutionInputs.mjs";
import { executionId, intent } from "./fixtures/taxExecutionDatabase.mjs";
const input = {
  companyId: 23,
  taxControlId: 10,
  asOfDate: "2026-11-03",
  executionId,
};
for (const table of Object.keys(initial))
  for (const mode of ["error", "throw", "null", "malformed"])
    test(`execution required read ${table} ${mode}: no persistence`, async () => {
      if (table === "workspace_company_profiles" && mode === "null") {
        const normal = fixture({ failTable: table, mode });
        await executeProductionTaxControl(normal.client, input);
        assert.equal(normal.calls.length, 1);
        return;
      }
      const f = fixture({ failTable: table, mode });
      await assert.rejects(executeProductionTaxControl(f.client, input));
      assert.equal(f.calls.length, 0);
    });
test("normal unregistered profile and financial entries stay distinct from failure", async () => {
  const f = fixture();
  f.data.workspace_company_profiles = [];
  f.data.workspace_tax_return_profiles = [];
  const result = await executeProductionTaxControl(f.client, input);
  assert.equal(result.evaluation.reasonCode, "no_tax_return_entries");
  assert.equal(result.evaluation.applicable, false);
  assert.equal(f.calls.length, 1);
});
test("normal zero and null financial values retained in execution snapshot", async () => {
  const f = fixture();
  await executeProductionTaxControl(f.client, input);
  const row =
    f.calls[0].args.p_observed_inputs._sunboo_execution.inputSnapshot
      .taxReturnProfile.entries[0];
  assert.equal(row.corporateTaxAmount.exactValue, 0);
  assert.equal(row.consumptionTaxAmount, null);
});
test("all rule links paginated; failure on terminal page stops save", async () => {
  const f = fixture({ failTable: "tax_control_rules", failOffset: 1 });
  await assert.rejects(executeProductionTaxControl(f.client, input));
  assert.equal(f.calls.length, 0);
  assert.ok(
    f.reads.some((r) => r.table === "tax_control_rules" && r.start === 1),
  );
});
test("response loss and RPC error do not report success", async () => {
  for (const persist of [
    async () => {
      throw Error("lost");
    },
    async () => ({ error: { message: "lost" }, data: null }),
    async () => ({ error: null, data: [{}] }),
  ]) {
    const f = fixture({ persist });
    await assert.rejects(
      executeProductionTaxControl(f.client, input),
      ExecutionOutcomeUnknown,
    );
    assert.equal(f.calls.length, 1);
  }
});
const pending = { executionId, intent };
function savedData() {
  return {
    ...structuredClone(initial),
    workspace_tax_control_results: [
      {
        id: 100,
        company_id: 23,
        tax_control_id: 10,
        as_of_date: intent.asOfDate,
        applicable: true,
        status: "unknown",
        observed_inputs: { _sunboo_execution: { id: executionId, intent } },
      },
    ],
    workspace_tax_review_cases: [
      { id: 200, company_id: 23, control_result_id: 100, status: "resolved" },
    ],
  };
}
test("reload recovery reads saved result and preserves resolved review; no RPC", async () => {
  const f = fixture({ data: savedData() });
  assert.deepEqual(await recoverTaxExecution(f.client, pending), {
    status: "saved",
    controlResultId: 100,
    reviewCaseId: 200,
  });
  assert.equal(f.calls.length, 0);
});
for (const table of [
  "workspace_tax_control_results",
  "workspace_tax_review_cases",
])
  for (const mode of ["error", "throw", "null"])
    test(`recovery unavailable ${table} ${mode} does not resend`, async () => {
      const f = fixture({ data: savedData(), failTable: table, mode });
      assert.equal(
        (await recoverTaxExecution(f.client, pending)).status,
        "unavailable",
      );
      assert.equal(f.calls.length, 0);
    });
test("recovery cannot reference/reuse another company or mismatched input", async () => {
  for (const mutate of [
    (d) => {
      d.workspace_tax_control_results[0].company_id = 24;
    },
    (d) => {
      d.workspace_tax_control_results[0].observed_inputs._sunboo_execution.intent =
        { ...intent, companyId: 24 };
    },
    (d) => {
      d.workspace_tax_review_cases[0].company_id = 24;
    },
    (d) => {
      d.workspace_tax_control_results[0].tax_control_id = 11;
    },
    (d) => {
      d.workspace_tax_control_results[0].observed_inputs._sunboo_execution.intent =
        { ...intent, liquidationResidualAssetsCase: "applicable" };
    },
  ]) {
    const data = savedData();
    mutate(data);
    const f = fixture({ data });
    assert.notEqual(
      (await recoverTaxExecution(f.client, pending)).status,
      "saved",
    );
    assert.equal(f.calls.length, 0);
  }
  assert.equal(validPendingExecution(pending, 24), false);
});
test("successful missing recovery differs from error, missing review blocks completion", async () => {
  const f = fixture();
  assert.equal(
    (await recoverTaxExecution(f.client, pending)).status,
    "missing",
  );
  const data = savedData();
  data.workspace_tax_review_cases = [];
  assert.equal(
    (await recoverTaxExecution(fixture({ data }).client, pending)).status,
    "conflict",
  );
});

test('failure before evaluation leaves evaluator and persistence uncalled', async () => {
  const {loadExecutionCompany,loadExecutionProfile,loadExecutionTaxReturns} = await import('../src/lib/taxIntelligence/productionInputs.ts');
  const {loadProductionTaxControlRuntime} = await import('../src/lib/taxIntelligence/productionExecutionContext.ts');
  for (const table of Object.keys(initial)) {
    const f = fixture({failTable: table}); let evaluations = 0;
    await assert.rejects(executeProductionTaxControl(f.client, input, {
      loadWorkspaceCompany: loadExecutionCompany,
      loadWorkspaceCompanyProfile: loadExecutionProfile,
      loadWorkspaceTaxReturnProfile: loadExecutionTaxReturns,
      loadProductionTaxControlRuntime,
      evaluateProductionTaxControl() { evaluations++; throw Error('must not evaluate'); },
    }));
    assert.equal(evaluations, 0); assert.equal(f.calls.length, 0);
  }
});
test('terminal financial page failure and recovery', async () => {
  const failed = fixture({failTable:'workspace_tax_return_profiles', failOffset:1});
  await assert.rejects(executeProductionTaxControl(failed.client,input));assert.equal(failed.calls.length,0);
  const recovered=fixture();await executeProductionTaxControl(recovered.client,input);assert.equal(recovered.calls.length,1);
});
