import test from 'node:test';
import assert from 'node:assert/strict';

import { discoverTaxSourceVersionImpact } from './impactDiscovery.ts';

type Row = Record<string, unknown>;

type FixtureTables = {
  tax_source_versions?: Row[];
  tax_rule_source_versions?: Row[];
  tax_rules?: Row[];
  tax_control_rules?: Row[];
  tax_controls?: Row[];
};

function createSupabaseFixture(
  tables: FixtureTables,
): Parameters<typeof discoverTaxSourceVersionImpact>[0] {
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

            async in(column: string, values: unknown[]) {
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
    typeof discoverTaxSourceVersionImpact
  >[0];
}

test('初回SourceVersionは影響候補なし', async () => {
  const supabase = createSupabaseFixture({
    tax_source_versions: [
      {
        id: 1,
        tax_source_id: 10,
        supersedes_version_id: null,
      },
    ],
  });

  const impact =
    await discoverTaxSourceVersionImpact(
      supabase,
      1,
    );

  assert.deepEqual(impact, {
    sourceVersionId: 1,
    supersedesSourceVersionId: null,
    ruleCandidates: [],
    controlCandidates: [],
  });
});

test('直前SourceVersionに紐づくRuleとControlを影響候補として返す', async () => {
  const supabase = createSupabaseFixture({
    tax_source_versions: [
      {
        id: 1,
        tax_source_id: 10,
        supersedes_version_id: null,
      },
      {
        id: 2,
        tax_source_id: 10,
        supersedes_version_id: 1,
      },
    ],
    tax_rule_source_versions: [
      {
        tax_rule_id: 100,
        tax_source_version_id: 1,
      },
    ],
    tax_rules: [
      {
        id: 100,
        rule_code: 'RULE_A',
        version_no: 1,
        status: 'approved',
      },
    ],
    tax_control_rules: [
      {
        tax_control_id: 200,
        tax_rule_id: 100,
      },
    ],
    tax_controls: [
      {
        id: 200,
        control_code: 'CONTROL_A',
        version_no: 1,
        status: 'approved',
        is_enabled: true,
        evaluator_key: 'evaluator/a',
      },
    ],
  });

  const impact =
    await discoverTaxSourceVersionImpact(
      supabase,
      2,
    );

  assert.deepEqual(impact, {
    sourceVersionId: 2,
    supersedesSourceVersionId: 1,
    ruleCandidates: [
      {
        id: 100,
        ruleCode: 'RULE_A',
        versionNo: 1,
        status: 'approved',
      },
    ],
    controlCandidates: [
      {
        id: 200,
        controlCode: 'CONTROL_A',
        versionNo: 1,
        status: 'approved',
        isEnabled: true,
        evaluatorKey: 'evaluator/a',
        impactedRuleIds: [100],
      },
    ],
  });
});

test('中間VersionにRule linkがなくても祖先VersionのRuleを発見する', async () => {
  const supabase = createSupabaseFixture({
    tax_source_versions: [
      {
        id: 1,
        tax_source_id: 10,
        supersedes_version_id: null,
      },
      {
        id: 2,
        tax_source_id: 10,
        supersedes_version_id: 1,
      },
      {
        id: 3,
        tax_source_id: 10,
        supersedes_version_id: 2,
      },
    ],
    tax_rule_source_versions: [
      {
        tax_rule_id: 100,
        tax_source_version_id: 1,
      },
    ],
    tax_rules: [
      {
        id: 100,
        rule_code: 'RULE_A',
        version_no: 1,
        status: 'approved',
      },
    ],
    tax_control_rules: [
      {
        tax_control_id: 200,
        tax_rule_id: 100,
      },
    ],
    tax_controls: [
      {
        id: 200,
        control_code: 'CONTROL_A',
        version_no: 1,
        status: 'draft',
        is_enabled: false,
        evaluator_key: 'evaluator/a',
      },
    ],
  });

  const impact =
    await discoverTaxSourceVersionImpact(
      supabase,
      3,
    );

  assert.equal(
    impact.supersedesSourceVersionId,
    2,
  );

  assert.deepEqual(
    impact.ruleCandidates.map((rule) => rule.id),
    [100],
  );

  assert.deepEqual(
    impact.controlCandidates.map(
      (control) => control.id,
    ),
    [200],
  );
});

test('別TaxSourceを指すsupersedes chainは拒否する', async () => {
  const supabase = createSupabaseFixture({
    tax_source_versions: [
      {
        id: 1,
        tax_source_id: 99,
        supersedes_version_id: null,
      },
      {
        id: 2,
        tax_source_id: 10,
        supersedes_version_id: 1,
      },
    ],
  });

  await assert.rejects(
    () =>
      discoverTaxSourceVersionImpact(
        supabase,
        2,
      ),
    /TaxSourceが一致しません/,
  );
});

test('supersedes chainの循環を拒否する', async () => {
  const supabase = createSupabaseFixture({
    tax_source_versions: [
      {
        id: 1,
        tax_source_id: 10,
        supersedes_version_id: 2,
      },
      {
        id: 2,
        tax_source_id: 10,
        supersedes_version_id: 1,
      },
    ],
  });

  await assert.rejects(
    () =>
      discoverTaxSourceVersionImpact(
        supabase,
        2,
      ),
    /supersedes chainに循環があります/,
  );
});
