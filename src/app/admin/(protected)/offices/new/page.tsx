import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase/server';
import { loadOfficeEditor } from '@/lib/adminOfficeData';
import OfficeForm from '../OfficeForm';
export default async function NewOfficePage() {
  const officeId = null;
  const data = await loadOfficeEditor(await createServerSupabase(), officeId);
  if (data.status === 'missing') notFound();
  if (data.status !== 'loaded')
    return (
      <div role="alert" className="card space-y-3">
        <p>
          窓口情報・管轄地域・選択肢を取得できませんでした。編集と保存を停止しています。
        </p>
        <Link
          className="btn-secondary"
          href={
            officeId === null
              ? '/admin/offices/new'
              : `/admin/offices/${officeId}`
          }
        >
          再読み込み
        </Link>
      </div>
    );
  return (
    <div className="space-y-6">
      <Link
        href="/admin/offices"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
      >
        <ChevronLeft className="h-4 w-4" />
        管轄機関一覧に戻る
      </Link>
      <h1 className="text-xl font-bold text-gray-900">管轄機関を追加</h1>
      <OfficeForm
        municipalities={data.municipalities}
        organizationTypes={data.organizationTypes}
      />
    </div>
  );
}
