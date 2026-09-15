import { notFound } from 'next/navigation';
import { TrendingUp } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import WorkspaceSubNav from '@/components/WorkspaceSubNav';
import WorkspaceGrowthView from '@/components/WorkspaceGrowthView';
import InformationCard from '@/components/InformationCard';
import { createServerSupabase } from '@/lib/supabase/server';
import { loadWorkspaceCompany } from '@/lib/workspaceLoader';
import type { MonthlySalesEntry } from '@/lib/monthlySalesProgress';

type MonthlySalesRow = {
  year_month: string;
  target_revenue: number;
  actual_revenue: number;
  action_goal: string;
};

export default async function WorkspaceGrowthPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const companyId = Number(id);
  if (!Number.isInteger(companyId)) notFound();

  const supabase = await createServerSupabase();
  if (!supabase) notFound();
  const company = await loadWorkspaceCompany(supabase, companyId);
  if (!company) notFound();

  const { data } = await supabase
    .from('workspace_monthly_sales')
    .select('year_month, target_revenue, actual_revenue, action_goal')
    .eq('company_id', companyId)
    .order('year_month', { ascending: false });

  const entries: MonthlySalesEntry[] = ((data as MonthlySalesRow[] | null) ?? []).map((row) => ({
    yearMonth: row.year_month.slice(0, 7),
    targetRevenue: row.target_revenue,
    actualRevenue: row.actual_revenue,
    actionGoal: row.action_goal,
  }));

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
      <WorkspaceGrowthView companyId={companyId} initialEntries={entries} />
    </div>
  );
}
