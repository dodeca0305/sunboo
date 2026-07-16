import type { SupabaseClient } from '@/lib/supabase';
import {
  fetchActiveProcedureRules,
  fetchCurrentSourcesByOfficeIds,
  fetchJurisdictionCandidates,
  fetchLocationLabels,
  fetchOfficesByIds,
  fetchProcedureOfficeType,
  resolveCompanyLocation,
} from './dataAccess';
import { buildPublicVerificationLabel, buildReason, buildRequiredAction } from './explain';
import { matchSubmissionOfficeCandidate } from './resolve';
import { decideStatus, decideVerification } from './stateModel';
import type {
  PublicOfficeView,
  SubmissionOffice,
  SubmissionOfficeResolution,
  SubmissionRuleContext,
} from './types';

export type {
  CandidateMatch,
  CompanyLocation,
  OfficeSource,
  ProcedureSubmissionRule,
  PublicOfficeView,
  RecipientScope,
  RequiredAction,
  ResolutionStatus,
  ResolveCandidateData,
  ResolveCandidateInput,
  RuleConditionRow,
  SubmissionJurisdiction,
  SubmissionOffice,
  SubmissionOfficeResolution,
  SubmissionOfficeSourceView,
  SubmissionRuleContext,
  VerificationStatus,
} from './types';

export { matchSubmissionOfficeCandidate } from './resolve';
export { decideStatus, decideVerification } from './stateModel';
export { buildPublicVerificationLabel, buildReason, buildRequiredAction } from './explain';
export * as submissionDirectoryDataAccess from './dataAccess';

// ── オーケストレーター（Phase2: 福岡県パイロット）───────────────────
// UIから直接呼び出す唯一のエントリーポイント。データアクセス（dataAccess.ts）→
// 判定関数（resolve.ts）→ 状態変換（stateModel.ts）→ 公開表示用の説明生成（explain.ts）の順に
// 呼び出し、SubmissionOfficeResolution を組み立てる。UI側にロジックを書かせない
// （既存 resolveOffices / buildRoadmapSubmissionInfo と同じ「共通サービスとして提供する」方針）。

export type ResolveSubmissionOfficeParams = {
  procedureId: number;
  municipalityCode: string | null;
  prefectureCode: string | null;
  // procedure_submission_rules.conditions の評価コンテキスト。呼び出し側の会社プロフィールから
  // 組み立てる（例: { corporate_type: 'kabushiki', has_employees: true }）。省略時は空コンテキスト
  // （条件付きルールは不成立になり、無条件ルール・procedures.office_typeのデフォルトのみが働く）。
  context?: SubmissionRuleContext;
};

function toPublicOfficeView(office: SubmissionOffice): PublicOfficeView {
  return {
    officeCategory: office.officeCategory,
    name: office.name,
    organizationName: office.organizationName,
    address: office.address,
    phone: office.phone,
    officialUrl: office.officialUrl,
    websiteUrl: office.websiteUrl,
    mapUrl: office.mapUrl,
    fallbackUrl: office.fallbackUrl,
  };
}

// client は非nullを前提とする（呼び出し側が既存の慣例通り「DB未接続なら呼び出さない」を担保する）。
// insufficient_profile/multiple_candidates/not_supported 等の5状態はいずれも「DBに接続できた上での
// 業務上の判定結果」であり、DB未接続はそれとは別の前提条件エラーのため、ここでは呼び出し元の責務とする。
export async function resolveSubmissionOfficeForCompany(
  client: SupabaseClient,
  params: ResolveSubmissionOfficeParams,
): Promise<SubmissionOfficeResolution> {
  const location = await resolveCompanyLocation(client, {
    municipalityCode: params.municipalityCode,
    prefectureCode: params.prefectureCode,
  });

  const procedureOfficeType = await fetchProcedureOfficeType(client, params.procedureId);
  if (!procedureOfficeType) {
    throw new Error(
      `resolveSubmissionOfficeForCompany: procedure_id=${params.procedureId} が procedures テーブルに見つかりません`,
    );
  }

  const rules = await fetchActiveProcedureRules(client, params.procedureId);
  const candidateCategories = Array.from(new Set([procedureOfficeType, ...rules.map((r) => r.officeCategory)]));
  const jurisdictionArrays = await Promise.all(
    candidateCategories.map((category) => fetchJurisdictionCandidates(client, category)),
  );
  const jurisdictions = jurisdictionArrays.flat();

  const officeIds = Array.from(new Set(jurisdictions.map((j) => j.officeId)));
  const [officesById, currentSourceByOfficeId] = await Promise.all([
    fetchOfficesByIds(client, officeIds),
    fetchCurrentSourcesByOfficeIds(client, officeIds),
  ]);

  const match = matchSubmissionOfficeCandidate(
    {
      procedureId: params.procedureId,
      procedureOfficeType,
      location,
      context: params.context ?? {},
    },
    { rules, jurisdictions, officesById, currentSourceByOfficeId },
  );

  const status = decideStatus(match);
  const { municipalityName, prefectureName } = await fetchLocationLabels(client, location);

  if (match.kind !== 'found') {
    return {
      status,
      primaryOffice: null,
      alternativeOffices: [],
      reason: buildReason({
        status,
        scopeTier: null,
        locationLabel: municipalityName,
        prefectureLabel: prefectureName,
        officeName: null,
        ruleApplied: match.kind === 'requires_employee_address' && match.matchedRuleId !== null,
        hasAlternatives: false,
        verificationStatus: null,
      }),
      source: null,
      verificationStatus: null,
      lastVerifiedAt: null,
      publicVerificationLabel: null,
      requiredAction: buildRequiredAction(status, null),
      metadata: {
        officeCategory: match.kind === 'insufficient_profile' ? null : match.officeCategory,
      },
    };
  }

  const primaryOffice = officesById.get(match.primary.officeId);
  if (!primaryOffice) {
    throw new Error(
      `resolveSubmissionOfficeForCompany: submission_jurisdictions.office_id=${match.primary.officeId} に対応する submission_offices 行が見つかりません（データ不整合）`,
    );
  }
  const currentSource = currentSourceByOfficeId.get(primaryOffice.id);
  const verificationStatus = decideVerification(primaryOffice, currentSource);

  const alternativeOffices = match.alternatives
    .map((alt) => officesById.get(alt.officeId))
    .filter((o): o is SubmissionOffice => Boolean(o))
    .map(toPublicOfficeView);

  return {
    status,
    primaryOffice: toPublicOfficeView(primaryOffice),
    alternativeOffices,
    reason: buildReason({
      status,
      scopeTier: match.scopeTier,
      locationLabel: municipalityName,
      prefectureLabel: prefectureName,
      officeName: primaryOffice.name,
      ruleApplied: match.matchedRuleId !== null,
      hasAlternatives: alternativeOffices.length > 0,
      verificationStatus,
    }),
    source: currentSource
      ? { sourceType: currentSource.sourceType, publisherName: currentSource.publisherName, sourceUrl: currentSource.sourceUrl }
      : null,
    verificationStatus,
    lastVerifiedAt: primaryOffice.lastVerifiedAt,
    publicVerificationLabel: buildPublicVerificationLabel(verificationStatus),
    requiredAction: buildRequiredAction(status, verificationStatus),
    metadata: {
      officeCategory: match.officeCategory,
      scopeTier: match.scopeTier,
      matchedRuleId: match.matchedRuleId,
      alternativeOfficeCount: alternativeOffices.length,
      verificationDueAt: primaryOffice.verificationDueAt,
      officialUrlStatus: primaryOffice.officialUrlStatus,
      dataVersion: primaryOffice.dataVersion,
    },
  };
}
