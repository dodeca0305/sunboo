import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, Receipt, Info } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase/server';
import { loadTaxReturnEditor } from '@/lib/workspaceTaxReturnData';
import { workspaceRowsToTaxReturnProfile } from '@/lib/workspaceTaxReturnProfile';
import WorkspaceSubNav from '@/components/WorkspaceSubNav';
import WorkspaceTaxReturnsView from '@/components/WorkspaceTaxReturnsView';
import WorkspaceTaxReturnReloadButton from '@/components/WorkspaceTaxReturnReloadButton';

// ── Company Workspace — 決算実績（Sprint 35 Tax Return Profile）─────────────
// workspace_tax_return_profiles（Sprint35 migration）の一覧・登録・編集・削除。
// 編集専用loaderで会社・プロフィール・決算実績を取得し、失敗と正常未登録を区別する。

export default async function WorkspaceTaxReturnsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const companyId = Number(id);
  if (!Number.isSafeInteger(companyId) || companyId <= 0) notFound();
  const data = await loadTaxReturnEditor(
    await createServerSupabase(),
    companyId,
  );
  if (data.status === 'missing') notFound();
  if (data.status !== 'loaded')
    return (
      <div role="alert" className="card space-y-3">
        <p>
          決算実績または会社プロフィールを取得できませんでした。実績の有無と入力条件を確認できないため、登録・編集・保存を停止しています。
        </p>
        <WorkspaceTaxReturnReloadButton />
      </div>
    );
  const { company, companyProfile, rows } = data;
  const taxReturnProfile = workspaceRowsToTaxReturnProfile(rows);

  return (
    <div className="space-y-6">
      <Link
        href={`/admin/workspaces/${companyId}`}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
      >
        <ChevronLeft className="h-4 w-4" />
        {company.name} に戻る
      </Link>

      <div className="flex items-center gap-2.5">
        <Receipt className="h-6 w-6 text-blue-600" />
        <h1 className="text-xl font-bold text-gray-900">
          決算実績 — {company.name}
        </h1>
      </div>

      <WorkspaceSubNav companyId={companyId} />

      <div className="card flex items-start gap-3 border-gray-200 bg-gray-50/60">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
        <p className="text-xs leading-relaxed text-gray-500">
          決算のたびの申告実績（前期の確定値）を記録する一般的な参考情報です。消費税ステータス等の
          State・年間ロードマップの精度向上に使われます。申告内容の最終確認は税理士等の専門家にご確認ください。
        </p>
      </div>

      <WorkspaceTaxReturnsView
        key={JSON.stringify([rows, companyProfile])}
        companyId={companyId}
        initialEntries={taxReturnProfile.entries}
        companyProfile={companyProfile}
      />
    </div>
  );
}
