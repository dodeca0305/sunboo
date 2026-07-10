import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, FileStack, Info } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase/server';
import type { WorkspaceDocumentType, WorkspaceDocumentStatus, WorkspaceDocumentStatusMap } from '@/lib/workspaceDocumentStatus';
import WorkspaceDocumentsView from '@/components/WorkspaceDocumentsView';

// ── Company Workspace — 書類（Sprint 26 Workspace Documents MVP）────────────
// workspace_documents（本Sprint新設）のステータス（メタデータのみ）を一覧表示・変更する。
// ファイルアップロードはスコープ外。ステータス変更自体はWorkspaceDocumentsView内で完結する
// （Server Componentである本ページからは関数propsを渡せないため、roadmap/page.tsxと同じ構成）。

export default async function WorkspaceDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const companyId = Number(id);
  if (!Number.isInteger(companyId)) notFound();

  const supabase = await createServerSupabase();
  if (!supabase) notFound();

  const { data: companyData } = await supabase
    .from('workspace_companies')
    .select('id, name')
    .eq('id', companyId)
    .maybeSingle();

  const company = companyData as { id: number; name: string } | null;
  if (!company) notFound();

  const { data: documentsData } = await supabase
    .from('workspace_documents')
    .select('document_type, status')
    .eq('company_id', companyId);

  const statusMap: WorkspaceDocumentStatusMap = {};
  for (const row of (documentsData as { document_type: WorkspaceDocumentType; status: WorkspaceDocumentStatus }[] | null) ?? []) {
    statusMap[row.document_type] = row.status;
  }

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
        <FileStack className="h-6 w-6 text-blue-600" />
        <h1 className="text-xl font-bold text-gray-900">書類 — {company.name}</h1>
      </div>

      <div className="card flex items-start gap-3 border-gray-200 bg-gray-50/60">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
        <p className="text-xs leading-relaxed text-gray-500">
          決算書・登記簿謄本等、代表的な書類の登録状況を管理する参考情報です（本MVPではファイルの
          添付は行わず、状態のみを記録します）。「要更新」はDashboardにも件数が表示されます。
        </p>
      </div>

      <WorkspaceDocumentsView companyId={companyId} statusMap={statusMap} />
    </div>
  );
}
