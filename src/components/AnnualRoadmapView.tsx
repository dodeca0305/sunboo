'use client';

import { useState } from 'react';
import type { RoadmapItem, RoadmapYear } from '@/lib/roadmap';
import type { ProcedureCategory } from '@/lib/types';
import {
  WORKSPACE_PROCEDURE_STATUS_LABEL, WORKSPACE_PROCEDURE_STATUSES, workspaceProcedureOccurrenceKey,
  type WorkspaceProcedureStatus, type WorkspaceProcedureStatusMap,
} from '@/lib/workspaceProcedureStatus';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { buildRoadmapSubmissionInfo } from '@/lib/roadmapSubmissionInfo';
import { buildRoadmapDocumentItems, hasAnyRoadmapDocumentItems } from '@/lib/roadmapDocuments';
import { AlertTriangle, Building2, ExternalLink } from 'lucide-react';

// ── 年間ロードマップ — 表示コンポーネント（Sprint 23 Phase23.3・Sprint 24 Phase24.1・Sprint 32）───
// src/app/(site)/roadmap/page.tsx と admin/(protected)/workspaces/[id]/roadmap/page.tsx・
// src/app/share/[token]/page.tsx の3箇所から使う共通の表示部分
// （年→月→手続き一覧のグループ化・カード表示）。buildAnnualRoadmap（src/lib/roadmap.ts）の
// 結果を受け取って表示するだけで、Roadmap自体の計算は行わない（Engine無変更）。
//
// 【Sprint24.1で追加】statusMap・companyIdはいずれも省略可能。
// - 両方省略（(site)/roadmap の既存呼び出し）: 従来通りステータス表示なし
// - statusMapのみ指定（/share/[token]）: 読み取り専用でステータスを表示（編集不可）
// - 両方指定（Workspace管理画面）: クリックでステータス変更可能。変更は内部で
//   workspace_procedure_statuses にupsertする
//
// 【Sprint32で出現回単位に変更】statusMapのキーはprocedure_idのみから
// workspaceProcedureOccurrenceKey(procedureId, dueDate)へ変更した。同じ手続きが複数年・
// 複数回出現する場合（毎月納付・毎年申告等）に、出現ごとに独立した状態を持てるようにするため
// （docs/PERIODIC_STATUS_REDESIGN.md、Sprint31設計レビューで承認済み）。
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

  async function handleStatusChange(procedureId: number, dueDate: string, status: WorkspaceProcedureStatus) {
    if (!companyId) return;
    const key = workspaceProcedureOccurrenceKey(procedureId, dueDate);
    const previous = localStatusMap[key] ?? 'not_started';
    setLocalStatusMap((prev) => ({ ...prev, [key]: status })); // 楽観的更新
    setStatusError(null);

    const supabase = createBrowserSupabase();
    if (!supabase) return;
    const { error } = await supabase
      .from('workspace_procedure_statuses')
      .upsert(
        { company_id: companyId, procedure_id: procedureId, occurrence_key: dueDate, status },
        { onConflict: 'company_id,procedure_id,occurrence_key' },
      );

    if (error) {
      // 保存に失敗した場合は表示を元に戻す（DB未反映のまま見た目だけ変わった状態にしない）
      setLocalStatusMap((prev) => ({ ...prev, [key]: previous }));
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
                    const status = localStatusMap[workspaceProcedureOccurrenceKey(item.procedure.id, item.dueDate)] ?? 'not_started';
                    const submission = buildRoadmapSubmissionInfo(item.procedure);
                    const docGroups = buildRoadmapDocumentItems(item.procedure);
                    const hasDocGuide = hasAnyRoadmapDocumentItems(docGroups);
                    return (
                      <li
                        key={`${item.procedure.id}-${item.dueDate}-${idx}`}
                        className="card space-y-2 py-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
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
                              onChange={(e) => handleStatusChange(item.procedure.id, item.dueDate, e.target.value as WorkspaceProcedureStatus)}
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
                        </div>

                        {submission.officeName === null ? (
                          <p className="pl-0 text-xs text-gray-400">提出先情報は未登録です</p>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                            <span className="inline-flex items-center gap-1">
                              <Building2 className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                              提出先: {submission.officeName}
                            </span>
                            {submission.url && (
                              <a
                                href={submission.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn-secondary inline-flex items-center gap-1 px-2.5 py-1 text-xs"
                              >
                                {submission.label}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                            {submission.url && submission.urlStatus === 'unchecked' && (
                              <span className="text-[10px] text-gray-400">（リンク未確認）</span>
                            )}
                            {submission.submissionMethods.map((m) => (
                              <span key={m} className="tag">{m}</span>
                            ))}
                          </div>
                        )}

                        {hasDocGuide && (
                          <div className="space-y-1 border-t border-gray-100 pt-2 text-xs text-gray-500">
                            {docGroups.documents.length > 0 && (
                              <p>
                                <span className="font-medium text-gray-600">必要書類: </span>
                                {docGroups.documents.map((d) => `${d.name}${d.isRequired ? '' : '（任意）'}`).join('、')}
                              </p>
                            )}
                            {docGroups.preparations.length > 0 && (
                              <p>
                                <span className="font-medium text-gray-600">事前準備: </span>
                                {docGroups.preparations.map((d) => d.name).join('、')}
                              </p>
                            )}
                            {docGroups.checklist.length > 0 && (
                              <p>
                                <span className="font-medium text-gray-600">提出前チェック: </span>
                                {docGroups.checklist.map((d) => d.name).join('、')}
                              </p>
                            )}
                          </div>
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
