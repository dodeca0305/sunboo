import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, Receipt, Info } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase/server';
import { loadTaxReturnEditor } from '@/lib/workspaceTaxReturnData';
import { workspaceRowsToTaxReturnProfile } from '@/lib/workspaceTaxReturnProfile';
import WorkspaceTaxReturnsView from '@/components/WorkspaceTaxReturnsView';
import WorkspaceTaxReturnReloadButton from '@/components/WorkspaceTaxReturnReloadButton';
import { parseTaxReturnFocus } from '@/lib/taxReturnFocus';

// ── Company Workspace — 決算実績（Sprint 35 Tax Return Profile）─────────────
// workspace_tax_return_profiles（Sprint35 migration）の一覧・登録・編集・削除。
// 編集専用loaderで会社・プロフィール・決算実績を取得し、失敗と正常未登録を区別する。

export default async function WorkspaceTaxReturnsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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
  const initialFocus = parseTaxReturnFocus(await searchParams);

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
          過去の決算・申告情報 — {company.name}
        </h1>
      </div>


      <div className="card flex items-start gap-3 border-gray-200 bg-gray-50/60">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
        <p className="text-xs leading-relaxed text-gray-500">
          過去に提出した申告書を見ながら、決算の期間や税額などを入力します。入力した情報は、今後の手続きの案内に使われます。
          分からない項目は推測せず、申告書や税理士などの専門家に確認してください。
        </p>
      </div>

      <WorkspaceTaxReturnsView
        key={JSON.stringify([rows, companyProfile, initialFocus])}
        companyId={companyId}
        initialEntries={taxReturnProfile.entries}
        companyProfile={companyProfile}
        initialFocus={initialFocus}
      />
    </div>
  );
}
