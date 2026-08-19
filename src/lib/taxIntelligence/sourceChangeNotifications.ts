import type { SupabaseClient } from '../supabase';

export type TaxSourceChangeNotificationEventType =
  'tax_source_change_review_opened';

export type TaxSourceChangeNotificationDeliveryStatus =
  | 'pending'
  | 'delivered'
  | 'failed';

export type TaxSourceChangeNotificationEventReference = {
  notificationEventId: number;
  reviewId: number;
  eventType:
    TaxSourceChangeNotificationEventType;
  deliveryStatus:
    TaxSourceChangeNotificationDeliveryStatus;
  wasCreated: boolean;
};

type EnsureNotificationEventRow = {
  notification_event_id: number;
  review_id: number;
  event_type:
    TaxSourceChangeNotificationEventType;
  delivery_status:
    TaxSourceChangeNotificationDeliveryStatus;
  was_created: boolean;
};

export async function ensureTaxSourceChangeNotificationEvent(
  supabase: SupabaseClient,
  reviewId: number,
): Promise<TaxSourceChangeNotificationEventReference> {
  if (
    !Number.isSafeInteger(reviewId) ||
    reviewId <= 0
  ) {
    throw new Error(
      `TaxSource変更レビューIDが不正です: ${reviewId}`,
    );
  }

  const { data, error } = await supabase.rpc(
    'ensure_tax_source_change_notification_event',
    {
      p_review_id: reviewId,
    },
  );

  if (error) {
    throw new Error(
      `TaxSource変更通知イベントの保存に失敗しました: ${error.message}`,
    );
  }

  const rows =
    (data as
      | EnsureNotificationEventRow[]
      | null) ?? [];

  if (rows.length !== 1) {
    throw new Error(
      `TaxSource変更通知イベントの保存結果が不正です: ${rows.length}件`,
    );
  }

  const row = rows[0];

  if (row.review_id !== reviewId) {
    throw new Error(
      'TaxSource変更通知イベントのレビューIDが一致しません。',
    );
  }

  if (
    row.event_type !==
    'tax_source_change_review_opened'
  ) {
    throw new Error(
      `TaxSource変更通知イベント種別が不正です: ${row.event_type}`,
    );
  }

  return {
    notificationEventId:
      row.notification_event_id,
    reviewId: row.review_id,
    eventType: row.event_type,
    deliveryStatus: row.delivery_status,
    wasCreated: row.was_created,
  };
}
