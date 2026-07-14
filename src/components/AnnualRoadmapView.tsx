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
import { buildRoadmapDocumentItems, hasAnyRoadmapDocumentItems, type RoadmapDocumentItem } from '@/lib/roadmapDocuments';
import { AlertTriangle, Building2, ExternalLink, Info, Square } from 'lucide-react';
import StatusBadge from '@/components/StatusBadge';

// ── 年間ロードマップ — 表示コンポーネント（Sprint 23 Phase23.3・Sprint 24 Phase24.1・Sprint 32・Sprint 84）───
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
// 【Sprint84で再設計】カードの情報優先順位を「期限→手続き名→提出先→提出方法→公式ページ→
// 必要書類→事前準備→提出前チェック→Status→Confidence→補足・注意事項」に統一し、
// SUNBOO Design Tokens（src/styles/tokens.css）に接続した。データの並び順・グルーピング・
// Engine呼び出しは一切変更していない（docs/SUNBOO_ROADMAP_CARD_REDESIGN_REVIEW.md参照）。
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

// 表示専用の日付分解・相対日数計算（Roadmap Engineの期限計算そのものには一切関与しない）。
function dueMonthDay(dueDate: string): { month: number; day: number } {
  const [, m, d] = dueDate.split('-');
  return { month: Number(m), day: Number(d) };
}

function daysUntil(dueDate: string): number {
  const target = new Date(`${dueDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

type UrgencyTone = 'overdue' | 'urgent' | 'neutral';

// 「Dangerは期限超過だけ」「MorningSunは現在地・近日期限の補助に限定」というSUNBOO_DESIGN_GUIDELINES.md
// §4のルールをそのまま反映する。しきい値14日はScheduleList.tsxのRemainingBadgeと同じ基準を踏襲した。
function urgencyOf(days: number): { tone: UrgencyTone; label: string } {
  if (days < 0) return { tone: 'overdue', label: '期限超過' };
  if (days === 0) return { tone: 'urgent', label: '本日締切' };
  if (days <= 14) return { tone: 'urgent', label: `あと${days}日` };
  return { tone: 'neutral', label: `あと${days}日` };
}

const URGENCY_TONE_CLASS: Record<UrgencyTone, string> = {
  overdue: 'text-sunboo-danger',
  urgent: 'text-sunboo-morning-sun-dark',
  neutral: 'text-sunboo-ink-muted',
};

// カード内の小見出し（提出先・必要書類・事前準備・提出前チェック・確からしさ等）で共通利用する
// ラベル。Tiny Tokenをそのまま使い、新しいタイポグラフィスケールを追加しない。
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sunboo-tiny uppercase text-sunboo-ink-muted">{children}</p>
  );
}

// 期限カラム（Desktop:左／Mobile:上部）。日を最大表示、月は小さく補助表示する。
// 年は年セクション見出し（後述）で既に示しているため、カード側では繰り返さない
// （「年は必要な場合のみ補助表示」に該当する曖昧さがこのコンポーネントの使い方では生じないため）。
function DeadlineColumn({ dueDate }: { dueDate: string }) {
  const { month, day } = dueMonthDay(dueDate);
  const days = daysUntil(dueDate);
  const { tone, label } = urgencyOf(days);
  return (
    <div
      role="group"
      aria-label={`期限 ${month}月${day}日、${label}`}
      className="flex shrink-0 items-center justify-between gap-3 border-b border-sunboo-mist px-4 py-3 sm:w-24 sm:flex-col sm:items-start sm:justify-start sm:gap-1.5 sm:border-b-0 sm:border-r sm:px-4 sm:py-5"
    >
      <div aria-hidden="true" className="flex items-baseline gap-1.5 sm:flex-col sm:items-start sm:gap-0">
        <span className="text-sunboo-tiny uppercase text-sunboo-ink-muted">{month}月</span>
        <span className="text-sunboo-section-title text-sunboo-ink">{day}</span>
      </div>
      <span aria-hidden="true" className={`inline-flex items-center gap-1 text-xs font-semibold ${URGENCY_TONE_CLASS[tone]}`}>
        {tone === 'overdue' && <AlertTriangle className="h-3 w-3 shrink-0" />}
        {label}
      </span>
    </div>
  );
}

// 必要書類・事前準備・提出前チェックの共通表示。折りたたまず初期表示し、
// 「□」は装飾のみ（aria-hidden）とすることで、操作可能なチェックボックスだと誤認させない。
function DocumentGroup({ label, items }: { label: string; items: RoadmapDocumentItem[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <ul className="mt-1.5 space-y-1">
        {items.map((d, idx) => (
          <li key={`${d.name}-${idx}`} className="flex items-start gap-2 text-sm text-sunboo-ink">
            <Square aria-hidden="true" strokeWidth={2.25} className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sunboo-mist" />
            <span>
              {d.name}
              {!d.isRequired && <span className="text-sunboo-ink-muted">（任意）</span>}
              {d.notes && <span className="text-sunboo-ink-muted">　{d.notes}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
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
          <h2 className="text-sunboo-section-title mb-4 text-sunboo-ink">{yearBlock.year}年</h2>
          <div className="space-y-6">
            {groupByMonth(yearBlock.items).map(({ month, items }) => (
              <div key={month}>
                <h3 className="text-sunboo-tiny mb-2 uppercase text-sunboo-ink-muted">{MONTH_LABEL(month)}</h3>
                <ul className="space-y-3">
                  {items.map((item, idx) => {
                    const status = localStatusMap[workspaceProcedureOccurrenceKey(item.procedure.id, item.dueDate)] ?? 'not_started';
                    const submission = buildRoadmapSubmissionInfo(item.procedure);
                    const docGroups = buildRoadmapDocumentItems(item.procedure);
                    const hasDocGuide = hasAnyRoadmapDocumentItems(docGroups);
                    const isConfidenceLow = item.confidence === 'estimated' || item.confidence === 'incomplete';

                    return (
                      <li
                        key={`${item.procedure.id}-${item.dueDate}-${idx}`}
                        className="card overflow-hidden p-0 break-inside-avoid"
                      >
                        <div className="flex flex-col sm:flex-row">
                          {/* 1. 期限（最も目立つ情報。Desktop:左カラム／Mobile:上部） */}
                          <DeadlineColumn dueDate={item.dueDate} />

                          <div className="min-w-0 flex-1 space-y-4 px-4 py-4 sm:py-5">
                            {/* 2. 手続き名（日本語主表示。英語名フィールドは現行データモデルに存在しないため
                                補助表示は未実装 — docs/SUNBOO_ROADMAP_CARD_REDESIGN_REVIEW.md参照） */}
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-sunboo-card-title text-sunboo-ink">
                                {item.procedure.name}
                              </h4>
                              <span className="tag">{CATEGORY_LABEL[item.procedure.category] ?? 'その他'}</span>
                            </div>

                            {/* 3〜5. 提出先／提出方法／公式ページ */}
                            <div>
                              <SectionLabel>提出先</SectionLabel>
                              {submission.officeName === null ? (
                                <p className="mt-1 text-sm text-sunboo-ink-muted">提出先情報は未登録です</p>
                              ) : (
                                <div className="mt-1 space-y-2">
                                  <p className="flex items-center gap-1.5 text-sm text-sunboo-ink">
                                    <Building2 className="h-3.5 w-3.5 shrink-0 text-sunboo-ink-muted" aria-hidden="true" />
                                    {submission.officeName}
                                  </p>
                                  {submission.submissionMethods.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                      {submission.submissionMethods.map((m) => (
                                        <span key={m} className="tag">{m}</span>
                                      ))}
                                    </div>
                                  )}
                                  {submission.url && (
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <a
                                        href={submission.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="btn-secondary inline-flex min-h-11 items-center gap-1 px-2.5 py-1 text-xs sm:min-h-0"
                                      >
                                        {submission.label}
                                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                                      </a>
                                      {submission.urlStatus === 'unchecked' && (
                                        <span className="text-xs text-sunboo-ink-muted">（リンク未確認）</span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* 6〜8. 必要書類／事前準備／提出前チェック（同じデータソース、見出しを分けて表示） */}
                            {hasDocGuide && (
                              <div className="space-y-3 border-t border-sunboo-mist pt-3">
                                <DocumentGroup label="必要書類" items={docGroups.documents} />
                                <DocumentGroup label="事前準備" items={docGroups.preparations} />
                                <DocumentGroup label="提出前チェック" items={docGroups.checklist} />
                              </div>
                            )}

                            {/* 9. Status（StatusBadgeのみ使用。期限・手続き名より視覚的に弱く保つ） */}
                            {statusMap && (
                              <div className="border-t border-sunboo-mist pt-3">
                                <SectionLabel>ステータス</SectionLabel>
                                <div className="mt-1.5">
                                  {editable ? (
                                    <select
                                      value={status}
                                      aria-label={`${item.procedure.name}のステータス`}
                                      onChange={(e) => handleStatusChange(item.procedure.id, item.dueDate, e.target.value as WorkspaceProcedureStatus)}
                                      className="form-select min-h-11 w-auto py-1 text-xs sm:min-h-0"
                                    >
                                      {WORKSPACE_PROCEDURE_STATUSES.map((s) => (
                                        <option key={s} value={s}>{WORKSPACE_PROCEDURE_STATUS_LABEL[s]}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <StatusBadge kind={status} />
                                  )}
                                </div>
                              </div>
                            )}

                            {/* 10. Confidence（補助情報として控えめに。推測はせず、既存の一般的な説明のみ表示） */}
                            {isConfidenceLow && (
                              <div className="border-t border-sunboo-mist pt-3">
                                <SectionLabel>確からしさ</SectionLabel>
                                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                  <StatusBadge kind={item.confidence === 'estimated' ? 'estimated' : 'info_missing'} />
                                </div>
                                {item.confidence === 'incomplete' && (
                                  <p className="mt-1 text-xs leading-relaxed text-sunboo-ink-muted">
                                    プロフィールや決算情報の入力状況によって内容が変わる可能性があります。
                                  </p>
                                )}
                              </div>
                            )}

                            {/* 11. 補足・注意事項（本文末尾の控えめなNotice。カード全体は着色しない） */}
                            {(item.procedure.target_note || item.procedure.caution_note) && (
                              <div className="space-y-2 border-t border-sunboo-mist pt-3 text-xs leading-relaxed text-sunboo-ink-muted">
                                {item.procedure.target_note && (
                                  <p>
                                    <span className="font-medium text-sunboo-ink">対象：</span>
                                    {item.procedure.target_note}
                                  </p>
                                )}
                                {item.procedure.caution_note && (
                                  <p className="flex items-start gap-1.5">
                                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                    <span>{item.procedure.caution_note}</span>
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
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
