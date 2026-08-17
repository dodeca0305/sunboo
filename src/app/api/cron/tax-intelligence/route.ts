import { createAdminSupabase } from '@/lib/supabase/admin';
import {
  handleScheduledMonitoringRequest,
} from '@/lib/taxIntelligence/scheduledMonitoringHttp';
import {
  runScheduledEgovMonitoring,
} from '@/lib/taxIntelligence/scheduledMonitoring';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
): Promise<Response> {
  return handleScheduledMonitoringRequest(
    request,
    {
      cronSecret:
        process.env.CRON_SECRET,
      createSupabase:
        createAdminSupabase,
      runMonitoring:
        runScheduledEgovMonitoring,
    },
  );
}
