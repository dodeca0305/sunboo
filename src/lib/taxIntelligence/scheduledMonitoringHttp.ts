import {
  timingSafeEqual,
} from 'node:crypto';

import type { SupabaseClient } from '../supabase';
import {
  runScheduledEgovMonitoring,
} from './scheduledMonitoring.ts';

type ScheduledMonitoringHttpDependencies = {
  cronSecret: string | undefined;
  createSupabase:
    () => SupabaseClient | null;
  runMonitoring:
    typeof runScheduledEgovMonitoring;
};

function secretsMatch(
  authorization: string | null,
  cronSecret: string,
): boolean {
  const expected =
    Buffer.from(`Bearer ${cronSecret}`);
  const received =
    Buffer.from(authorization ?? '');

  if (expected.length !== received.length) {
    return false;
  }

  return timingSafeEqual(expected, received);
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

export async function handleScheduledMonitoringRequest(
  request: Request,
  dependencies:
    ScheduledMonitoringHttpDependencies,
): Promise<Response> {
  const cronSecret =
    dependencies.cronSecret;

  if (!cronSecret) {
    return jsonResponse(
      {
        ok: false,
        error:
          'Scheduled monitoring is not configured.',
      },
      503,
    );
  }

  if (
    !secretsMatch(
      request.headers.get('authorization'),
      cronSecret,
    )
  ) {
    return jsonResponse(
      {
        ok: false,
        error: 'Unauthorized.',
      },
      401,
    );
  }

  const supabase =
    dependencies.createSupabase();

  if (!supabase) {
    return jsonResponse(
      {
        ok: false,
        error:
          'Scheduled monitoring database is not configured.',
      },
      503,
    );
  }

  try {
    const result =
      await dependencies.runMonitoring(
        supabase,
      );

    return jsonResponse(
      {
        ok: true,
        outcome: result.wasInserted
          ? 'inserted'
          : 'unchanged',
        revisionId: result.revisionId,
        contentHash: result.contentHash,
        taxSourceVersionId:
          result.taxSourceVersionId,
        supersedesVersionId:
          result.supersedesVersionId,
        impact: {
          ruleCandidateCount:
            result.impact.ruleCandidates.length,
          controlCandidateCount:
            result.impact.controlCandidates.length,
        },
        review: result.review
          ? {
              reviewId:
                result.review.reviewId,
              status: result.review.status,
              wasCreated:
                result.review.wasCreated,
            }
          : null,
        notification: result.notification
          ? {
              persistence: 'ready',
              notificationEventId:
                result.notification
                  .notificationEventId,
              deliveryStatus:
                result.notification
                  .deliveryStatus,
              wasCreated:
                result.notification
                  .wasCreated,
            }
          : result.notificationError
            ? {
                persistence: 'deferred',
              }
            : null,
      },
      200,
    );
  } catch (error) {
    console.error(
      'Scheduled e-Gov monitoring failed.',
      error,
    );

    return jsonResponse(
      {
        ok: false,
        error:
          'Scheduled e-Gov monitoring failed.',
      },
      500,
    );
  }
}
