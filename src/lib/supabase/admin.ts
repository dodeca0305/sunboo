import 'server-only';

import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL;

/*
 * 新しいSupabase secret keyを優先する。
 * 既存プロジェクト向けにlegacy service-role keyも許容する。
 *
 * どちらもRLSを迂回するため、NEXT_PUBLIC_を付けず
 * Server Component / Route Handler以外から使用しない。
 */
const supabaseSecretKey =
  process.env.SUPABASE_SECRET_KEY
  ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

export function createAdminSupabase() {
  if (!supabaseUrl || !supabaseSecretKey) {
    return null;
  }

  return createClient(
    supabaseUrl,
    supabaseSecretKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    },
  );
}

export type AdminSupabaseClient =
  NonNullable<
    ReturnType<typeof createAdminSupabase>
  >;
