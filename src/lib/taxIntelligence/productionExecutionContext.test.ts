import test from 'node:test';
import assert from 'node:assert/strict';

import {
  loadProductionTaxControlRuntime,
} from './productionExecutionContext.ts';
import {
  PRODUCTION_CONTROL_EVALUATOR_KEYS,
} from './productionEvaluators.ts';

type Row = Record<string, unknown>;

type FixtureTables = {
  tax_controls?: Row[];
  tax_control_rules?: Row[];
  tax_rules?: Row[];
  tax_rule_source_versions?: Row[];
  tax_source_versions?: Row[];
  tax_sources?: Row[];
};

function createSupabaseFixture(
  tables: FixtureTables,
): Parameters<
  typeof loadProductionTaxControlRuntime
>[0] {
  const fixture = {
    from(tableName: keyof FixtureTables) {
      const rows = tables[tableName] ?? [];

      return {
        select() {
          return {
            eq(column: string, value: unknown) {
              const matches = rows.filter(
                (row) => row[column] === value,
              );

              return {
                async maybeSingle() {
                  return {
                    data: matches[0] ?? null,
                    error: null,
                  };
                },
              };
            },

            async in(
              column: string,
              values: unknown[],
            ) {
              return {
                data: rows.filter((row) =>
                  values.includes(row[column]),
                ),
                error: null,
              };
            },
          };
        },
      };
    },
  };

  return fixture as unknown as Parameters<
    typeof loadProductionTaxControlRuntime
  >[0];
}

function validTables(): FixtureTables {
  return {
    tax_controls: [
      {
        id: 10,
        control_code: 'TI_TAX_001',
        title: '法人税確定申告の提出時期確認',
        control_kind: 'tax_rule',
        status: 'approved',
        is_enabled: true,
        evaluator_key:
          PRODUCTION_CONTROL_EVALUATOR_KEYS.TI_TAX_001,
      },
    ],
    tax_control_rules: [
      {
        tax_control_id: 10,
        tax_rule_id: 20,
      },
    ],
    tax_rules: [
      {
        id: 20,
        status: 'approved',
      },
    ],
    tax_rule_source_versions: [
      {
        tax_rule_id: 20,
        tax_source_version_id: 30,
      },
      {
        tax_rule_id: 20,
        tax_source_version_id: 31,
      },
    ],
    tax_source_versions: [
      {
        id: 30,
        tax_source_id: 40,
        version_label: 'v2',
        content_hash: 'hash-egov',
      },
      {
        id: 31,
        tax_source_id: 41,
        version_label: 'v1',
        content_hash: 'hash-nta',
      },
    ],
    tax_sources: [
      {
        id: 40,
        provider: 'e_gov',
        canonical_locator: 'egov:test',
      },
      {
        id: 41,
        provider: 'nta',
        canonical_locator: 'https://example.test/nta',
      },
    ],
  };
}

test('approved+enabled Controlからexact SourceVersion snapshotを構築する', async () => {
  const runtime =
    await loadProductionTaxControlRuntime(
      createSupabaseFixture(validTables()),
      10,
    );

  assert.equal(runtime.taxControlId, 10);
  assert.equal(runtime.controlCode, 'TI_TAX_001');
  assert.equal(
    runtime.controlTitle,
    '法人税確定申告の提出時期確認',
  );
  assert.equal(
    runtime.evaluatorKey,
    PRODUCTION_CONTROL_EVALUATOR_KEYS.TI_TAX_001,
  );

  assert.deepEqual(
    runtime.executionContext.sourceVersionSnapshot,
    [
      {
        provider: 'e_gov',
        canonicalLocator: 'egov:test',
        versionLabel: 'v2',
        contentHash: 'hash-egov',
      },
      {
        provider: 'nta',
        canonicalLocator:
          'https://example.test/nta',
        versionLabel: 'v1',
        contentHash: 'hash-nta',
      },
    ],
  );
});

test('draft Controlは実行対象にしない', async () => {
  const tables = validTables();

  tables.tax_controls = [
    {
      ...tables.tax_controls![0],
      status: 'draft',
    },
  ];

  await assert.rejects(
    () =>
      loadProductionTaxControlRuntime(
        createSupabaseFixture(tables),
        10,
      ),
    /approvedではありません/,
  );
});

test('disabled Controlは実行対象にしない', async () => {
  const tables = validTables();

  tables.tax_controls = [
    {
      ...tables.tax_controls![0],
      is_enabled: false,
    },
  ];

  await assert.rejects(
    () =>
      loadProductionTaxControlRuntime(
        createSupabaseFixture(tables),
        10,
      ),
    /無効です/,
  );
});

test('approvedでないRuleがリンクされていれば実行を拒否する', async () => {
  const tables = validTables();

  tables.tax_rules = [
    {
      id: 20,
      status: 'draft',
    },
  ];

  await assert.rejects(
    () =>
      loadProductionTaxControlRuntime(
        createSupabaseFixture(tables),
        10,
      ),
    /approvedでないTaxRule/,
  );
});

test('approved RuleにSourceVersionがなければ実行を拒否する', async () => {
  const tables = validTables();

  tables.tax_rule_source_versions = [];

  await assert.rejects(
    () =>
      loadProductionTaxControlRuntime(
        createSupabaseFixture(tables),
        10,
      ),
    /SourceVersionがありません/,
  );
});

test('同じSourceVersionが複数Ruleから参照されてもsnapshotは重複しない', async () => {
  const tables = validTables();

  tables.tax_control_rules = [
    {
      tax_control_id: 10,
      tax_rule_id: 20,
    },
    {
      tax_control_id: 10,
      tax_rule_id: 21,
    },
  ];

  tables.tax_rules = [
    {
      id: 20,
      status: 'approved',
    },
    {
      id: 21,
      status: 'approved',
    },
  ];

  tables.tax_rule_source_versions = [
    {
      tax_rule_id: 20,
      tax_source_version_id: 30,
    },
    {
      tax_rule_id: 21,
      tax_source_version_id: 30,
    },
  ];

  tables.tax_source_versions = [
    {
      id: 30,
      tax_source_id: 40,
      version_label: 'v2',
      content_hash: 'hash-egov',
    },
  ];

  tables.tax_sources = [
    {
      id: 40,
      provider: 'e_gov',
      canonical_locator: 'egov:test',
    },
  ];

  const runtime =
    await loadProductionTaxControlRuntime(
      createSupabaseFixture(tables),
      10,
    );

  assert.equal(
    runtime.executionContext
      .sourceVersionSnapshot.length,
    1,
  );
});

test('Production registryに存在しないevaluator_keyは実行を拒否する', async () => {
  const tables = validTables();

  tables.tax_controls = [
    {
      ...tables.tax_controls![0],
      evaluator_key: 'evaluator/not-registered',
    },
  ];

  await assert.rejects(
    () =>
      loadProductionTaxControlRuntime(
        createSupabaseFixture(tables),
        10,
      ),
    /Production registryに存在しません/,
  );
});
