import type { SupabaseClient } from "../supabase";
import type {
  ProductionTaxControlExecutionContext,
  TaxSourceVersionSnapshot,
} from "./types";
import {
  PRODUCTION_CONTROL_EVALUATORS,
  type ProductionControlEvaluatorKey,
} from "./productionEvaluators.ts";

type TaxControlRow = {
  id: number;
  control_code: string;
  title: string;
  control_kind: string;
  status: "draft" | "approved" | "retired";
  is_enabled: boolean;
  evaluator_key: string;
};

type TaxControlRuleRow = {
  tax_control_id: number;
  tax_rule_id: number;
};

type TaxRuleRow = {
  id: number;
  status: "draft" | "approved" | "retired";
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

const positive = (v: unknown): v is number =>
  Number.isSafeInteger(v) && Number(v) > 0;
const text = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;
async function readRows<T>(
  client: SupabaseClient,
  table: string,
  columns: string,
  filter: string,
  ids: number[],
  order: string,
  valid: (row: T) => boolean,
  key: (row: T) => string,
): Promise<T[]> {
  const rows: T[] = [],
    seen = new Set<string>();
  // Bounded IN batches also avoid URL limits for many rule/source references.
  for (let start = 0; start < ids.length; start += 100) {
    const chunk = ids.slice(start, start + 100);
    for (let offset = 0; ; ) {
      let q = client.from(table).select(columns).in(filter, chunk);
      for (const column of order.split(",")) q = q.order(column);
      const r = await q.range(offset, offset + 499);
      if (r.error || !Array.isArray(r.data))
        throw Error(`${table}を取得できません。`);
      for (const value of r.data) {
        const row = value as T;
        if (
          !row ||
          typeof row !== "object" ||
          !valid(row) ||
          !chunk.includes(
            (value as unknown as Record<string, number>)[filter],
          ) ||
          seen.has(key(row))
        )
          throw Error(`${table}の内容を確認できません。`);
        seen.add(key(row));
        rows.push(row);
      }
      if (r.data.length === 0) break;
      offset += r.data.length;
    }
  }
  return rows;
}
function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values)];
}

function assertExpectedIds(
  label: string,
  expectedIds: number[],
  actualIds: number[],
): void {
  const actual = new Set(actualIds);
  const missing = expectedIds.filter((id) => !actual.has(id));

  if (missing.length > 0) {
    throw new Error(`${label}を参照できません: ${missing.join(", ")}`);
  }
}

export async function loadProductionTaxControlRuntime(
  supabase: SupabaseClient,
  taxControlId: number,
): Promise<ProductionTaxControlRuntime> {
  const { data: controlData, error: controlError } = await supabase
    .from("tax_controls")
    .select(
      "id, control_code, title, control_kind, status, is_enabled, evaluator_key",
    )
    .eq("id", taxControlId)
    .maybeSingle();

  if (controlError || controlData === undefined) {
    throw new Error(`TaxControlの取得に失敗しました: ${controlError?.message ?? "応答なし"}`);
  }

  const control = (controlData as TaxControlRow | null) ?? null;

  if (!control) {
    throw new Error(`TaxControl ${taxControlId} が存在しません。`);
  }

  if (
    control.id !== taxControlId ||
    !text(control.control_code) ||
    !text(control.title) ||
    !text(control.evaluator_key)
  )
    throw Error("TaxControlの内容を確認できません。");
  if (control.control_kind !== "tax_rule") {
    throw new Error(
      `TaxControl ${taxControlId} はProduction Tax Controlではありません。`,
    );
  }

  if (control.status !== "approved") {
    throw new Error(`TaxControl ${taxControlId} はapprovedではありません。`);
  }

  if (control.is_enabled !== true) {
    throw new Error(`TaxControl ${taxControlId} は無効です。`);
  }

  if (!Object.hasOwn(PRODUCTION_CONTROL_EVALUATORS, control.evaluator_key)) {
    throw new Error(
      `TaxControl ${taxControlId} のevaluator_key ${control.evaluator_key} はProduction registryに存在しません。`,
    );
  }

  const evaluatorKey = control.evaluator_key as ProductionControlEvaluatorKey;

  const controlRuleLinks = await readRows<TaxControlRuleRow>(
    supabase,
    "tax_control_rules",
    "tax_control_id,tax_rule_id",
    "tax_control_id",
    [control.id],
    "tax_control_id,tax_rule_id",
    (r) => positive(r.tax_rule_id),
    (r) => `${r.tax_control_id}:${r.tax_rule_id}`,
  );

  const ruleIds = uniqueNumbers(controlRuleLinks.map((row) => row.tax_rule_id));

  if (ruleIds.length === 0) {
    throw new Error(
      `TaxControl ${taxControlId} にTaxRuleがリンクされていません。`,
    );
  }

  const rules = await readRows<TaxRuleRow>(
    supabase,
    "tax_rules",
    "id,status",
    "id",
    ruleIds,
    "id",
    (r) =>
      positive(r.id) && ["draft", "approved", "retired"].includes(r.status),
    (r) => String(r.id),
  );

  assertExpectedIds(
    "TaxRule",
    ruleIds,
    rules.map((rule) => rule.id),
  );

  const unapprovedRuleIds = rules
    .filter((rule) => rule.status !== "approved")
    .map((rule) => rule.id);

  if (unapprovedRuleIds.length > 0) {
    throw new Error(
      `Production Tax Control ${taxControlId} にapprovedでないTaxRuleが含まれています: ${unapprovedRuleIds.join(", ")}`,
    );
  }

  const ruleSourceVersionLinks = await readRows<TaxRuleSourceVersionRow>(
    supabase,
    "tax_rule_source_versions",
    "tax_rule_id,tax_source_version_id",
    "tax_rule_id",
    ruleIds,
    "tax_rule_id,tax_source_version_id",
    (r) => positive(r.tax_source_version_id),
    (r) => `${r.tax_rule_id}:${r.tax_source_version_id}`,
  );

  const rulesWithSourceVersions = new Set(
    ruleSourceVersionLinks.map((row) => row.tax_rule_id),
  );

  const rulesWithoutSourceVersions = ruleIds.filter(
    (ruleId) => !rulesWithSourceVersions.has(ruleId),
  );

  if (rulesWithoutSourceVersions.length > 0) {
    throw new Error(
      `approved TaxRuleにSourceVersionがありません: ${rulesWithoutSourceVersions.join(", ")}`,
    );
  }

  const sourceVersionIds = uniqueNumbers(
    ruleSourceVersionLinks.map((row) => row.tax_source_version_id),
  );

  const sourceVersions = await readRows<TaxSourceVersionRow>(
    supabase,
    "tax_source_versions",
    "id,tax_source_id,version_label,content_hash",
    "id",
    sourceVersionIds,
    "id",
    (r) =>
      positive(r.id) &&
      positive(r.tax_source_id) &&
      (r.version_label === null || typeof r.version_label === "string") &&
      text(r.content_hash),
    (r) => String(r.id),
  );

  assertExpectedIds(
    "TaxSourceVersion",
    sourceVersionIds,
    sourceVersions.map((sourceVersion) => sourceVersion.id),
  );

  const sourceIds = uniqueNumbers(
    sourceVersions.map((sourceVersion) => sourceVersion.tax_source_id),
  );

  const sources = await readRows<TaxSourceRow>(
    supabase,
    "tax_sources",
    "id,provider,canonical_locator",
    "id",
    sourceIds,
    "id",
    (r) => positive(r.id) && text(r.provider) && text(r.canonical_locator),
    (r) => String(r.id),
  );

  assertExpectedIds(
    "TaxSource",
    sourceIds,
    sources.map((source) => source.id),
  );

  const sourceById = new Map(sources.map((source) => [source.id, source]));

  const sourceVersionSnapshot = sourceVersions
    .map((sourceVersion): TaxSourceVersionSnapshot => {
      const source = sourceById.get(sourceVersion.tax_source_id);

      if (!source) {
        throw new Error(
          `TaxSource ${sourceVersion.tax_source_id} を参照できません。`,
        );
      }

      return {
        provider: source.provider,
        canonicalLocator: source.canonical_locator,
        versionLabel: sourceVersion.version_label,
        contentHash: sourceVersion.content_hash,
      };
    })
    .sort(
      (a, b) =>
        a.provider.localeCompare(b.provider) ||
        a.canonicalLocator.localeCompare(b.canonicalLocator) ||
        (a.versionLabel ?? "").localeCompare(b.versionLabel ?? "") ||
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
