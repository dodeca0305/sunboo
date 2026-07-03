import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Server Components / Route Handlers から呼び出す、Cookieベースのセッションを持つクライアント。
// 環境変数未設定時は null を返す（公開ページの src/lib/supabase.ts と同じ方針）。
export async function createServerSupabase() {
  if (!supabaseUrl || !supabaseAnonKey) return null;

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Component からの呼び出しでは Cookie を書き込めない場合がある。
          // ミドルウェアがセッションのリフレッシュを担当するため無視してよい。
        }
      },
    },
  });
}

export type ServerSupabaseClient = NonNullable<Awaited<ReturnType<typeof createServerSupabase>>>;
