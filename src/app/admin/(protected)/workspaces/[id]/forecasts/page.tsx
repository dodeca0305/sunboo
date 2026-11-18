import { notFound } from 'next/navigation';
import { LineChart } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase/server';
import { loadWorkspaceCompanyForRead } from '@/lib/workspaceHomeData';
import { readForecasts } from '@/lib/workspaceFinancialForecast';
import { proposeForecastPeriod } from '@/lib/financialForecast';
import { todayInJapan } from '@/lib/monthlySalesProgress';
import PageHeader from '@/components/PageHeader';
import InformationCard from '@/components/InformationCard';
import WorkspaceReadReloadButton from '@/components/WorkspaceReadReloadButton';
import WorkspaceFinancialForecastView from '@/components/WorkspaceFinancialForecastView';

// 決算見込（会社・年度ごとの試算）。過去の申告実績・月次・共有とは別の保存先で、他の計算には使わない。
// 会社が無ければ404。会社または見込みの取得に失敗したら、空として扱わず編集を止める。
export default async function WorkspaceForecastsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const companyId = Number(id);
  if (!Number.isInteger(companyId) || companyId <= 0) notFound();
  const supabase = await createServerSupabase();
  const companyRead = await loadWorkspaceCompanyForRead(supabase, companyId);
  if (companyRead.status === 'missing') notFound();
  const failure = (title: string) => (
    <div role="alert"><InformationCard kind="error" title={title}>通信状態をご確認のうえ、再読み込みしてください。編集は停止しています。<WorkspaceReadReloadButton /></InformationCard></div>
  );
  if (!supabase || companyRead.status !== 'loaded') return failure('会社情報を取得できません');
  const company = companyRead.company;
  const forecasts = await readForecasts(supabase, companyId);
  if (forecasts.status !== 'loaded') return failure('決算見込を取得できません');
  return (
    <div className="space-y-6">
      <PageHeader backHref={`/admin/workspaces/${companyId}`} backLabel={`${company.name} に戻る`} icon={LineChart} title="決算見込（試算）"
        subtitle={`${company.name}の将来の決算見込を、実績とは別に記録します。`} />
      <WorkspaceFinancialForecastView key={companyId} companyId={companyId} companyName={company.name} initial={forecasts.snapshots}
        proposed={proposeForecastPeriod(company.fiscal_month, todayInJapan())} />
    </div>
  );
}
