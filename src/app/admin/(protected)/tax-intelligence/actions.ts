'use server';

import { getAdminSession } from '@/lib/admin';
import { createServerSupabase } from '@/lib/supabase/server';
import {
  ingestCurrentEgovCorporateTaxSource,
} from '@/lib/taxIntelligence/egovConnector';
import {
  discoverTaxSourceVersionImpact,
  type TaxControlImpactCandidate,
  type TaxRuleImpactCandidate,
} from '@/lib/taxIntelligence/impactDiscovery';
import {
  ensureTaxSourceChangeReview,
  type TaxSourceChangeReviewStatus,
} from '@/lib/taxIntelligence/sourceChangeReviews';

export type TaxSourceImpactSummary = {
  supersedesSourceVersionId: number | null;
  ruleCandidates: TaxRuleImpactCandidate[];
  controlCandidates: TaxControlImpactCandidate[];
};

export type TaxSourceReviewSummary = {
  reviewId: number;
  status: TaxSourceChangeReviewStatus;
  wasCreated: boolean;
};

export type TaxSourceIngestionActionState = {
  status: 'idle' | 'success' | 'error';
  message: string;
  revisionId?: string;
  contentHash?: string;
  taxSourceVersionId?: number;
  supersedesVersionId?: number | null;
  wasInserted?: boolean;
  impact?: TaxSourceImpactSummary;
  review?: TaxSourceReviewSummary;
};

function successMessage({
  wasInserted,
  review,
}: {
  wasInserted: boolean;
  review?: TaxSourceReviewSummary;
}): string {
  if (wasInserted && review) {
    return 'e-Govの新版と変更レビュー案件を登録しました。';
  }

  if (wasInserted) {
    return 'e-Govの初回SourceVersionを登録しました。';
  }

  if (review?.wasCreated) {
    return '既存SourceVersionの未作成レビュー案件を回復しました。';
  }

  if (review) {
    return 'e-Govの内容に変更はありません。既存レビュー案件を表示します。';
  }

  return 'e-Govの内容に変更はありません。';
}

export async function ingestCurrentEgovAction(
  _previousState: TaxSourceIngestionActionState,
  _formData: FormData,
): Promise<TaxSourceIngestionActionState> {
  void _previousState;
  void _formData;

  const session = await getAdminSession();

  if (!session) {
    return {
      status: 'error',
      message:
        '管理者セッションを確認できません。再ログインしてください。',
    };
  }

  const supabase = await createServerSupabase();

  if (!supabase) {
    return {
      status: 'error',
      message:
        'Supabaseの環境変数が設定されていません。',
    };
  }

  try {
    const result =
      await ingestCurrentEgovCorporateTaxSource(
        supabase,
      );

    /*
     * wasInserted=falseでもImpact Discoveryを行う。
     * SourceVersion登録後にレビュー保存だけ失敗した場合、
     * 次回実行で未作成レビューを回復するため。
     */
    const discoveredImpact =
      await discoverTaxSourceVersionImpact(
        supabase,
        result.ingestion.taxSourceVersionId,
      );

    const reviewReference =
      discoveredImpact.supersedesSourceVersionId !==
      null
        ? await ensureTaxSourceChangeReview(
            supabase,
            discoveredImpact,
          )
        : undefined;

    const review = reviewReference
      ? {
          reviewId: reviewReference.reviewId,
          status: reviewReference.status,
          wasCreated: reviewReference.wasCreated,
        }
      : undefined;

    return {
      status: 'success',
      message: successMessage({
        wasInserted:
          result.ingestion.wasInserted,
        review,
      }),
      revisionId: result.source.revisionId,
      contentHash: result.source.contentHash,
      taxSourceVersionId:
        result.ingestion.taxSourceVersionId,
      supersedesVersionId:
        result.ingestion.supersedesVersionId,
      wasInserted: result.ingestion.wasInserted,
      impact: review
        ? {
            supersedesSourceVersionId:
              discoveredImpact
                .supersedesSourceVersionId,
            ruleCandidates:
              discoveredImpact.ruleCandidates,
            controlCandidates:
              discoveredImpact.controlCandidates,
          }
        : undefined,
      review,
    };
  } catch (error) {
    return {
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'e-Gov TaxSourceの取り込みに失敗しました。',
    };
  }
}
