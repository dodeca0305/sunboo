import { notFound } from 'next/navigation';
import { FileStack } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase/server';
import { loadWorkspaceCompany, loadWorkspaceDocumentStatuses } from '@/lib/workspaceLoader';
import WorkspaceDocumentsView from '@/components/WorkspaceDocumentsView';
import WorkspaceSubNav from '@/components/WorkspaceSubNav';
import PageHeader from '@/components/PageHeader';
import InformationCard from '@/components/InformationCard';
import { WORKSPACE_DOCUMENT_TYPES } from '@/lib/workspaceDocumentStatus';

// ── Company Workspace — 書類（Sprint 26 Workspace Documents MVP・Sprint 34・Sprint 85）───────
// workspace_documents（Sprint26新設）のステータス（メタデータのみ）を一覧表示・変更する。
// ファイルアップロードはスコープ外。ステータス変更自体はWorkspaceDocumentsView内で完結する
// （Server Componentである本ページからは関数propsを渡せないため、roadmap/page.tsxと同じ構成）。
// 【Sprint34でデータ取得を共通化】company取得・書類ステータス取得をsrc/lib/workspaceLoader.ts
// （loadWorkspaceCompany・loadWorkspaceDocumentStatuses）へ切り出した。
// 【Sprint85で追加】「単なる一覧」ではなく「今年提出した書類の記録」であることが伝わるよう、
// 既存statusMapから登録済み件数を数えるだけの表示専用の集計を追加した（新しいDB問い合わせ・
// 新しいステータス種別は追加していない）。

export default async function WorkspaceDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const companyId = Number(id);
  if (!Number.isInteger(companyId)) notFound();

  const supabase = await createServerSupabase();
  if (!supabase) notFound();

  const company = await loadWorkspaceCompany(supabase, companyId);
  if (!company) notFound();

  const { statusMap } = await loadWorkspaceDocumentStatuses(supabase, companyId);
  const registeredCount = WORKSPACE_DOCUMENT_TYPES.filter((t) => statusMap[t] === 'registered').length;

  return (
    <div className="space-y-6">
      <PageHeader
        backHref={`/admin/workspaces/${companyId}`}
        backLabel={`${company.name} に戻る`}
        icon={FileStack}
        title="今年提出した書類"
        subtitle={`${company.name}の代表的な書類の登録状況（${registeredCount}/${WORKSPACE_DOCUMENT_TYPES.length}件登録済み）`}
      />

      <WorkspaceSubNav companyId={companyId} />

      <InformationCard kind="disclaimer">
        決算書・登記簿謄本等、代表的な書類の登録状況を記録する参考情報です（本MVPではファイルの
        添付は行わず、状態のみを記録します）。「要更新」はDashboardにも件数が表示されます。
      </InformationCard>

      <WorkspaceDocumentsView companyId={companyId} statusMap={statusMap} />
    </div>
  );
}
