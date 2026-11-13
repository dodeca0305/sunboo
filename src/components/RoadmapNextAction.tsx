import { buildRoadmapNextAction } from '@/lib/roadmapSubmissionInfo';
import type { ScheduleProcedure } from '@/lib/scheduleProcedure';

// 読み取り表示のみ。案内ページを別タブで開くだけで、保存や申告は行わない。
// label: 法人税の相談先など、ボタン文言だけを差し替える場合に使う。heading=false: 見出しを親が持つ場合。
export default function RoadmapNextAction({ procedure, label, heading = true }: {
  procedure: ScheduleProcedure; label?: string; heading?: boolean;
}) {
  const action = buildRoadmapNextAction(procedure);
  return (
    <section className="space-y-2" aria-label={heading ? '次にすること' : '相談先の案内'} data-testid="roadmap-next-action">
      {heading && <p className="text-sm font-semibold text-sunboo-ink">次にすること</p>}
      {action.href && action.buttonLabel && (
        <>
          <a
            href={action.href}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary flex min-h-11 w-full justify-center rounded-[4px] bg-sunboo-ink py-2 text-sm font-medium text-white sm:w-fit sm:px-6"
          >
            {label ?? action.buttonLabel}
          </a>
          <p className="text-xs text-sunboo-ink-muted">
            {action.sourceName && <>リンク元：{action.sourceName}／</>}別のタブで開きます
          </p>
        </>
      )}
      {!action.href && action.sourceName && <p className="text-xs text-sunboo-ink-muted">提出先：{action.sourceName}</p>}
      {action.notes.map((note) => (
        <p key={note} className="text-sm text-sunboo-ink">{note}</p>
      ))}
    </section>
  );
}
