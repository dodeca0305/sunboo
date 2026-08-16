'use server';

import { revalidatePath } from 'next/cache';

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
  closeTaxSourceChangeReview,
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

export type CloseTaxSourceReviewActionState = {
  status: 'idle' | 'success' | 'error';
  message: string;
  reviewId?: number;
  reviewStatus?: 'resolved' | 'dismissed';
  resolutionSummary?: string;
  resolvedBy?: string;
  resolvedAt?: string;
};

export async function closeTaxSourceReviewAction(
  _previousState: CloseTaxSourceReviewActionState,
  formData: FormData,
): Promise<CloseTaxSourceReviewActionState> {
  void _previousState;

  const session = await getAdminSession();

  if (!session) {
    return {
      status: 'error',
      message:
        '管理者セッションを確認できません。再ログインしてください。',
    };
  }

  const reviewId = Number(
    formData.get('reviewId'),
  );
  const requestedStatus =
    formData.get('status');
  const resolutionSummary =
    String(
      formData.get('resolutionSummary') ?? '',
    ).trim();

  if (
    !Number.isSafeInteger(reviewId)
    || reviewId <= 0
  ) {
    return {
      status: 'error',
      message:
        'TaxSource変更レビューIDが不正です。',
    };
  }

  if (
    requestedStatus !== 'resolved'
    && requestedStatus !== 'dismissed'
  ) {
    return {
      status: 'error',
      message:
        '終了状態が不正です。',
    };
  }

  if (!resolutionSummary) {
    return {
      status: 'error',
      message:
        '判断内容を入力してください。',
    };
  }

  const supabase =
    await createServerSupabase();

  if (!supabase) {
    return {
      status: 'error',
      message:
        'Supabaseの環境変数が設定されていません。',
    };
  }

  try {
    const closed =
      await closeTaxSourceChangeReview(
        supabase,
        {
          reviewId,
          status: requestedStatus,
          resolutionSummary,
        },
      );

    revalidatePath(
      '/admin/tax-intelligence',
    );

    return {
      status: 'success',
      message:
        closed.status === 'resolved'
          ? '変更レビューを解決済みにしました。'
          : '変更レビューを対象外にしました。',
      reviewId: closed.reviewId,
      reviewStatus: closed.status,
      resolutionSummary:
        closed.resolutionSummary,
      resolvedBy: closed.resolvedBy,
      resolvedAt: closed.resolvedAt,
    };
  } catch (error) {
    return {
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'TaxSource変更レビューの終了に失敗しました。',
    };
  }
}
