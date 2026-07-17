import type { SubmissionOfficeResolution } from '@/lib/submissionDirectory';

// ── Submission Directory Adapter（Phase5-1: Preview Route専用）───────────────
// 設計: docs/PHASE5_UI_CUTOVER_PLAN.md B-5節。
//
// src/lib/submissionDirectory/（新Resolver、変更禁止）が返す SubmissionOfficeResolution を、
// プレビュー表示用の軽量なビュー型へ変換するだけの純粋関数。DBアクセス・JSXへの依存は持たない
// （buildRoadmapSubmissionInfo と同じ「プレーンなデータを返す純粋関数」の設計思想を踏襲）。
//
// 【重要】この関数は 'use client' を付けたファイルに置かない・そこからは export しない。
// Server Component（submission-directory-preview/page.tsx）から直接呼び出すため、
// 過去の実インシデント（memory: incident_result_500_rsc_boundary、2026-07-04の /result 500）と
// 同じ「Client Componentからexportされた関数をServer Componentが呼ぶ」形を避ける。

export type PreviewOfficeView = {
  status: SubmissionOfficeResolution['status'];
  officeName: string | null;
  address: string | null;
  phone: string | null;
  reason: string;
  verificationStatus: SubmissionOfficeResolution['verificationStatus'];
  publicVerificationLabel: string | null;
  matchedRuleId: number | null;
};

function extractMatchedRuleId(metadata: Record<string, unknown>): number | null {
  const value = metadata.matchedRuleId;
  return typeof value === 'number' ? value : null;
}

export function toPreviewView(resolution: SubmissionOfficeResolution): PreviewOfficeView {
  return {
    status: resolution.status,
    officeName: resolution.primaryOffice?.name ?? null,
    address: resolution.primaryOffice?.address ?? null,
    phone: resolution.primaryOffice?.phone ?? null,
    reason: resolution.reason,
    verificationStatus: resolution.verificationStatus,
    publicVerificationLabel: resolution.publicVerificationLabel,
    matchedRuleId: extractMatchedRuleId(resolution.metadata),
  };
}
