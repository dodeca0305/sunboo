import Link from 'next/link';
import WorkspaceReadReloadButton from '@/components/WorkspaceReadReloadButton';
import type { WorkspaceFirstStep as FirstStep } from '@/lib/workspaceFirstStep';

const BUTTON_LABEL = {
  urgent: '急ぐ対応を開く',
  profile: '入力を始める',
  action: '対応を開く',
  roadmap: 'ロードマップを見る',
} as const;

export default function WorkspaceFirstStep({ step }: { step: FirstStep }) {
  if (step.kind === 'unavailable') {
    return (
      <section className="card space-y-3 py-6" data-testid="home-first-step" data-kind="unavailable" aria-label="最初の一歩">
        <h2 className="text-lg font-semibold text-sunboo-ink">必要な情報を取得できません</h2>
        <p className="text-sm text-sunboo-ink-muted">最初に行うことは、まだ決められません。</p>
        <WorkspaceReadReloadButton />
      </section>
    );
  }
  return (
    <section className="card space-y-3 py-6" data-testid="home-first-step" data-kind={step.kind} aria-label="最初の一歩">
      <p className="text-xs font-semibold text-sunboo-ink-muted">{step.kind === 'urgent' ? '急ぐ対応' : '最初の一歩'}</p>
      <h2 className="text-lg font-semibold text-sunboo-ink">{step.title}</h2>
      <p className="text-sm text-sunboo-ink-muted">{step.reason}</p>
      {/* 共通のbtn-primary色は変えず、このボタンだけ既存トークンで黒にする */}
      <Link href={step.href} className="btn-primary flex w-full justify-center bg-sunboo-ink py-3 text-base text-white sm:w-fit sm:px-8">
        {BUTTON_LABEL[step.kind]}
      </Link>
    </section>
  );
}
