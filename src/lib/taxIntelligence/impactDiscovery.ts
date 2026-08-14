import type { SupabaseClient } from '../supabase';

type TaxSourceVersionRow = {
  id: number;
  tax_source_id: number;
  supersedes_version_id: number | null;
};

type TaxRuleSourceVersionRow = {
  tax_rule_id: number;
  tax_source_version_id: number;
};

type TaxRuleRow = {
  id: number;
  rule_code: string;
  version_no: number;
  status: 'draft' | 'approved' | 'retired';
};

type TaxControlRuleRow = {
  tax_control_id: number;
  tax_rule_id: number;
};

type TaxControlRow = {
  id: number;
  control_code: string;
  version_no: number;
  status: 'draft' | 'approved' | 'retired';
  is_enabled: boolean;
  evaluator_key: string;
};

export type TaxRuleImpactCandidate = {
  id: number;
  ruleCode: string;
  versionNo: number;
  status: TaxRuleRow['status'];
};

export type TaxControlImpactCandidate = {
  id: number;
  controlCode: string;
  versionNo: number;
  status: TaxControlRow['status'];
  isEnabled: boolean;
  evaluatorKey: string;
  impactedRuleIds: number[];
};

export type TaxSourceVersionImpact = {
  sourceVersionId: number;
  supersedesSourceVersionId: number | null;
  ruleCandidates: TaxRuleImpactCandidate[];
  controlCandidates: TaxControlImpactCandidate[];
};

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values)];
}

async function loadTaxSourceVersionRow(
  supabase: SupabaseClient,
  sourceVersionId: number,
): Promise<TaxSourceVersionRow | null> {
  const { data, error } = await supabase
    .from('tax_source_versions')
    .select('id, tax_source_id, supersedes_version_id')
    .eq('id', sourceVersionId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `TaxSourceVersionの取得に失敗しました: ${error.message}`,
    );
  }

  return (data as TaxSourceVersionRow | null) ?? null;
}

function emptyImpact(
  sourceVersionId: number,
  supersedesSourceVersionId: number | null,
): TaxSourceVersionImpact {
  return {
    sourceVersionId,
    supersedesSourceVersionId,
    ruleCandidates: [],
    controlCandidates: [],
  };
}

export async function discoverTaxSourceVersionImpact(
  supabase: SupabaseClient,
  sourceVersionId: number,
): Promise<TaxSourceVersionImpact> {
  const { data: sourceVersionData, error: sourceVersionError } =
    await supabase
      .from('tax_source_versions')
      .select('id, tax_source_id, supersedes_version_id')
      .eq('id', sourceVersionId)
      .maybeSingle();

  if (sourceVersionError) {
    throw new Error(
      `TaxSourceVersionの取得に失敗しました: ${sourceVersionError.message}`,
    );
  }

  const sourceVersion =
    (sourceVersionData as TaxSourceVersionRow | null) ?? null;

  if (!sourceVersion) {
    throw new Error(
      `TaxSourceVersion ${sourceVersionId} が存在しません。`,
    );
  }

  if (sourceVersion.supersedes_version_id === null) {
    return emptyImpact(sourceVersion.id, null);
  }

  const immediatePredecessorId =
    sourceVersion.supersedes_version_id;

  const ancestorSourceVersionIds: number[] = [];
  const visitedVersionIds = new Set<number>([
    sourceVersion.id,
  ]);

  let ancestorVersionId: number | null =
    immediatePredecessorId;

  while (ancestorVersionId !== null) {
    if (visitedVersionIds.has(ancestorVersionId)) {
      throw new Error(
        `TaxSourceVersion ${sourceVersion.id} のsupersedes chainに循環があります。`,
      );
    }

    visitedVersionIds.add(ancestorVersionId);

    const ancestor = await loadTaxSourceVersionRow(
      supabase,
      ancestorVersionId,
    );

    if (!ancestor) {
      throw new Error(
        `supersedes先TaxSourceVersion ${ancestorVersionId} が存在しません。`,
      );
    }

    if (ancestor.tax_source_id !== sourceVersion.tax_source_id) {
      throw new Error(
        `TaxSourceVersion ${sourceVersion.id} と supersedes先 ${ancestor.id} のTaxSourceが一致しません。`,
      );
    }

    ancestorSourceVersionIds.push(ancestor.id);
    ancestorVersionId = ancestor.supersedes_version_id;
  }

  const { data: ruleLinkData, error: ruleLinkError } =
    await supabase
      .from('tax_rule_source_versions')
      .select('tax_rule_id, tax_source_version_id')
      .in(
        'tax_source_version_id',
        ancestorSourceVersionIds,
      );

  if (ruleLinkError) {
    throw new Error(
      `影響TaxRuleリンクの取得に失敗しました: ${ruleLinkError.message}`,
    );
  }

  const ruleLinks =
    (ruleLinkData as TaxRuleSourceVersionRow[] | null) ?? [];

  const ruleIds = uniqueNumbers(
    ruleLinks.map((row) => row.tax_rule_id),
  );

  if (ruleIds.length === 0) {
    return emptyImpact(
      sourceVersion.id,
      immediatePredecessorId,
    );
  }

  const { data: ruleData, error: ruleError } =
    await supabase
      .from('tax_rules')
      .select('id, rule_code, version_no, status')
      .in('id', ruleIds);

  if (ruleError) {
    throw new Error(
      `影響TaxRuleの取得に失敗しました: ${ruleError.message}`,
    );
  }

  const rules = (ruleData as TaxRuleRow[] | null) ?? [];

  const { data: controlLinkData, error: controlLinkError } =
    await supabase
      .from('tax_control_rules')
      .select('tax_control_id, tax_rule_id')
      .in('tax_rule_id', ruleIds);

  if (controlLinkError) {
    throw new Error(
      `影響TaxControlリンクの取得に失敗しました: ${controlLinkError.message}`,
    );
  }

  const controlLinks =
    (controlLinkData as TaxControlRuleRow[] | null) ?? [];

  const controlIds = uniqueNumbers(
    controlLinks.map((row) => row.tax_control_id),
  );

  let controls: TaxControlRow[] = [];

  if (controlIds.length > 0) {
    const { data: controlData, error: controlError } =
      await supabase
        .from('tax_controls')
        .select(
          'id, control_code, version_no, status, is_enabled, evaluator_key',
        )
        .in('id', controlIds);

    if (controlError) {
      throw new Error(
        `影響TaxControlの取得に失敗しました: ${controlError.message}`,
      );
    }

    controls = (controlData as TaxControlRow[] | null) ?? [];
  }

  const ruleCandidates = rules
    .map(
      (rule): TaxRuleImpactCandidate => ({
        id: rule.id,
        ruleCode: rule.rule_code,
        versionNo: rule.version_no,
        status: rule.status,
      }),
    )
    .sort(
      (a, b) =>
        a.ruleCode.localeCompare(b.ruleCode) ||
        a.versionNo - b.versionNo,
    );

  const controlCandidates = controls
    .map(
      (control): TaxControlImpactCandidate => ({
        id: control.id,
        controlCode: control.control_code,
        versionNo: control.version_no,
        status: control.status,
        isEnabled: control.is_enabled,
        evaluatorKey: control.evaluator_key,
        impactedRuleIds: uniqueNumbers(
          controlLinks
            .filter(
              (link) =>
                link.tax_control_id === control.id,
            )
            .map((link) => link.tax_rule_id),
        ).sort((a, b) => a - b),
      }),
    )
    .sort(
      (a, b) =>
        a.controlCode.localeCompare(b.controlCode) ||
        a.versionNo - b.versionNo,
    );

  return {
    sourceVersionId: sourceVersion.id,
    supersedesSourceVersionId: immediatePredecessorId,
    ruleCandidates,
    controlCandidates,
  };
}
