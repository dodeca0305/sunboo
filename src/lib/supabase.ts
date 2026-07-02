import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// 環境変数未設定時は null を返す（開発初期段階で安全に起動できるようにする）
export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

// NonNullable で変数の実際の型を参照することで createClient の型パラメータ差異を回避
export type SupabaseClient = NonNullable<typeof supabase>;
