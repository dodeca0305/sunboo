import type { SupabaseClient } from '../supabase';
import {
  claimTaxSourceChangeNotification,
  completeTaxSourceChangeNotification,
  failTaxSourceChangeNotification,
} from './notificationDeliveryQueue.ts';
import {
  sendTaxSourceChangeReviewEmail,
  type ResendTaxSourceEmailConfig,
} from './resendTaxSourceEmail.ts';

export type TaxSourceEmailDeliveryResult =
  | {
      outcome: 'idle';
    }
  | {
      outcome: 'delivered';
      notificationEventId: number;
      reviewId: number;
      deliveryAttempts: number;
      recipient: string;
      providerMessageId: string;
    }
  | {
      outcome: 'failed';
      notificationEventId: number;
      reviewId: number;
      deliveryAttempts: number;
      failureRecorded: boolean;
      errorMessage: string;
    };

type TaxSourceEmailDeliveryDependencies = {
  claim:
    typeof claimTaxSourceChangeNotification;
  complete:
    typeof completeTaxSourceChangeNotification;
  fail:
    typeof failTaxSourceChangeNotification;
  send:
    typeof sendTaxSourceChangeReviewEmail;
};

const DEFAULT_DEPENDENCIES:
  TaxSourceEmailDeliveryDependencies = {
    claim:
      claimTaxSourceChangeNotification,
    complete:
      completeTaxSourceChangeNotification,
    fail:
      failTaxSourceChangeNotification,
    send:
      sendTaxSourceChangeReviewEmail,
  };

function normalizeError(
  error: unknown,
): string {
  const message =
    error instanceof Error
      ? error.message
      : 'TaxSource変更通知メールの配送に失敗しました。';

  const normalized =
    message.trim().slice(0, 1000);

  return normalized.length > 0
    ? normalized
    : 'TaxSource変更通知メールの配送に失敗しました。';
}

export async function deliverNextTaxSourceChangeEmail(
  supabase: SupabaseClient,
  config: ResendTaxSourceEmailConfig,
  dependencies:
    TaxSourceEmailDeliveryDependencies =
      DEFAULT_DEPENDENCIES,
): Promise<TaxSourceEmailDeliveryResult> {
  const notification =
    await dependencies.claim(supabase);

  if (!notification) {
    return {
      outcome: 'idle',
    };
  }

  try {
    const delivery =
      await dependencies.send(
        notification,
        config,
      );

    await dependencies.complete(
      supabase,
      {
        notificationEventId:
          notification.notificationEventId,
        claimToken:
          notification.claimToken,
        deliveryRecipient:
          delivery.recipient,
        providerMessageId:
          delivery.providerMessageId,
      },
    );

    return {
      outcome: 'delivered',
      notificationEventId:
        notification.notificationEventId,
      reviewId:
        notification.reviewId,
      deliveryAttempts:
        notification.deliveryAttempts,
      recipient:
        delivery.recipient,
      providerMessageId:
        delivery.providerMessageId,
    };
  } catch (error) {
    const errorMessage =
      normalizeError(error);

    try {
      await dependencies.fail(
        supabase,
        {
          notificationEventId:
            notification.notificationEventId,
          claimToken:
            notification.claimToken,
          errorMessage,
        },
      );

      return {
        outcome: 'failed',
        notificationEventId:
          notification.notificationEventId,
        reviewId:
          notification.reviewId,
        deliveryAttempts:
          notification.deliveryAttempts,
        failureRecorded: true,
        errorMessage,
      };
    } catch (failurePersistenceError) {
      return {
        outcome: 'failed',
        notificationEventId:
          notification.notificationEventId,
        reviewId:
          notification.reviewId,
        deliveryAttempts:
          notification.deliveryAttempts,
        failureRecorded: false,
        errorMessage: normalizeError(
          failurePersistenceError,
        ),
      };
    }
  }
}
