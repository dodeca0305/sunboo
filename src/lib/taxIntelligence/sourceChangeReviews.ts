import type { SupabaseClient } from '../supabase';
import type {
  TaxSourceVersionImpact,
} from './impactDiscovery.ts';
import {
  buildTaxSourceVersionDiff,
  type TaxSourceVersionDiff,
} from './sourceVersionDiff.ts';

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

export type TaxSourceChangeReviewCloseStatus =
  Exclude<TaxSourceChangeReviewStatus, 'open'>;

export type TaxSourceChangeReviewItem = {
  reviewId: number;
  status: TaxSourceChangeReviewStatus;
  detectedAt: string;
  resolutionSummary: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;

  taxSourceId: number;
  provider: string;
  sourceType: string;
  taxType: string | null;
  sourceTitle: string;
  canonicalLocator: string;

  taxSourceVersionId: number;
  versionLabel: string | null;
  contentHash: string;
  publishedAt: string | null;
  effectiveFrom: string | null;
  observedAt: string;
  retrievedAt: string;

  supersedesSourceVersionId: number;
  supersedesVersionLabel: string | null;
  supersedesContentHash: string;

  sourceDiff: TaxSourceVersionDiff;
  impact: TaxSourceVersionImpact;
};

export type ClosedTaxSourceChangeReview = {
  reviewId: number;
  status: TaxSourceChangeReviewCloseStatus;
  resolutionSummary: string;
  resolvedBy: string;
  resolvedAt: string;
  updatedAt: string;
};

type ReviewRow = {
  id: number;
  tax_source_version_id: number;
  tax_source_id: number;
  supersedes_source_version_id: number;
  status: TaxSourceChangeReviewStatus;
  impact_snapshot: unknown;
  detected_at: string;
  resolution_summary: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

type SourceVersionRow = {
  id: number;
  tax_source_id: number;
  version_label: string | null;
  content_hash: string;
  published_at: string | null;
  effective_from: string | null;
  observed_at: string;
  retrieved_at: string;
  normalized_text: string;
};

type SourceRow = {
  id: number;
  provider: string;
  source_type: string;
  tax_type: string | null;
  title: string;
  canonical_locator: string;
};

type ClosedReviewRow = {
  id: number;
  status: TaxSourceChangeReviewStatus;
  resolution_summary: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  updated_at: string;
};

const REVIEW_STATUS_ORDER: Record<
  TaxSourceChangeReviewStatus,
  number
> = {
  open: 0,
  resolved: 1,
  dismissed: 2,
};

function parseImpactSnapshot(
  value: unknown,
  review: ReviewRow,
): TaxSourceVersionImpact {
  if (
    typeof value !== 'object'
    || value === null
    || Array.isArray(value)
  ) {
    throw new Error(
      `TaxSource変更レビュー ${review.id} の影響snapshotが不正です。`,
    );
  }

  const snapshot = value as Record<string, unknown>;

  if (
    snapshot.sourceVersionId
      !== review.tax_source_version_id
    || snapshot.supersedesSourceVersionId
      !== review.supersedes_source_version_id
    || !Array.isArray(snapshot.ruleCandidates)
    || !Array.isArray(snapshot.controlCandidates)
  ) {
    throw new Error(
      `TaxSource変更レビュー ${review.id} の影響snapshotがprovenanceと一致しません。`,
    );
  }

  return snapshot as TaxSourceVersionImpact;
}

export async function loadTaxSourceChangeReviewItems(
  supabase: SupabaseClient,
): Promise<TaxSourceChangeReviewItem[]> {
  const { data: reviewData, error: reviewError } =
    await supabase
      .from('tax_source_change_reviews')
      .select(
        'id, tax_source_version_id, tax_source_id, supersedes_source_version_id, status, impact_snapshot, detected_at, resolution_summary, resolved_by, resolved_at, created_at, updated_at',
      )
      .order('updated_at', { ascending: false });

  if (reviewError) {
    throw new Error(
      `TaxSource変更レビューの取得に失敗しました: ${reviewError.message}`,
    );
  }

  const reviews =
    (reviewData as ReviewRow[] | null) ?? [];

  if (reviews.length === 0) return [];

  const versionIds = [
    ...new Set(
      reviews.flatMap((review) => [
        review.tax_source_version_id,
        review.supersedes_source_version_id,
      ]),
    ),
  ];

  const { data: versionData, error: versionError } =
    await supabase
      .from('tax_source_versions')
      .select(
        'id, tax_source_id, version_label, content_hash, published_at, effective_from, observed_at, retrieved_at, normalized_text',
      )
      .in('id', versionIds);

  if (versionError) {
    throw new Error(
      `TaxSourceVersionの取得に失敗しました: ${versionError.message}`,
    );
  }

  const versions =
    (versionData as SourceVersionRow[] | null) ?? [];
  const versionById = new Map(
    versions.map((version) => [version.id, version]),
  );

  const sourceIds = [
    ...new Set(
      reviews.map((review) => review.tax_source_id),
    ),
  ];

  const { data: sourceData, error: sourceError } =
    await supabase
      .from('tax_sources')
      .select(
        'id, provider, source_type, tax_type, title, canonical_locator',
      )
      .in('id', sourceIds);

  if (sourceError) {
    throw new Error(
      `TaxSourceの取得に失敗しました: ${sourceError.message}`,
    );
  }

  const sources =
    (sourceData as SourceRow[] | null) ?? [];
  const sourceById = new Map(
    sources.map((source) => [source.id, source]),
  );

  const items = reviews.map(
    (review): TaxSourceChangeReviewItem => {
      const version = versionById.get(
        review.tax_source_version_id,
      );
      const supersedesVersion = versionById.get(
        review.supersedes_source_version_id,
      );
      const source = sourceById.get(
        review.tax_source_id,
      );

      if (!version) {
        throw new Error(
          `TaxSource変更レビュー ${review.id} のSourceVersion ${review.tax_source_version_id}を参照できません。`,
        );
      }

      if (!supersedesVersion) {
        throw new Error(
          `TaxSource変更レビュー ${review.id} の前版 ${review.supersedes_source_version_id}を参照できません。`,
        );
      }

      if (!source) {
        throw new Error(
          `TaxSource変更レビュー ${review.id} のTaxSource ${review.tax_source_id}を参照できません。`,
        );
      }

      if (
        version.tax_source_id !== source.id
        || supersedesVersion.tax_source_id !== source.id
      ) {
        throw new Error(
          `TaxSource変更レビュー ${review.id} のSource provenanceが一致しません。`,
        );
      }

      return {
        reviewId: review.id,
        status: review.status,
        detectedAt: review.detected_at,
        resolutionSummary:
          review.resolution_summary,
        resolvedBy: review.resolved_by,
        resolvedAt: review.resolved_at,
        createdAt: review.created_at,
        updatedAt: review.updated_at,

        taxSourceId: source.id,
        provider: source.provider,
        sourceType: source.source_type,
        taxType: source.tax_type,
        sourceTitle: source.title,
        canonicalLocator: source.canonical_locator,

        taxSourceVersionId: version.id,
        versionLabel: version.version_label,
        contentHash: version.content_hash,
        publishedAt: version.published_at,
        effectiveFrom: version.effective_from,
        observedAt: version.observed_at,
        retrievedAt: version.retrieved_at,

        supersedesSourceVersionId:
          supersedesVersion.id,
        supersedesVersionLabel:
          supersedesVersion.version_label,
        supersedesContentHash:
          supersedesVersion.content_hash,

        sourceDiff: buildTaxSourceVersionDiff(
          supersedesVersion.normalized_text,
          version.normalized_text,
        ),
        impact: parseImpactSnapshot(
          review.impact_snapshot,
          review,
        ),
      };
    },
  );

  return items.sort((a, b) => {
    const statusDifference =
      REVIEW_STATUS_ORDER[a.status]
      - REVIEW_STATUS_ORDER[b.status];

    if (statusDifference !== 0) {
      return statusDifference;
    }

    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export async function closeTaxSourceChangeReview(
  supabase: SupabaseClient,
  input: {
    reviewId: number;
    status: TaxSourceChangeReviewCloseStatus;
    resolutionSummary: string;
  },
): Promise<ClosedTaxSourceChangeReview> {
  if (
    !Number.isSafeInteger(input.reviewId)
    || input.reviewId <= 0
  ) {
    throw new Error(
      'TaxSource変更レビューIDが不正です。',
    );
  }

  if (
    input.status !== 'resolved'
    && input.status !== 'dismissed'
  ) {
    throw new Error(
      'TaxSource変更レビューの終了状態が不正です。',
    );
  }

  const resolutionSummary =
    input.resolutionSummary.trim();

  if (!resolutionSummary) {
    throw new Error(
      '判断内容を入力してください。',
    );
  }

  const { data, error } = await supabase
    .from('tax_source_change_reviews')
    .update({
      status: input.status,
      resolution_summary: resolutionSummary,
    })
    .eq('id', input.reviewId)
    .eq('status', 'open')
    .select(
      'id, status, resolution_summary, resolved_by, resolved_at, updated_at',
    )
    .single();

  if (error) {
    throw new Error(
      `TaxSource変更レビューの終了に失敗しました: ${error.message}`,
    );
  }

  const row = data as ClosedReviewRow | null;

  if (
    !row
    || row.id !== input.reviewId
    || row.status !== input.status
    || row.resolution_summary !== resolutionSummary
    || !row.resolved_by
    || !row.resolved_at
  ) {
    throw new Error(
      'TaxSource変更レビューの終了結果が不正です。',
    );
  }

  return {
    reviewId: row.id,
    status: row.status,
    resolutionSummary: row.resolution_summary,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
    updatedAt: row.updated_at,
  };
}
