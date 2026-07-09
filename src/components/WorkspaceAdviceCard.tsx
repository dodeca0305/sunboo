import { Sparkles, ListChecks, AlertTriangle, Lightbulb } from 'lucide-react';
import type { WorkspaceAdvice, WorkspaceAdviceItem } from '@/lib/workspaceAdvice';

// ── Workspace AI Adviser — 参謀カード（Sprint 24 Phase24.2）───────────
// generateWorkspaceAdvice（src/lib/workspaceAdvice.ts）の結果を表示するだけの表示コンポーネント。
// 計算・DBアクセスは行わない。チャットUIではなく、Workspaceを開いた瞬間に見える静的なカード。

function isOverdue(item: WorkspaceAdviceItem): boolean {
  return item.detail.startsWith('期限超過');
}

function AdviceItemRow({ item, tone }: { item: WorkspaceAdviceItem; tone: 'neutral' | 'amber' | 'red' }) {
  const toneClass =
    tone === 'red' ? 'text-red-700' : tone === 'amber' ? 'text-amber-700' : 'text-gray-500';
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
      <span className="font-medium text-gray-900">{item.title}</span>
      <span className={`text-xs ${toneClass}`}>{item.detail}</span>
    </li>
  );
}

export default function WorkspaceAdviceCard({ advice }: { advice: WorkspaceAdvice }) {
  return (
    <div className="card space-y-5">
      <div className="flex items-center gap-2.5">
        <Sparkles className="h-5 w-5 text-blue-600" />
        <h2 className="text-base font-bold text-gray-900">AI参謀</h2>
      </div>

      <p className="text-sm text-gray-700">{advice.summary}</p>

      {advice.warnings.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-gray-500">
            <AlertTriangle className="h-3.5 w-3.5" />
            注意事項
          </div>
          <ul className="space-y-1">
            {advice.warnings.map((item, idx) => (
              <AdviceItemRow key={`${item.procedureId}-${idx}`} item={item} tone={isOverdue(item) ? 'red' : 'amber'} />
            ))}
          </ul>
        </div>
      )}

      {advice.priority.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-gray-500">
            <ListChecks className="h-3.5 w-3.5" />
            優先して対応すること
          </div>
          <ul className="space-y-1">
            {advice.priority.map((item, idx) => (
              <AdviceItemRow key={`${item.procedureId}-${idx}`} item={item} tone="neutral" />
            ))}
          </ul>
        </div>
      )}

      {advice.opportunities.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-gray-500">
            <Lightbulb className="h-3.5 w-3.5" />
            気づき
          </div>
          <ul className="space-y-1">
            {advice.opportunities.map((item, idx) => (
              <AdviceItemRow key={`${item.procedureId ?? 'general'}-${idx}`} item={item} tone="neutral" />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
