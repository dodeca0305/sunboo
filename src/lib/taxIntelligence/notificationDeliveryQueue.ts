import type { SupabaseClient } from '../supabase';

export type TaxSourceChangeEmailPayload = {
  reviewId: number;
  taxSourceId: number;
  taxSourceVersionId: number;
  supersedesSourceVersionId: number;
  sourceTitle: string;
  versionLabel: string | null;
  contentHash: string;
  supersedesVersionLabel: string | null;
  supersedesContentHash: string;
  detectedAt: string;
  ruleCandidateCount: number;
  controlCandidateCount: number;
};

export type ClaimedTaxSourceChangeNotification = {
  notificationEventId: number;
  reviewId: number;
  eventType:
    'tax_source_change_review_opened';
  payload: TaxSourceChangeEmailPayload;
  deliveryAttempts: number;
  claimToken: string;
};

type ClaimRow = {
  notification_event_id: number;
  review_id: number;
  event_type: string;
  payload: unknown;
  delivery_attempts: number;
  claim_token: string;
};

function isPositiveInteger(
  value: unknown,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value > 0
  );
}

function isNonNegativeInteger(
  value: unknown,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function optionalString(
  value: unknown,
): value is string | null {
  return value === null ||
    typeof value === 'string';
}

function parsePayload(
  value: unknown,
): TaxSourceChangeEmailPayload {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw new Error(
      'TaxSource変更通知payloadが不正です。',
    );
  }

  const payload =
    value as Record<string, unknown>;

  if (
    !isPositiveInteger(payload.reviewId) ||
    !isPositiveInteger(payload.taxSourceId) ||
    !isPositiveInteger(
      payload.taxSourceVersionId,
    ) ||
    !isPositiveInteger(
      payload.supersedesSourceVersionId,
    ) ||
    typeof payload.sourceTitle !== 'string' ||
    payload.sourceTitle.trim().length === 0 ||
    !optionalString(payload.versionLabel) ||
    typeof payload.contentHash !== 'string' ||
    payload.contentHash.length === 0 ||
    !optionalString(
      payload.supersedesVersionLabel,
    ) ||
    typeof payload.supersedesContentHash !==
      'string' ||
    payload.supersedesContentHash.length === 0 ||
    typeof payload.detectedAt !== 'string' ||
    !Number.isFinite(
      Date.parse(payload.detectedAt),
    ) ||
    !isNonNegativeInteger(
      payload.ruleCandidateCount,
    ) ||
    !isNonNegativeInteger(
      payload.controlCandidateCount,
    )
  ) {
    throw new Error(
      'TaxSource変更通知payloadの項目が不正です。',
    );
  }

  return {
    reviewId: payload.reviewId,
    taxSourceId: payload.taxSourceId,
    taxSourceVersionId:
      payload.taxSourceVersionId,
    supersedesSourceVersionId:
      payload.supersedesSourceVersionId,
    sourceTitle: payload.sourceTitle,
    versionLabel: payload.versionLabel,
    contentHash: payload.contentHash,
    supersedesVersionLabel:
      payload.supersedesVersionLabel,
    supersedesContentHash:
      payload.supersedesContentHash,
    detectedAt: payload.detectedAt,
    ruleCandidateCount:
      payload.ruleCandidateCount,
    controlCandidateCount:
      payload.controlCandidateCount,
  };
}

export async function claimTaxSourceChangeNotification(
  supabase: SupabaseClient,
  leaseSeconds = 300,
): Promise<
  ClaimedTaxSourceChangeNotification | null
> {
  if (
    !Number.isSafeInteger(leaseSeconds) ||
    leaseSeconds < 30 ||
    leaseSeconds > 3600
  ) {
    throw new Error(
      `通知Claim期限が不正です: ${leaseSeconds}`,
    );
  }

  const { data, error } = await supabase.rpc(
    'claim_tax_source_change_notification_event',
    {
      p_lease_seconds: leaseSeconds,
    },
  );

  if (error) {
    throw new Error(
      `TaxSource変更通知のClaimに失敗しました: ${error.message}`,
    );
  }

  const rows =
    (data as ClaimRow[] | null) ?? [];

  if (rows.length === 0) {
    return null;
  }

  if (rows.length !== 1) {
    throw new Error(
      `TaxSource変更通知のClaim結果が不正です: ${rows.length}件`,
    );
  }

  const row = rows[0];

  if (
    !isPositiveInteger(
      row.notification_event_id,
    ) ||
    !isPositiveInteger(row.review_id) ||
    row.event_type !==
      'tax_source_change_review_opened' ||
    !isPositiveInteger(
      row.delivery_attempts,
    ) ||
    typeof row.claim_token !== 'string' ||
    row.claim_token.length === 0
  ) {
    throw new Error(
      'TaxSource変更通知のClaim応答が不正です。',
    );
  }

  const payload = parsePayload(row.payload);

  if (payload.reviewId !== row.review_id) {
    throw new Error(
      'TaxSource変更通知のレビューIDが一致しません。',
    );
  }

  return {
    notificationEventId:
      row.notification_event_id,
    reviewId: row.review_id,
    eventType:
      'tax_source_change_review_opened',
    payload,
    deliveryAttempts:
      row.delivery_attempts,
    claimToken: row.claim_token,
  };
}

export async function completeTaxSourceChangeNotification(
  supabase: SupabaseClient,
  input: {
    notificationEventId: number;
    claimToken: string;
    deliveryRecipient: string;
    providerMessageId: string;
  },
): Promise<void> {
  const { data, error } = await supabase.rpc(
    'complete_tax_source_change_notification_event',
    {
      p_notification_event_id:
        input.notificationEventId,
      p_claim_token: input.claimToken,
      p_delivery_recipient:
        input.deliveryRecipient,
      p_provider_message_id:
        input.providerMessageId,
    },
  );

  if (error) {
    throw new Error(
      `TaxSource変更通知の完了保存に失敗しました: ${error.message}`,
    );
  }

  if (data !== true) {
    throw new Error(
      'TaxSource変更通知のClaimが失効しています。',
    );
  }
}

export async function failTaxSourceChangeNotification(
  supabase: SupabaseClient,
  input: {
    notificationEventId: number;
    claimToken: string;
    errorMessage: string;
  },
): Promise<void> {
  const normalizedError =
    input.errorMessage.trim();

  if (normalizedError.length === 0) {
    throw new Error(
      'TaxSource変更通知の失敗理由が空です。',
    );
  }

  const { data, error } = await supabase.rpc(
    'fail_tax_source_change_notification_event',
    {
      p_notification_event_id:
        input.notificationEventId,
      p_claim_token: input.claimToken,
      p_error: normalizedError,
    },
  );

  if (error) {
    throw new Error(
      `TaxSource変更通知の失敗保存に失敗しました: ${error.message}`,
    );
  }

  if (data !== true) {
    throw new Error(
      'TaxSource変更通知のClaimが失効しています。',
    );
  }
}
