import { daysRemaining } from './adviserScore';
import type { ProcedureStatus, ScheduleProcedure } from './scheduleProcedure';

// ── Notification Engine（Sprint 9 Phase9.1 MVP）─────────────
// 役割は「期限の知らせ」のみ。AI参謀（src/lib/adviserScore.ts）が担う「何を優先すべきか／
// なぜか」という判断・理由づけは行わない。既存 ScheduleProcedure の期限情報から、
// 期限超過／7日前／3日前／当日という決まったタイミングの通知を機械的に抽出するだけの、
// スコアリングを伴わないシンプルな抽出ロジック（DB変更なし・外部送信なし・画面表示のみ）。

export type NotificationSeverity = 'overdue' | 'today' | 'in3days' | 'in7days';

export interface Notification {
  id: number;
  title: string;
  message: string;
  severity: NotificationSeverity;
  dueDate: string | null;
  office: string | null;
}

const SEVERITY_ORDER: Record<NotificationSeverity, number> = {
  overdue: 0,
  today: 1,
  in3days: 2,
  in7days: 3,
};

function severityOf(days: number): NotificationSeverity | null {
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days === 3) return 'in3days';
  if (days === 7) return 'in7days';
  return null;
}

function messageFor(severity: NotificationSeverity, days: number): string {
  switch (severity) {
    case 'overdue':
      return `期限を${Math.abs(days)}日超過しています。`;
    case 'today':
      return '本日が提出期限です。';
    case 'in3days':
      return 'あと3日で期限です。';
    case 'in7days':
      return 'あと7日で期限です。';
  }
}

type Candidate = { procedure: ScheduleProcedure; days: number; severity: NotificationSeverity };

// 通知対象の抽出（期限超過は毎日、7日前／3日前／当日は該当する日のみ発火する）。
export function buildNotifications(
  procedures: ScheduleProcedure[],
  statusMap: Record<number, ProcedureStatus>,
): Notification[] {
  const pending = procedures.filter((p) => (statusMap[p.id] ?? 'not_started') !== 'done');

  const candidates: Candidate[] = [];
  for (const p of pending) {
    const days = daysRemaining(p.next_deadline_date);
    if (days === null) continue;
    const severity = severityOf(days);
    if (!severity) continue;
    candidates.push({ procedure: p, days, severity });
  }

  candidates.sort((a, b) => {
    const r = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    return r !== 0 ? r : a.days - b.days;
  });

  return candidates.map(({ procedure, days, severity }) => ({
    id: procedure.id,
    title: procedure.name,
    message: messageFor(severity, days),
    severity,
    dueDate: procedure.next_deadline_date,
    office: procedure.office?.name ?? null,
  }));
}
