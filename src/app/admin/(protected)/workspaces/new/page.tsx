import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase/server';
import WorkspaceCompanyForm, { type PrefectureOption } from '../WorkspaceCompanyForm';

export default async function NewWorkspaceCompanyPage() {
  const supabase = await createServerSupabase();

  let prefectures: PrefectureOption[] = [];
  if (supabase) {
    const { data } = await supabase.from('prefectures').select('code, name').order('code');
    prefectures = (data as PrefectureOption[] | null) ?? [];
  }

  return (
    <div className="space-y-6">
      <Link href="/admin/workspaces" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
        <ChevronLeft className="h-4 w-4" />
        顧問先一覧に戻る
      </Link>
      <h1 className="text-xl font-bold text-gray-900">新しい会社を登録</h1>
      <WorkspaceCompanyForm prefectures={prefectures} />
    </div>
  );
}
