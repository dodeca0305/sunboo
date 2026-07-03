import { createServerSupabase } from './supabase/server';

export type AdminSession = {
  email: string;
  name: string | null;
};

// 現在のログインユーザーが admin_users に登録されているかを確認する。
// 未ログイン・未登録・Supabase未設定のいずれの場合も null を返す。
export async function getAdminSession(): Promise<AdminSession | null> {
  const supabase = await createServerSupabase();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const { data } = await supabase
    .from('admin_users')
    .select('email, name')
    .eq('email', user.email)
    .maybeSingle();

  if (!data) return null;

  return { email: (data as { email: string }).email, name: (data as { name: string | null }).name };
}
