import type { PlanningSources } from '@/lib/workspacePlanningData';
export default function WorkspacePlanningSources({
  sources,
}: {
  sources: PlanningSources;
}) {
  return (
    <section className="card p-4 space-y-2" aria-label="取得した登録情報">
      <h2 className="font-semibold">取得した登録情報</h2>
      <p data-testid="planning-profile">
        会社プロフィール:{' '}
        {sources.profile.status === 'loaded'
          ? `従業員 ${sources.profile.value.employeeCount}人・決算月 ${sources.profile.value.fiscalMonth ?? '未登録'}`
          : '取得できません'}
      </p>
      <p data-testid="planning-returns">
        決算実績:{' '}
        {sources.taxReturns.status === 'loaded'
          ? `${sources.taxReturns.value.entries.length}件（取得済み）`
          : '取得できません'}
      </p>
      <p data-testid="planning-statuses">
        手続き状態の登録記録:{' '}
        {sources.statuses.status === 'loaded'
          ? `${Object.keys(sources.statuses.value).length}件（取得済み）`
          : '取得できません'}
      </p>
    </section>
  );
}
