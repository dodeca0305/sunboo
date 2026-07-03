import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Admin 画面専用のブラウザクライアント（Cookieベースのセッションを使用）。
// 環境変数未設定時は null を返す（公開ページの src/lib/supabase.ts と同じ方針）。
export function createBrowserSupabase() {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

export type BrowserSupabaseClient = NonNullable<ReturnType<typeof createBrowserSupabase>>;
