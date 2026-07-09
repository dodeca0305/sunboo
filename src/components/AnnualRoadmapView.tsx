import type { RoadmapItem, RoadmapYear } from '@/lib/roadmap';
import type { ProcedureCategory } from '@/lib/types';

// ── 年間ロードマップ — 表示コンポーネント（Sprint 23 Phase23.3）───────────
// src/app/(site)/roadmap/page.tsx と admin/(protected)/workspaces/[id]/roadmap/page.tsx の
// 両方から使う共通の表示部分（年→月→手続き一覧のグループ化・カード表示）。
// buildAnnualRoadmap（src/lib/roadmap.ts）の結果を受け取って表示するだけで、計算は行わない。

const CATEGORY_LABEL: Record<ProcedureCategory, string> = {
  tax: '税務',
  local_tax: '地方税',
  labor: '労務',
  insurance: '社保',
  registration: '登録',
  legal: '法務・登記',
  other: 'その他',
};

const MONTH_LABEL = (m: number) => `${m}月`;

function groupByMonth(items: RoadmapItem[]): { month: number; items: RoadmapItem[] }[] {
  const byMonth = new Map<number, RoadmapItem[]>();
  for (const item of items) {
    const month = Number(item.dueDate.slice(5, 7));
    const bucket = byMonth.get(month);
    if (bucket) bucket.push(item);
    else byMonth.set(month, [item]);
  }
  return Array.from(byMonth.entries()).sort(([a], [b]) => a - b).map(([month, monthItems]) => ({ month, items: monthItems }));
}

function formatDueDate(dueDate: string): string {
  const [, m, d] = dueDate.split('-');
  return `${Number(m)}月${Number(d)}日`;
}

export default function AnnualRoadmapView({ roadmapYears }: { roadmapYears: RoadmapYear[] }) {
  return (
    <div className="space-y-10">
      {roadmapYears.map((yearBlock) => (
        <section key={yearBlock.year}>
          <h2 className="mb-4 text-lg font-bold text-gray-900">{yearBlock.year}年</h2>
          <div className="space-y-5">
            {groupByMonth(yearBlock.items).map(({ month, items }) => (
              <div key={month}>
                <h3 className="mb-2 text-sm font-semibold text-gray-500">{MONTH_LABEL(month)}</h3>
                <ul className="space-y-2">
                  {items.map((item, idx) => (
                    <li
                      key={`${item.procedure.id}-${item.dueDate}-${idx}`}
                      className="card flex flex-wrap items-center gap-2 py-3"
                    >
                      <span className="text-sm font-medium text-gray-900">{item.procedure.name}</span>
                      <span className="tag">{CATEGORY_LABEL[item.procedure.category] ?? 'その他'}</span>
                      <span className="text-xs text-gray-400">{formatDueDate(item.dueDate)}</span>
                      {item.confidence === 'estimated' && (
                        <span className="tag border-amber-200 text-amber-700">推定</span>
                      )}
                      {item.confidence === 'incomplete' && (
                        <span className="tag border-amber-200 text-amber-700">情報不足</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
