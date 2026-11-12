import { procedureCompletionGuide } from '@/lib/procedureCompletionGuide';

// 非操作の静的表示。状態・保存・通信を持たない。補足はnative details/summary（初期閉）。
export default function ProcedureCompletionGuide({ code }: { code: string }) {
  const guide = procedureCompletionGuide(code);
  if (guide.kind === 'unconfirmed') {
    return (
      <div className="sm:col-span-2" data-testid="procedure-completion-guide" data-kind={guide.kind}>
        <dt className="mb-1 font-semibold text-sunboo-ink-muted">{guide.heading}</dt>
        <dd>
          <p className="mb-1">{guide.intro}</p>
          <ul className="list-disc space-y-1 pl-5">
            {guide.questions.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </dd>
      </div>
    );
  }
  return (
    <div className="sm:col-span-2" data-testid="procedure-completion-guide" data-kind={guide.kind}>
      <dt className="mb-3 font-semibold text-sunboo-ink-muted">{guide.heading}</dt>
      <dd className="grid grid-cols-1 gap-x-10 gap-y-5 py-2 sm:grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]">
        {guide.steps.map((step) => (
          <details key={step.title} data-testid="completion-step" className="min-w-0">
            <summary className="block cursor-pointer list-none rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current [&::-webkit-details-marker]:hidden">
              <span className="block break-words text-xl font-semibold text-sunboo-ink">{step.title}</span>
              {step.condition && (
                <span data-testid="completion-condition" className="mt-1 block break-words text-sm text-sunboo-ink-muted">{step.condition}</span>
              )}
              <span className="mt-2 inline-block text-sm text-sunboo-ink-muted underline underline-offset-4">確認すること</span>
            </summary>
            <p className="mt-2 break-words text-sm">{step.note}</p>
          </details>
        ))}
      </dd>
    </div>
  );
}
