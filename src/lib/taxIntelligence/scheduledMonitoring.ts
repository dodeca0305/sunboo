import type { SupabaseClient } from '../supabase';
import {
  ingestCurrentEgovCorporateTaxSource,
} from './egovConnector.ts';
import {
  discoverTaxSourceVersionImpact,
  type TaxSourceVersionImpact,
} from './impactDiscovery.ts';
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
};

type ScheduledMonitoringDependencies = {
  ingestCurrent:
    typeof ingestCurrentEgovCorporateTaxSource;
  discoverImpact:
    typeof discoverTaxSourceVersionImpact;
  ensureReview:
    typeof ensureTaxSourceChangeReview;
};

const DEFAULT_DEPENDENCIES:
  ScheduledMonitoringDependencies = {
    ingestCurrent:
      ingestCurrentEgovCorporateTaxSource,
    discoverImpact:
      discoverTaxSourceVersionImpact,
    ensureReview:
      ensureTaxSourceChangeReview,
  };

/*
 * e-Gov現在版の監視ユースケース。
 *
 * wasInserted=falseでも影響探索と冪等レビュー作成を行う。
 * SourceVersion保存後に後続処理だけ失敗した場合、
 * 次回の定期実行でレビューを回復するため。
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
  };
}
