import Link from 'next/link';
import { CheckCircle2, Target } from 'lucide-react';
import {
  calculateDailyExecutionStatus,
  type DailySalesActivity,
  type RevenueModel,
} from '@/lib/monthlySalesProgress';

export default function WorkspaceTodaySalesCard({
  companyId,
  activity,
  revenueModel,
}: {
  companyId: number;
  activity: DailySalesActivity | null;
  revenueModel: RevenueModel;
}) {
  const label = revenueModel === 'sales_funnel' ? '商談' : '顧客';
  const unit = revenueModel === 'sales_funnel' ? '件' : '人・社';

  if (!activity) {
    return (
      <section className="card border-sunboo-morning-sun bg-sunboo-warm-paper">
        <div className="flex items-start gap-3">
          <Target className="mt-0.5 h-5 w-5 shrink-0 text-sunboo-morning-sun-dark" />
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-sunboo-ink">今日の売上目標</h2>
            <p className="mt-1 text-sm text-sunboo-ink-muted">今日の実行計画はまだ作られていません。</p>
            <Link className="btn-primary mt-4 inline-flex" href={`/admin/workspaces/${companyId}/growth`}>
              売上目標を設定する
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const status = calculateDailyExecutionStatus(activity);

  return (
    <section className={`card ${status.achieved
      ? 'border-sunboo-moss bg-sunboo-moss/5'
      : 'border-sunboo-morning-sun bg-sunboo-warm-paper'
    }`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          {status.achieved
            ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-sunboo-moss" />
            : <Target className="mt-0.5 h-5 w-5 shrink-0 text-sunboo-morning-sun-dark" />}
          <div>
            <p className="text-xs font-semibold text-sunboo-ink-muted">今日の売上目標</p>
            <h2 className="mt-1 text-lg font-bold text-sunboo-ink">
              {label}目標{status.target}{unit}・実績{status.actual}{unit}
            </h2>
          </div>
        </div>
        <p className={`text-xl font-bold ${status.achieved ? 'text-sunboo-moss' : 'text-sunboo-morning-sun-dark'}`}>
          {status.achieved ? '今日の目標達成' : `あと${status.remaining}${unit}`}
        </p>
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-sunboo-mist">
        <div
          className="h-full rounded-full bg-sunboo-moss"
          style={{ width: `${Math.min(status.achievementRate, 100)}%` }}
        />
      </div>
      <p className="mt-1 text-right text-xs font-semibold text-sunboo-ink-muted">達成率 {status.achievementRate}%</p>

      <div className="mt-4 border-t border-sunboo-mist pt-3">
        <p className="text-xs font-semibold text-sunboo-ink-muted">今日やる行動</p>
        <p className="mt-1 whitespace-pre-wrap text-sm font-semibold text-sunboo-ink">
          {activity.actionPlan || 'まだ入力されていません。'}
        </p>
      </div>

      <Link className="btn-secondary mt-4 inline-flex" href={`/admin/workspaces/${companyId}/growth`}>
        今日の実績を入力する
      </Link>
    </section>
  );
}
