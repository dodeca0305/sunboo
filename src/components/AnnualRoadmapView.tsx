'use client';

import { useState } from 'react';
import type { RoadmapItem, RoadmapYear } from '@/lib/roadmap';
import type { ProcedureCategory } from '@/lib/types';
import {
  WORKSPACE_PROCEDURE_STATUS_LABEL, WORKSPACE_PROCEDURE_STATUSES,
  type WorkspaceProcedureStatus, type WorkspaceProcedureStatusMap,
} from '@/lib/workspaceProcedureStatus';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { AlertTriangle } from 'lucide-react';

// ── 年間ロードマップ — 表示コンポーネント（Sprint 23 Phase23.3・Sprint 24 Phase24.1）───
// src/app/(site)/roadmap/page.tsx と admin/(protected)/workspaces/[id]/roadmap/page.tsx・
// src/app/share/[token]/page.tsx の3箇所から使う共通の表示部分
// （年→月→手続き一覧のグループ化・カード表示）。buildAnnualRoadmap（src/lib/roadmap.ts）の
// 結果を受け取って表示するだけで、Roadmap自体の計算は行わない（Engine無変更）。
//
// 【Sprint24.1で追加】statusMap・companyIdはいずれも省略可能。
// - 両方省略（(site)/roadmap の既存呼び出し）: 従来通りステータス表示なし
// - statusMapのみ指定（/share/[token]）: 読み取り専用でステータスを表示（編集不可）
// - 両方指定（Workspace管理画面）: クリックでステータス変更可能。変更は内部で
//   workspace_procedure_statuses（Sprint24.1新設）にupsertする
//
// 'use client' が必要な理由: ステータス変更の onChange ハンドラを持つため
// （Server Componentは関数propsを子に渡せないため、更新ロジック自体をこのコンポーネント内に持つ）。

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

export default function AnnualRoadmapView({
  roadmapYears,
  statusMap,
  companyId,
}: {
  roadmapYears: RoadmapYear[];
  statusMap?: WorkspaceProcedureStatusMap;
  companyId?: number;
}) {
  const [localStatusMap, setLocalStatusMap] = useState<WorkspaceProcedureStatusMap>(statusMap ?? {});
  const [statusError, setStatusError] = useState<string | null>(null);
  const editable = statusMap !== undefined && companyId !== undefined;

  async function handleStatusChange(procedureId: number, status: WorkspaceProcedureStatus) {
    if (!companyId) return;
    const previous = localStatusMap[procedureId] ?? 'not_started';
    setLocalStatusMap((prev) => ({ ...prev, [procedureId]: status })); // 楽観的更新
    setStatusError(null);

    const supabase = createBrowserSupabase();
    if (!supabase) return;
    const { error } = await supabase
      .from('workspace_procedure_statuses')
      .upsert({ company_id: companyId, procedure_id: procedureId, status }, { onConflict: 'company_id,procedure_id' });

    if (error) {
      // 保存に失敗した場合は表示を元に戻す（DB未反映のまま見た目だけ変わった状態にしない）
      setLocalStatusMap((prev) => ({ ...prev, [procedureId]: previous }));
      setStatusError(`保存に失敗しました: ${error.message}`);
    }
  }

  return (
    <div className="space-y-10">
      {statusError && (
        <div className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {statusError}
        </div>
      )}
      {roadmapYears.map((yearBlock) => (
        <section key={yearBlock.year}>
          <h2 className="mb-4 text-lg font-bold text-gray-900">{yearBlock.year}年</h2>
          <div className="space-y-5">
            {groupByMonth(yearBlock.items).map(({ month, items }) => (
              <div key={month}>
                <h3 className="mb-2 text-sm font-semibold text-gray-500">{MONTH_LABEL(month)}</h3>
                <ul className="space-y-2">
                  {items.map((item, idx) => {
                    const status = localStatusMap[item.procedure.id] ?? 'not_started';
                    return (
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
                        {statusMap && editable && (
                          <select
                            value={status}
                            onChange={(e) => handleStatusChange(item.procedure.id, e.target.value as WorkspaceProcedureStatus)}
                            className="form-select ml-auto w-auto py-1 text-xs"
                          >
                            {WORKSPACE_PROCEDURE_STATUSES.map((s) => (
                              <option key={s} value={s}>{WORKSPACE_PROCEDURE_STATUS_LABEL[s]}</option>
                            ))}
                          </select>
                        )}
                        {statusMap && !editable && (
                          <span className="tag ml-auto">{WORKSPACE_PROCEDURE_STATUS_LABEL[status]}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
