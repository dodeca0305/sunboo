import Link from 'next/link';
import { ChevronLeft, Info } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase/server';
import WorkspaceReadReloadButton from '@/components/WorkspaceReadReloadButton';
import WorkspaceCompanyForm, { type PrefectureOption } from '../WorkspaceCompanyForm';

export default async function NewWorkspaceCompanyPage() {
  const supabase = await createServerSupabase();

  if(!supabase)return <div role="alert">会社登録に接続できません。<WorkspaceReadReloadButton /></div>;
  let prefectures: PrefectureOption[] = [];
  try {
    const { data, error } = await supabase.from('prefectures').select('code, name').order('code');
    if (error || !Array.isArray(data) || data.length >= 1000 ||
        data.some(r => typeof r.code !== 'string' || typeof r.name !== 'string') ||
        new Set(data.map(r => r.code)).size !== data.length) throw Error('Prefectures unavailable');
    prefectures = data as PrefectureOption[];
  } catch {
    return <div role="alert">都道府県を取得できません。会社登録を停止しています。<WorkspaceReadReloadButton /></div>;
  }

  return (
    <div className="space-y-6">
      <Link href="/admin/workspaces" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
        <ChevronLeft className="h-4 w-4" />
        顧問先一覧に戻る
      </Link>
      <h1 className="text-xl font-bold text-gray-900">新しい会社を登録</h1>

      <div className="card flex items-start gap-3 border-gray-200 bg-gray-50/60">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
        <p className="text-xs leading-relaxed text-gray-500">
          まず顧問先の基本情報を登録します。登録後、会社情報を入力すると、年間ロードマップが
          自動作成されます。
        </p>
      </div>

      <WorkspaceCompanyForm prefectures={prefectures} />
    </div>
  );
}
