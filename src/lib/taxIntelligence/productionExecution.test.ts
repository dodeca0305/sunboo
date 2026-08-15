import test from 'node:test';
import assert from 'node:assert/strict';

import {
  executeProductionTaxControl,
  type ProductionTaxControlExecutorDependencies,
} from './productionExecution.ts';
import {
  PRODUCTION_CONTROL_EVALUATOR_KEYS,
} from './productionEvaluators.ts';

type RpcCall = {
  name: string;
  args: Record<string, unknown>;
};

function runtimeSnapshot() {
  return [
    {
      provider: 'e_gov',
      canonicalLocator: 'egov:test',
      versionLabel: 'v1',
      contentHash: 'hash-egov',
    },
  ];
}

function evaluation(
  overrides: Record<string, unknown> = {},
) {
  return {
    applicable: true,
    status: 'unknown' as const,
    reasonCode: 'test_unknown',
    reasonSummary: '確認情報が不足しています。',
    observedInputs: {
      test: true,
    },
    sourceVersionSnapshot: runtimeSnapshot(),
    evaluatorVersion: 'test-evaluator-v1',
    ...overrides,
  };
}

function createDependencies(
  overrides: Partial<
    ProductionTaxControlExecutorDependencies
  > = {},
): ProductionTaxControlExecutorDependencies {
  const dependencies = {
    async loadWorkspaceCompany() {
      return {
        id: 1,
        name: 'テスト株式会社',
        prefecture_code: '13',
        municipality_code: '13101',
        corporate_type: 'kabushiki',
        fiscal_month: 3,
      };
    },

    async loadWorkspaceCompanyProfile() {
      return {
        fiscalMonth: 3,
        consumptionTaxStatus: 'taxable',
        invoiceRegistrationStatus: 'registered',
      };
    },

    async loadWorkspaceTaxReturnProfile() {
      return {
        entries: [],
      };
    },

    async loadProductionTaxControlRuntime() {
      return {
        taxControlId: 10,
        controlCode: 'TI_TAX_001',
        controlTitle:
          '法人税確定申告の提出時期確認',
        evaluatorKey:
          PRODUCTION_CONTROL_EVALUATOR_KEYS.TI_TAX_001,
        executionContext: {
          sourceVersionSnapshot:
            runtimeSnapshot(),
        },
      };
    },

    evaluateProductionTaxControl() {
      return evaluation();
    },

    ...overrides,
  };

  return dependencies as unknown as
    ProductionTaxControlExecutorDependencies;
}

function createSupabaseFixture(options?: {
  rpcError?: string;
  reviewCaseId?: number | null;
}) {
  const calls: RpcCall[] = [];

  const supabase = {
    async rpc(
      name: string,
      args: Record<string, unknown>,
    ) {
      calls.push({
        name,
        args,
      });

      if (options?.rpcError) {
        return {
          data: null,
          error: {
            message: options.rpcError,
          },
        };
      }

      return {
        data: [
          {
            control_result_id: 100,
            review_case_id:
              options?.reviewCaseId === undefined
                ? 200
                : options.reviewCaseId,
          },
        ],
        error: null,
      };
    },
  };

  return {
    supabase: supabase as unknown as Parameters<
      typeof executeProductionTaxControl
    >[0],
    calls,
  };
}

test('UNKNOWN評価をControlResultとReviewCaseへatomic保存する', async () => {
  const fixture = createSupabaseFixture();

  const result =
    await executeProductionTaxControl(
      fixture.supabase,
      {
        companyId: 1,
        taxControlId: 10,
        asOfDate: '2026-08-14',
      },
      createDependencies(),
    );

  assert.equal(result.controlResultId, 100);
  assert.equal(result.reviewCaseId, 200);
  assert.equal(fixture.calls.length, 1);

  const call = fixture.calls[0];

  assert.equal(
    call.name,
    'persist_workspace_tax_control_evaluation',
  );
  assert.equal(
    call.args.p_status,
    'unknown',
  );
  assert.equal(
    call.args.p_review_title,
    'TI_TAX_001: 法人税確定申告の提出時期確認',
  );
  assert.equal(
    call.args.p_review_issue_summary,
    '確認情報が不足しています。',
  );
  assert.deepEqual(
    call.args.p_source_version_snapshot,
    runtimeSnapshot(),
  );
});

test('PASS評価ではReviewCase payloadを送らない', async () => {
  const fixture = createSupabaseFixture({
    reviewCaseId: null,
  });

  const dependencies = createDependencies({
    evaluateProductionTaxControl() {
      return evaluation({
        status: 'pass',
        reasonCode: 'test_pass',
        reasonSummary: '確認済みです。',
      });
    },
  });

  const result =
    await executeProductionTaxControl(
      fixture.supabase,
      {
        companyId: 1,
        taxControlId: 10,
        asOfDate: '2026-08-14',
      },
      dependencies,
    );

  assert.equal(result.reviewCaseId, null);

  assert.equal(
    fixture.calls[0].args.p_review_title,
    null,
  );
  assert.equal(
    fixture.calls[0].args
      .p_review_issue_summary,
    null,
  );
});

test('対象外評価ではstatus=nullかつReviewCaseなしで保存する', async () => {
  const fixture = createSupabaseFixture({
    reviewCaseId: null,
  });

  const dependencies = createDependencies({
    evaluateProductionTaxControl() {
      return evaluation({
        applicable: false,
        status: null,
        reasonCode: 'not_applicable',
        reasonSummary: '対象外です。',
      });
    },
  });

  await executeProductionTaxControl(
    fixture.supabase,
    {
      companyId: 1,
      taxControlId: 10,
      asOfDate: '2026-08-14',
    },
    dependencies,
  );

  assert.equal(
    fixture.calls[0].args.p_applicable,
    false,
  );
  assert.equal(
    fixture.calls[0].args.p_status,
    null,
  );
  assert.equal(
    fixture.calls[0].args.p_review_title,
    null,
  );
});

test('Workspace companyが存在しなければ評価も保存もしない', async () => {
  const fixture = createSupabaseFixture();

  const dependencies = createDependencies({
    async loadWorkspaceCompany() {
      return null;
    },
  });

  await assert.rejects(
    () =>
      executeProductionTaxControl(
        fixture.supabase,
        {
          companyId: 999,
          taxControlId: 10,
          asOfDate: '2026-08-14',
        },
        dependencies,
      ),
    /Workspace company 999 が存在しません/,
  );

  assert.equal(fixture.calls.length, 0);
});

test('RPC保存失敗は呼び出し元へ伝播する', async () => {
  const fixture = createSupabaseFixture({
    rpcError: 'rpc failed',
  });

  await assert.rejects(
    () =>
      executeProductionTaxControl(
        fixture.supabase,
        {
          companyId: 1,
          taxControlId: 10,
          asOfDate: '2026-08-14',
        },
        createDependencies(),
      ),
    /ControlResult \/ ReviewCaseの保存に失敗しました: rpc failed/,
  );
});

test('UNKNOWN評価なのにReviewCase IDが返らなければ拒否する', async () => {
  const fixture = createSupabaseFixture({
    reviewCaseId: null,
  });

  await assert.rejects(
    () =>
      executeProductionTaxControl(
        fixture.supabase,
        {
          companyId: 1,
          taxControlId: 10,
          asOfDate: '2026-08-14',
        },
        createDependencies(),
      ),
    /ReviewCase IDが返されませんでした/,
  );
});
