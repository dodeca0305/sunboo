import test from 'node:test';
import assert from 'node:assert/strict';

import type { SupabaseClient } from '../supabase';
import type { CompanyProfile } from '../companyProfile.ts';
import type { TaxReturnProfile } from '../taxReturnProfile.ts';

import {
  discoverTaxSourceVersionImpact,
} from './impactDiscovery.ts';

import {
  executeProductionTaxControl,
  type ProductionTaxControlExecutorDependencies,
} from './productionExecution.ts';

import {
  loadProductionTaxControlRuntime,
} from './productionExecutionContext.ts';

import {
  evaluateProductionTaxControl,
  PRODUCTION_CONTROL_EVALUATOR_KEYS,
} from './productionEvaluators.ts';

type Row = Record<string, unknown>;

type QueryResult = {
  data: Row[];
  error: null;
};

type MaybeSingleResult = {
  data: Row | null;
  error: null;
};

class FakeQuery {
  private readonly rows: Row[];
  private readonly filters: Array<
    (row: Row) => boolean
  > = [];

  constructor(rows: Row[]) {
    this.rows = rows;
  }

  select(): this {
    return this;
  }

  eq(
    column: string,
    value: unknown,
  ): this {
    this.filters.push(
      (row) => row[column] === value,
    );

    return this;
  }

  in(
    column: string,
    values: unknown[],
  ): this {
    const allowed = new Set(values);

    this.filters.push(
      (row) => allowed.has(row[column]),
    );

    return this;
  }

  private filteredRows(): Row[] {
    return this.rows.filter(
      (row) =>
        this.filters.every(
          (filter) => filter(row),
        ),
    );
  }

  async maybeSingle():
    Promise<MaybeSingleResult> {
    const rows = this.filteredRows();

    return {
      data: rows[0] ?? null,
      error: null,
    };
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?:
      | ((
          value: QueryResult,
        ) =>
          | TResult1
          | PromiseLike<TResult1>)
      | null,
    onrejected?:
      | ((
          reason: unknown,
        ) =>
          | TResult2
          | PromiseLike<TResult2>)
      | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve({
      data: this.filteredRows(),
      error: null,
    }).then(
      onfulfilled,
      onrejected,
    );
  }
}

test(
  'SourceVersion変更候補から承認済み後継Controlを再評価しexact provenanceを保存境界へ渡す',
  async () => {
    const evaluatorKey =
      PRODUCTION_CONTROL_EVALUATOR_KEYS
        .TI_TAX_001;

    /*
     * Version 2 がVersion 1をsupersede。
     *
     * Rule 10 / Control 20:
     *   旧Version 1に紐づく旧系統。
     *   Impact Discoveryで影響候補になる。
     *
     * Rule 11 / Control 21:
     *   専門家レビュー後に承認された後継系統。
     *   新Version 2をexact provenanceとして実行する。
     */
    const tables:
      Record<string, Row[]> = {
      tax_sources: [
        {
          id: 1,
          provider: 'e_gov',
          canonical_locator:
            'egov:test:corporate-tax',
        },
      ],

      tax_source_versions: [
        {
          id: 1,
          tax_source_id: 1,
          supersedes_version_id: null,
          version_label: 'old-v1',
          content_hash: 'old-hash',
        },
        {
          id: 2,
          tax_source_id: 1,
          supersedes_version_id: 1,
          version_label: 'new-v2',
          content_hash: 'new-hash',
        },
      ],

      tax_rules: [
        {
          id: 10,
          rule_code:
            'TI_RULE_CORP_FINAL_RETURN_DEADLINE',
          version_no: 1,
          status: 'retired',
        },
        {
          id: 11,
          rule_code:
            'TI_RULE_CORP_FINAL_RETURN_DEADLINE',
          version_no: 2,
          status: 'approved',
        },
      ],

      tax_rule_source_versions: [
        {
          tax_rule_id: 10,
          tax_source_version_id: 1,
        },
        {
          tax_rule_id: 11,
          tax_source_version_id: 2,
        },
      ],

      tax_controls: [
        {
          id: 20,
          control_code: 'TI_TAX_001',
          version_no: 1,
          title:
            '法人税確定申告の提出時期確認',
          control_kind: 'tax_rule',
          status: 'retired',
          is_enabled: false,
          evaluator_key: evaluatorKey,
        },
        {
          id: 21,
          control_code: 'TI_TAX_001',
          version_no: 2,
          title:
            '法人税確定申告の提出時期確認',
          control_kind: 'tax_rule',
          status: 'approved',
          is_enabled: true,
          evaluator_key: evaluatorKey,
        },
      ],

      tax_control_rules: [
        {
          tax_control_id: 20,
          tax_rule_id: 10,
        },
        {
          tax_control_id: 21,
          tax_rule_id: 11,
        },
      ],
    };

    const rpcCalls: Array<{
      name: string;
      args: Record<string, unknown>;
    }> = [];

    const fakeSupabase = {
      from(table: string) {
        return new FakeQuery(
          tables[table] ?? [],
        );
      },

      async rpc(
        name: string,
        args: Record<string, unknown>,
      ) {
        rpcCalls.push({
          name,
          args,
        });

        return {
          data: [
            {
              control_result_id: 100,
              review_case_id: 200,
            },
          ],
          error: null,
        };
      },
    } as unknown as SupabaseClient;

    // 1. 新SourceVersionから旧Rule/Controlへの影響を発見。
    const impact =
      await discoverTaxSourceVersionImpact(
        fakeSupabase,
        2,
      );

    assert.equal(
      impact.sourceVersionId,
      2,
    );

    assert.equal(
      impact.supersedesSourceVersionId,
      1,
    );

    assert.equal(
      impact.controlCandidates.length,
      1,
    );

    assert.equal(
      impact.controlCandidates[0].id,
      20,
    );

    assert.equal(
      impact.controlCandidates[0]
        .controlCode,
      'TI_TAX_001',
    );

    assert.equal(
      impact.controlCandidates[0].status,
      'retired',
    );

    /*
     * Impact Candidate 20をそのまま実行しない。
     *
     * SourceVersion変更のレビュー後に
     * 人間が承認した後継Control 21を明示的に選ぶ。
     */
    const approvedSuccessorControlId = 21;

    const dependencies:
      ProductionTaxControlExecutorDependencies = {
      async loadWorkspaceCompany() {
        return {
          id: 1,
          name: 'E2E株式会社',
          prefecture_code: '13',
          municipality_code: '13101',
          corporate_type: 'kabushiki',
          fiscal_month: 3,
        };
      },

      async loadWorkspaceCompanyProfile() {
        return {} as CompanyProfile;
      },

      async loadWorkspaceTaxReturnProfile() {
        /*
         * Production evaluatorがこのE2Eで使う
         * 最小限の決算実績。
         *
         * corporateTaxFilingContextを渡さないため、
         * 清算特則の該当有無はUNKNOWNになる。
         */
        return {
          entries: [
            {
              id: 'return-1',
              fiscalYearEndDate:
                '2026-03-31',
              filedDate:
                '2026-05-31',
            },
          ],
        } as unknown as TaxReturnProfile;
      },

      loadProductionTaxControlRuntime,

      evaluateProductionTaxControl,
    };

    // 2. 承認済み後継Controlを実際のruntime loader /
    //    Production evaluatorで再評価。
    const executed =
      await executeProductionTaxControl(
        fakeSupabase,
        {
          companyId: 1,
          taxControlId:
            approvedSuccessorControlId,
          asOfDate: '2026-08-15',
        },
        dependencies,
      );

    // 3. 未確認情報をPASSにせずUNKNOWNへ送る。
    assert.equal(
      executed.evaluation.applicable,
      true,
    );

    assert.equal(
      executed.evaluation.status,
      'unknown',
    );

    assert.equal(
      executed.evaluation.reasonCode,
      'liquidation_residual_assets_case_unknown',
    );

    // 4. 実行時provenanceは旧Versionではなく
    //    承認済み後継Ruleが参照する新Version 2。
    assert.deepEqual(
      executed.evaluation
        .sourceVersionSnapshot,
      [
        {
          provider: 'e_gov',
          canonicalLocator:
            'egov:test:corporate-tax',
          versionLabel: 'new-v2',
          contentHash: 'new-hash',
        },
      ],
    );

    // 5. 永続化境界はRPC 1回だけ。
    assert.equal(
      rpcCalls.length,
      1,
    );

    assert.equal(
      rpcCalls[0].name,
      'persist_workspace_tax_control_evaluation',
    );

    assert.equal(
      rpcCalls[0].args.p_tax_control_id,
      21,
    );

    assert.equal(
      rpcCalls[0].args.p_status,
      'unknown',
    );

    assert.deepEqual(
      rpcCalls[0].args
        .p_source_version_snapshot,
      [
        {
          provider: 'e_gov',
          canonicalLocator:
            'egov:test:corporate-tax',
          versionLabel: 'new-v2',
          contentHash: 'new-hash',
        },
      ],
    );

    assert.equal(
      rpcCalls[0].args
        .p_review_issue_summary,
      executed.evaluation.reasonSummary,
    );

    assert.equal(
      executed.controlResultId,
      100,
    );

    assert.equal(
      executed.reviewCaseId,
      200,
    );
  },
);
