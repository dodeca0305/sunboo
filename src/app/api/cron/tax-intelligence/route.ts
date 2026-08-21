import { createAdminSupabase } from '@/lib/supabase/admin';
import {
  handleScheduledMonitoringRequest,
} from '@/lib/taxIntelligence/scheduledMonitoringHttp';
import {
  runScheduledEgovMonitoring,
} from '@/lib/taxIntelligence/scheduledMonitoring';
import {
  deliverNextTaxSourceChangeEmail,
} from '@/lib/taxIntelligence/taxSourceEmailDelivery';
import type {
  ResendTaxSourceEmailConfig,
} from '@/lib/taxIntelligence/resendTaxSourceEmail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function emailConfig():
  ResendTaxSourceEmailConfig | undefined {
  const apiKey =
    process.env.RESEND_API_KEY;
  const from =
    process.env
      .TAX_NOTIFICATION_EMAIL_FROM;
  const to =
    process.env
      .TAX_NOTIFICATION_EMAIL_TO;
  const appBaseUrl =
    process.env
      .TAX_NOTIFICATION_APP_BASE_URL;

  if (
    !apiKey ||
    !from ||
    !to ||
    !appBaseUrl
  ) {
    return undefined;
  }

  return {
    apiKey,
    from,
    to,
    appBaseUrl,
  };
}

export async function GET(
  request: Request,
): Promise<Response> {
  const configuredEmail =
    emailConfig();

  return handleScheduledMonitoringRequest(
    request,
    {
      cronSecret:
        process.env.CRON_SECRET,
      createSupabase:
        createAdminSupabase,
      runMonitoring:
        runScheduledEgovMonitoring,
      ...(configuredEmail
        ? {
            deliverEmail:
              deliverNextTaxSourceChangeEmail,
            emailConfig:
              configuredEmail,
          }
        : {}),
    },
  );
}
