import { procedureCompletionGuide } from '@/lib/procedureCompletionGuide';

// 非操作の静的表示。状態・保存・通信を持たない。
export default function ProcedureCompletionGuide({ code }: { code: string }) {
  const guide = procedureCompletionGuide(code);
  const items = guide.kind === 'unconfirmed' ? guide.questions : guide.lines;
  return (
    <div className="sm:col-span-2" data-testid="procedure-completion-guide" data-kind={guide.kind}>
      <dt className="mb-1 font-semibold text-sunboo-ink-muted">{guide.heading}</dt>
      <dd>
        {guide.kind === 'unconfirmed' && <p className="mb-1">{guide.intro}</p>}
        <ul className="list-disc space-y-1 pl-5">
          {items.map((line) => <li key={line}>{line}</li>)}
        </ul>
      </dd>
    </div>
  );
}
