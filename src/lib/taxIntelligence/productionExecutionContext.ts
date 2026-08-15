import type { SupabaseClient } from '../supabase';
import type {
  ProductionTaxControlExecutionContext,
  TaxSourceVersionSnapshot,
} from './types';
import {
  PRODUCTION_CONTROL_EVALUATORS,
  type ProductionControlEvaluatorKey,
} from './productionEvaluators.ts';

type TaxControlRow = {
  id: number;
  control_code: string;
  title: string;
  control_kind: string;
  status: 'draft' | 'approved' | 'retired';
  is_enabled: boolean;
  evaluator_key: string;
};

type TaxControlRuleRow = {
  tax_control_id: number;
  tax_rule_id: number;
};

type TaxRuleRow = {
  id: number;
  status: 'draft' | 'approved' | 'retired';
};

type TaxRuleSourceVersionRow = {
  tax_rule_id: number;
  tax_source_version_id: number;
};

type TaxSourceVersionRow = {
  id: number;
  tax_source_id: number;
  version_label: string | null;
  content_hash: string;
};

type TaxSourceRow = {
  id: number;
  provider: string;
  canonical_locator: string;
};

export type ProductionTaxControlRuntime = {
  taxControlId: number;
  controlCode: string;
  controlTitle: string;
  evaluatorKey: ProductionControlEvaluatorKey;
  executionContext: ProductionTaxControlExecutionContext;
};

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values)];
}

function assertExpectedIds(
  label: string,
  expectedIds: number[],
  actualIds: number[],
): void {
  const actual = new Set(actualIds);
  const missing = expectedIds.filter(
    (id) => !actual.has(id),
  );

  if (missing.length > 0) {
    throw new Error(
      `${label}を参照できません: ${missing.join(', ')}`,
    );
  }
}

export async function loadProductionTaxControlRuntime(
  supabase: SupabaseClient,
  taxControlId: number,
): Promise<ProductionTaxControlRuntime> {
  const { data: controlData, error: controlError } =
    await supabase
      .from('tax_controls')
      .select(
        'id, control_code, title, control_kind, status, is_enabled, evaluator_key',
      )
      .eq('id', taxControlId)
      .maybeSingle();

  if (controlError) {
    throw new Error(
      `TaxControlの取得に失敗しました: ${controlError.message}`,
    );
  }

  const control =
    (controlData as TaxControlRow | null) ?? null;

  if (!control) {
    throw new Error(
      `TaxControl ${taxControlId} が存在しません。`,
    );
  }

  if (control.control_kind !== 'tax_rule') {
    throw new Error(
      `TaxControl ${taxControlId} はProduction Tax Controlではありません。`,
    );
  }

  if (control.status !== 'approved') {
    throw new Error(
      `TaxControl ${taxControlId} はapprovedではありません。`,
    );
  }

  if (!control.is_enabled) {
    throw new Error(
      `TaxControl ${taxControlId} は無効です。`,
    );
  }

  if (
    !Object.hasOwn(
      PRODUCTION_CONTROL_EVALUATORS,
      control.evaluator_key,
    )
  ) {
    throw new Error(
      `TaxControl ${taxControlId} のevaluator_key ${control.evaluator_key} はProduction registryに存在しません。`,
    );
  }

  const evaluatorKey =
    control.evaluator_key as ProductionControlEvaluatorKey;

  const { data: controlRuleData, error: controlRuleError } =
    await supabase
      .from('tax_control_rules')
      .select('tax_control_id, tax_rule_id')
      .in('tax_control_id', [control.id]);

  if (controlRuleError) {
    throw new Error(
      `TaxControlのRuleリンク取得に失敗しました: ${controlRuleError.message}`,
    );
  }

  const controlRuleLinks =
    (controlRuleData as TaxControlRuleRow[] | null) ?? [];

  const ruleIds = uniqueNumbers(
    controlRuleLinks.map((row) => row.tax_rule_id),
  );

  if (ruleIds.length === 0) {
    throw new Error(
      `TaxControl ${taxControlId} にTaxRuleがリンクされていません。`,
    );
  }

  const { data: ruleData, error: ruleError } =
    await supabase
      .from('tax_rules')
      .select('id, status')
      .in('id', ruleIds);

  if (ruleError) {
    throw new Error(
      `TaxRuleの取得に失敗しました: ${ruleError.message}`,
    );
  }

  const rules = (ruleData as TaxRuleRow[] | null) ?? [];

  assertExpectedIds(
    'TaxRule',
    ruleIds,
    rules.map((rule) => rule.id),
  );

  const unapprovedRuleIds = rules
    .filter((rule) => rule.status !== 'approved')
    .map((rule) => rule.id);

  if (unapprovedRuleIds.length > 0) {
    throw new Error(
      `Production Tax Control ${taxControlId} にapprovedでないTaxRuleが含まれています: ${unapprovedRuleIds.join(', ')}`,
    );
  }

  const {
    data: ruleSourceVersionData,
    error: ruleSourceVersionError,
  } = await supabase
    .from('tax_rule_source_versions')
    .select('tax_rule_id, tax_source_version_id')
    .in('tax_rule_id', ruleIds);

  if (ruleSourceVersionError) {
    throw new Error(
      `TaxRuleのSourceVersionリンク取得に失敗しました: ${ruleSourceVersionError.message}`,
    );
  }

  const ruleSourceVersionLinks =
    (ruleSourceVersionData as
      | TaxRuleSourceVersionRow[]
      | null) ?? [];

  const rulesWithSourceVersions = new Set(
    ruleSourceVersionLinks.map(
      (row) => row.tax_rule_id,
    ),
  );

  const rulesWithoutSourceVersions = ruleIds.filter(
    (ruleId) => !rulesWithSourceVersions.has(ruleId),
  );

  if (rulesWithoutSourceVersions.length > 0) {
    throw new Error(
      `approved TaxRuleにSourceVersionがありません: ${rulesWithoutSourceVersions.join(', ')}`,
    );
  }

  const sourceVersionIds = uniqueNumbers(
    ruleSourceVersionLinks.map(
      (row) => row.tax_source_version_id,
    ),
  );

  const {
    data: sourceVersionData,
    error: sourceVersionError,
  } = await supabase
    .from('tax_source_versions')
    .select(
      'id, tax_source_id, version_label, content_hash',
    )
    .in('id', sourceVersionIds);

  if (sourceVersionError) {
    throw new Error(
      `TaxSourceVersionの取得に失敗しました: ${sourceVersionError.message}`,
    );
  }

  const sourceVersions =
    (sourceVersionData as TaxSourceVersionRow[] | null) ??
    [];

  assertExpectedIds(
    'TaxSourceVersion',
    sourceVersionIds,
    sourceVersions.map(
      (sourceVersion) => sourceVersion.id,
    ),
  );

  const sourceIds = uniqueNumbers(
    sourceVersions.map(
      (sourceVersion) => sourceVersion.tax_source_id,
    ),
  );

  const { data: sourceData, error: sourceError } =
    await supabase
      .from('tax_sources')
      .select('id, provider, canonical_locator')
      .in('id', sourceIds);

  if (sourceError) {
    throw new Error(
      `TaxSourceの取得に失敗しました: ${sourceError.message}`,
    );
  }

  const sources =
    (sourceData as TaxSourceRow[] | null) ?? [];

  assertExpectedIds(
    'TaxSource',
    sourceIds,
    sources.map((source) => source.id),
  );

  const sourceById = new Map(
    sources.map((source) => [source.id, source]),
  );

  const sourceVersionSnapshot =
    sourceVersions
      .map(
        (
          sourceVersion,
        ): TaxSourceVersionSnapshot => {
          const source = sourceById.get(
            sourceVersion.tax_source_id,
          );

          if (!source) {
            throw new Error(
              `TaxSource ${sourceVersion.tax_source_id} を参照できません。`,
            );
          }

          return {
            provider: source.provider,
            canonicalLocator:
              source.canonical_locator,
            versionLabel:
              sourceVersion.version_label,
            contentHash:
              sourceVersion.content_hash,
          };
        },
      )
      .sort(
        (a, b) =>
          a.provider.localeCompare(b.provider) ||
          a.canonicalLocator.localeCompare(
            b.canonicalLocator,
          ) ||
          (a.versionLabel ?? '').localeCompare(
            b.versionLabel ?? '',
          ) ||
          a.contentHash.localeCompare(b.contentHash),
      );

  if (sourceVersionSnapshot.length === 0) {
    throw new Error(
      `Production Tax Control ${taxControlId} のSourceVersion snapshotが空です。`,
    );
  }

  return {
    taxControlId: control.id,
    controlCode: control.control_code,
    controlTitle: control.title,
    evaluatorKey,
    executionContext: {
      sourceVersionSnapshot,
    },
  };
}
