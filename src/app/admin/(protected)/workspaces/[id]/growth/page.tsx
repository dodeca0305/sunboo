import { notFound } from 'next/navigation';
import { TrendingUp } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import WorkspaceSubNav from '@/components/WorkspaceSubNav';
import WorkspaceGrowthView from '@/components/WorkspaceGrowthView';
import InformationCard from '@/components/InformationCard';
import { createServerSupabase } from '@/lib/supabase/server';
import { loadWorkspaceCompany } from '@/lib/workspaceLoader';
import { loadWorkspaceGrowthData } from '@/lib/workspaceGrowthData';

export default async function WorkspaceGrowthPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const companyId = Number(id);
  if (!Number.isInteger(companyId)) notFound();

  const supabase = await createServerSupabase();
  if (!supabase) notFound();
  const company = await loadWorkspaceCompany(supabase, companyId);
  if (!company) notFound();

  const growthData = await loadWorkspaceGrowthData(supabase, companyId);

  return (
    <div className="space-y-6">
      <PageHeader
        backHref={`/admin/workspaces/${companyId}`}
        backLabel={`${company.name} に戻る`}
        icon={TrendingUp}
        title="売上目標"
        subtitle={`${company.name}の月間目標と実績を、具体的な行動へつなげます。`}
      />
      <WorkspaceSubNav companyId={companyId} />
      <InformationCard kind="disclaimer">
        売上達成を保証する機能ではありません。実績との差を早めに把握し、経営者が行動を見直すための参考情報です。
      </InformationCard>
      {growthData.status === 'unavailable' ? (
        <InformationCard kind="error" title="売上目標データを読み込めませんでした">
          <p role="alert">
            月次・週次・日次実績、または納税予定を取得できませんでした。
            既存の情報を保護するため、編集・保存を停止しています。時間をおいて再読み込みしてください。
          </p>
          <a href={`/admin/workspaces/${companyId}/growth`} className="btn-secondary mt-3">
            再読み込み
          </a>
        </InformationCard>
      ) : (
        <WorkspaceGrowthView
          companyId={companyId}
          initialEntries={growthData.entries}
          initialWeeklyActivities={growthData.weeklyActivities}
          initialDailyActivities={growthData.dailyActivities}
          linkedTaxPaymentsByMonth={growthData.linkedTaxPaymentsByMonth}
        />
      )}
    </div>
  );
}
