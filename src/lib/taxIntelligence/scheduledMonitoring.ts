import type { SupabaseClient } from '../supabase';
import {
  ingestCurrentEgovCorporateTaxSource,
} from './egovConnector.ts';
import {
  discoverTaxSourceVersionImpact,
  type TaxSourceVersionImpact,
} from './impactDiscovery.ts';
import {
  ensureTaxSourceChangeNotificationEvent,
  type TaxSourceChangeNotificationEventReference,
} from './sourceChangeNotifications.ts';
import {
  ensureTaxSourceChangeReview,
  type TaxSourceChangeReviewReference,
} from './sourceChangeReviews.ts';

export type ScheduledEgovMonitoringResult = {
  revisionId: string;
  contentHash: string;
  taxSourceVersionId: number;
  supersedesVersionId: number | null;
  wasInserted: boolean;
  impact: TaxSourceVersionImpact;
  review:
    | TaxSourceChangeReviewReference
    | null;
  notification:
    | TaxSourceChangeNotificationEventReference
    | null;
  notificationError: string | null;
};

type ScheduledMonitoringDependencies = {
  ingestCurrent:
    typeof ingestCurrentEgovCorporateTaxSource;
  discoverImpact:
    typeof discoverTaxSourceVersionImpact;
  ensureReview:
    typeof ensureTaxSourceChangeReview;
  ensureNotification?:
    typeof ensureTaxSourceChangeNotificationEvent;
};

const DEFAULT_DEPENDENCIES:
  ScheduledMonitoringDependencies = {
    ingestCurrent:
      ingestCurrentEgovCorporateTaxSource,
    discoverImpact:
      discoverTaxSourceVersionImpact,
    ensureReview:
      ensureTaxSourceChangeReview,
    ensureNotification:
      ensureTaxSourceChangeNotificationEvent,
  };

/*
 * e-Gov現在版の監視ユースケース。
 *
 * wasInserted=falseでも影響探索・レビュー作成・通知イベント作成を
 * 冪等実行する。途中の後続処理だけ失敗した場合、次回の定期実行で
 * 未作成データを回復するため。
 *
 * 通知イベント保存失敗はSourceVersion取り込みとレビュー作成を
 * 巻き戻さない。失敗内容を結果へ保持し、次回監視で再試行する。
 */
export async function runScheduledEgovMonitoring(
  supabase: SupabaseClient,
  dependencies:
    ScheduledMonitoringDependencies =
      DEFAULT_DEPENDENCIES,
): Promise<ScheduledEgovMonitoringResult> {
  const ingestionResult =
    await dependencies.ingestCurrent(supabase);

  const impact =
    await dependencies.discoverImpact(
      supabase,
      ingestionResult.ingestion
        .taxSourceVersionId,
    );

  const review =
    impact.supersedesSourceVersionId === null
      ? null
      : await dependencies.ensureReview(
          supabase,
          impact,
        );

  let notification:
    | TaxSourceChangeNotificationEventReference
    | null = null;
  let notificationError: string | null = null;

  if (review) {
    try {
      const ensureNotification =
        dependencies.ensureNotification ??
        ensureTaxSourceChangeNotificationEvent;

      notification =
        await ensureNotification(
          supabase,
          review.reviewId,
        );
    } catch (error) {
      notificationError =
        error instanceof Error
          ? error.message
          : 'TaxSource変更通知イベントの保存に失敗しました。';
    }
  }

  return {
    revisionId:
      ingestionResult.source.revisionId,
    contentHash:
      ingestionResult.source.contentHash,
    taxSourceVersionId:
      ingestionResult.ingestion
        .taxSourceVersionId,
    supersedesVersionId:
      ingestionResult.ingestion
        .supersedesVersionId,
    wasInserted:
      ingestionResult.ingestion.wasInserted,
    impact,
    review,
    notification,
    notificationError,
  };
}
