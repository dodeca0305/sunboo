import { notFound } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase/server';
import { loadWorkspaceCompany } from '@/lib/workspaceLoader';
import {
  loadWorkspaceTaxReviewItems,
  type WorkspaceTaxReviewItem,
} from '@/lib/taxIntelligence/reviewCases';
import WorkspaceTaxReviewView from '@/components/WorkspaceTaxReviewView';
import WorkspaceSubNav from '@/components/WorkspaceSubNav';
import PageHeader from '@/components/PageHeader';
import InformationCard from '@/components/InformationCard';

export default async function WorkspaceTaxReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const companyId = Number(id);
  if (!Number.isInteger(companyId)) notFound();

  const supabase = await createServerSupabase();
  if (!supabase) notFound();

  const company = await loadWorkspaceCompany(supabase, companyId);
  if (!company) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let canManage = false;

  if (user?.email) {
    const { data: memberRow } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('company_id', companyId)
      .eq('email', user.email)
      .maybeSingle();

    const role = (memberRow as { role: string } | null)?.role;
    canManage = role === 'owner' || role === 'member';
  }

  let items: WorkspaceTaxReviewItem[] = [];
  let loadError: string | null = null;

  try {
    items = await loadWorkspaceTaxReviewItems(supabase, companyId);
  } catch (error) {
    loadError = error instanceof Error ? error.message : '税務レビューの取得に失敗しました。';
  }

  const openCount = items.filter((item) => item.caseStatus === 'open').length;

  return (
    <div className="space-y-6">
      <PageHeader
        backHref={`/admin/workspaces/${companyId}`}
        backLabel={`${company.name} に戻る`}
        icon={ShieldCheck}
        title="税務レビュー"
        subtitle={`${company.name}の確認が必要な税務論点（未対応 ${openCount}件）`}
      />

      <WorkspaceSubNav companyId={companyId} />

      <InformationCard kind="disclaimer">
        Tax Intelligenceの判定結果を確認するためのレビュー画面です。
        REVIEWやUNKNOWNは税務上の問題を断定するものではなく、人による確認が必要な状態を示します。
      </InformationCard>

      {loadError ? (
        <InformationCard kind="error">{loadError}</InformationCard>
      ) : (
        <WorkspaceTaxReviewView
          companyId={companyId}
          initialItems={items}
          canManage={canManage}
        />
      )}
    </div>
  );
}
