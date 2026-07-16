import type {
  CandidateMatch,
  CompanyLocation,
  ProcedureSubmissionRule,
  ResolveCandidateData,
  ResolveCandidateInput,
  RuleConditionRow,
  SubmissionJurisdiction,
  SubmissionRuleContext,
} from './types';

// ── 判定関数（Phase2: 福岡県パイロット）─────────────────────────────
// 会社所在地・procedure_submission_rules・submission_jurisdictions から「どの窓口候補が
// 該当するか」を決定する純粋関数群。Supabaseクライアントに一切依存しない（dataAccess.tsが
// 事前に取得した行を渡す）ため、DBを起動せずにユニットテストできる
// （既存 resolveOffices / buildRoadmapSubmissionInfo と同じ「プレーンなデータを返す純粋関数」の設計思想）。
//
// 最終的な ResolutionStatus への変換は行わない（stateModel.ts の責務）。このファイルは
// 「どの手続きルールが適用され、どのスコープでどの窓口候補が見つかったか」までを決定する。

// rule_conditions（src/lib/ruleEngine.ts）の evaluateCondition と同じ演算子語彙・評価ロジックを
// 意図的に複製している。procedure_submission_rules は経営イベントエンジン専用の既存Rule Engineとは
// 対象範囲が異なる並行の仕組みであり（docs/NATIONAL_SUBMISSION_DIRECTORY.md 0-2節2点目）、
// 既存 ruleEngine.ts の変更は禁止されているため（Procedure Master/既存Engine変更禁止）、
// 小さな評価ロジックをこちらに独立して持つ。
function evaluateCondition(context: SubmissionRuleContext, cond: RuleConditionRow): boolean {
  const actual = context[cond.field];
  const expected = cond.value;

  switch (cond.operator) {
    case 'eq':
      return actual === expected;
    case 'neq':
      return actual !== expected;
    case 'in':
      return Array.isArray(expected) && expected.some((v) => v === actual);
    case 'not_in':
      return Array.isArray(expected) && !expected.some((v) => v === actual);
    case 'gt':
      return Number(actual) > Number(expected);
    case 'gte':
      return Number(actual) >= Number(expected);
    case 'lt':
      return Number(actual) < Number(expected);
    case 'lte':
      return Number(actual) <= Number(expected);
    default:
      return false;
  }
}

// procedure_submission_rules を priority 昇順で評価し、conditions が全件AND成立する最初の行を採用する。
// 該当が無ければ procedures.office_type をデフォルトとして返す（非破壊的な追加専用設計、D10）。
function applyProcedureRules(
  rules: ProcedureSubmissionRule[],
  procedureOfficeType: string,
  context: SubmissionRuleContext,
): { officeCategory: string; recipientScope: ProcedureSubmissionRule['recipientScope']; matchedRuleId: number | null } {
  const sorted = [...rules]
    .filter((r) => r.isActive)
    .sort((a, b) => a.priority - b.priority);

  for (const rule of sorted) {
    const isMatch = rule.conditions.every((c) => evaluateCondition(context, c));
    if (isMatch) {
      return { officeCategory: rule.officeCategory, recipientScope: rule.recipientScope, matchedRuleId: rule.id };
    }
  }

  return { officeCategory: procedureOfficeType, recipientScope: 'company', matchedRuleId: null };
}

function isCurrentlyEffective(j: SubmissionJurisdiction): boolean {
  return j.effectiveTo === null;
}

// スコープの降格探索: 市区町村 → 都道府県 → 全国（docs/NATIONAL_SUBMISSION_DIRECTORY.md ③-2節）。
// 各階層で is_primary=true の行が1件でも見つかれば、その階層で確定する
// （見つからない場合のみ次の階層へ降格する。階層をまたいで候補を混ぜない）。
function findAtScope(
  jurisdictions: SubmissionJurisdiction[],
  officeCategory: string,
  location: CompanyLocation,
): { tier: 'municipality' | 'prefecture' | 'national'; primary: SubmissionJurisdiction; alternatives: SubmissionJurisdiction[] } | null {
  const inCategory = jurisdictions.filter((j) => j.officeCategory === officeCategory && isCurrentlyEffective(j));

  if (location.municipalityId !== null) {
    const atMuni = inCategory.filter(
      (j) => j.scopeType === 'municipality' && j.municipalityScopeId === location.municipalityId,
    );
    const primary = atMuni.find((j) => j.isPrimary);
    if (primary) {
      const alternatives = atMuni.filter((j) => !j.isPrimary).sort((a, b) => a.priority - b.priority);
      return { tier: 'municipality', primary, alternatives };
    }
  }

  if (location.prefectureId !== null) {
    const atPref = inCategory.filter(
      (j) => j.scopeType === 'prefecture' && j.prefectureScopeId === location.prefectureId,
    );
    const primary = atPref.find((j) => j.isPrimary);
    if (primary) {
      const alternatives = atPref.filter((j) => !j.isPrimary).sort((a, b) => a.priority - b.priority);
      return { tier: 'prefecture', primary, alternatives };
    }
  }

  const atNational = inCategory.filter((j) => j.scopeType === 'national');
  const nationalPrimary = atNational.find((j) => j.isPrimary);
  if (nationalPrimary) {
    const alternatives = atNational.filter((j) => !j.isPrimary).sort((a, b) => a.priority - b.priority);
    return { tier: 'national', primary: nationalPrimary, alternatives };
  }

  return null;
}

// 評価の優先順位（固定、docs/NATIONAL_SUBMISSION_DIRECTORY.md ⑥節「状態の評価優先順位」）:
//   1. insufficient_profile（会社プロフィール不足）
//   2. requires_employee_address（procedure_submission_rules.recipient_scope='each_employee'）
//   3. not_supported（いずれのスコープでも0件）
//   4/5. found（stateModel.tsが multiple_candidates / resolved のどちらかへ変換する）
export function matchSubmissionOfficeCandidate(
  input: ResolveCandidateInput,
  data: ResolveCandidateData,
): CandidateMatch {
  // 1. 会社プロフィール不足: 市区町村が確定していなければ、以降のテーブル参照自体を行わない
  //    （municipality_codeが唯一の判定キーという既存の設計判断を踏襲。都道府県のみでは判定を進めない）。
  if (input.location.municipalityId === null) {
    return { kind: 'insufficient_profile' };
  }

  const { officeCategory, recipientScope, matchedRuleId } = applyProcedureRules(
    data.rules,
    input.procedureOfficeType,
    input.context,
  );

  // 2. 従業員住所ごとに提出先が変わる手続きは、会社所在地の窓口を断定表示しない（D2）。
  //    ジャリスディクション探索自体を行わずに即座に返す。
  if (recipientScope === 'each_employee') {
    return { kind: 'requires_employee_address', officeCategory, matchedRuleId };
  }

  const found = findAtScope(data.jurisdictions, officeCategory, input.location);

  // 3. いずれのスコープでも見つからない: 全国展開が未達のエリア（D4）
  if (!found) {
    return { kind: 'not_supported', officeCategory };
  }

  // 4/5. 見つかった（stateModel.tsで multiple_candidates / resolved に分岐する）
  return {
    kind: 'found',
    officeCategory,
    scopeTier: found.tier,
    primary: found.primary,
    alternatives: found.alternatives,
    matchedRuleId,
  };
}
