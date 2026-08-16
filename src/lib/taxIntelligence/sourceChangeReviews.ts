import type { SupabaseClient } from '../supabase';
import type {
  TaxSourceVersionImpact,
} from './impactDiscovery.ts';

export type TaxSourceChangeReviewStatus =
  | 'open'
  | 'resolved'
  | 'dismissed';

export type TaxSourceChangeReviewReference = {
  reviewId: number;
  taxSourceVersionId: number;
  status: TaxSourceChangeReviewStatus;
  wasCreated: boolean;
};

type EnsureReviewRow = {
  review_id: number;
  tax_source_version_id: number;
  status: TaxSourceChangeReviewStatus;
  was_created: boolean;
};

export async function ensureTaxSourceChangeReview(
  supabase: SupabaseClient,
  impact: TaxSourceVersionImpact,
): Promise<TaxSourceChangeReviewReference> {
  if (impact.supersedesSourceVersionId === null) {
    throw new Error(
      `初回TaxSourceVersion ${impact.sourceVersionId}には変更レビューを作成できません。`,
    );
  }

  const { data, error } = await supabase.rpc(
    'ensure_tax_source_change_review',
    {
      p_tax_source_version_id:
        impact.sourceVersionId,
      p_impact_snapshot: {
        sourceVersionId: impact.sourceVersionId,
        supersedesSourceVersionId:
          impact.supersedesSourceVersionId,
        ruleCandidates: impact.ruleCandidates,
        controlCandidates:
          impact.controlCandidates,
      },
    },
  );

  if (error) {
    throw new Error(
      `TaxSource変更レビューの保存に失敗しました: ${error.message}`,
    );
  }

  const rows = (data as EnsureReviewRow[] | null) ?? [];

  if (rows.length !== 1) {
    throw new Error(
      `TaxSource変更レビューの保存結果が不正です: ${rows.length}件`,
    );
  }

  const row = rows[0];

  if (
    row.tax_source_version_id !==
    impact.sourceVersionId
  ) {
    throw new Error(
      'TaxSource変更レビューのSourceVersionが一致しません。',
    );
  }

  return {
    reviewId: row.review_id,
    taxSourceVersionId:
      row.tax_source_version_id,
    status: row.status,
    wasCreated: row.was_created,
  };
}
