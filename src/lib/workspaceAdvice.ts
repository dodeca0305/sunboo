import type { RoadmapItem, RoadmapYear } from './roadmap';
import type { CompanyState } from './state';
import type { WorkspaceProcedureStatus, WorkspaceProcedureStatusMap } from './workspaceProcedureStatus';
import type { ProcedureCategory } from './types';

// ── Workspace AI Adviser — ルールベースMVP（Sprint 24 Phase24.2）─────────
// Advice = f( Annual Roadmap, Procedure Status, State )。既存Engine（診断エンジン・State Engine・
// Annual Roadmap Engine）の出力をそのまま入力として受け取り、新たな計算・DBアクセスは一切行わない
// 純粋関数。LLMは呼ばない（将来のAI置き換えに備え、入出力の形だけ先に固定する）。
//
// Roadmapは同じ手続きが複数年・複数回（毎月納付等）出現するため、判断材料には手続きごとの
// 最も近い1回（nearestByProcedure）のみを使う。

export type WorkspaceAdviceItem = {
  procedureId?: number;
  title: string;
  category?: ProcedureCategory;
  dueDate: string | null;
  detail: string;
};

export type WorkspaceAdvice = {
  priority: WorkspaceAdviceItem[];
  warnings: WorkspaceAdviceItem[];
  opportunities: WorkspaceAdviceItem[];
  summary: string;
};

const PRIORITY_WINDOW_DAYS = 30;
const URGENT_WINDOW_DAYS = 3;
const INCOMPLETE_LOOKAHEAD_DAYS = 90;
const PRIORITY_MAX_ITEMS = 5;

function daysUntil(dueDate: string, today: Date): number {
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const due = new Date(`${dueDate}T00:00:00`);
  return Math.round((due.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDueDate(dueDate: string): string {
  const [, m, d] = dueDate.split('-');
  return `${Number(m)}月${Number(d)}日`;
}

function statusOf(item: RoadmapItem, statusMap: WorkspaceProcedureStatusMap): WorkspaceProcedureStatus {
  return statusMap[item.procedure.id] ?? 'not_started';
}

// 同じ手続きが複数年・複数回出現する中から、手続きごとに最も近い1回だけを判断材料にする
function nearestOccurrencePerProcedure(roadmapYears: RoadmapYear[]): RoadmapItem[] {
  const sorted = roadmapYears.flatMap((y) => y.items).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const nearest = new Map<number, RoadmapItem>();
  for (const item of sorted) {
    if (!nearest.has(item.procedure.id)) nearest.set(item.procedure.id, item);
  }
  return Array.from(nearest.values()).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function generateWorkspaceAdvice(
  roadmapYears: RoadmapYear[],
  statusMap: WorkspaceProcedureStatusMap,
  state: CompanyState,
  today: Date = new Date(),
): WorkspaceAdvice {
  const priority: WorkspaceAdviceItem[] = [];
  const warnings: WorkspaceAdviceItem[] = [];
  const opportunities: WorkspaceAdviceItem[] = [];

  for (const item of nearestOccurrencePerProcedure(roadmapYears)) {
    const status = statusOf(item, statusMap);
    if (status === 'done') continue;
    const diff = daysUntil(item.dueDate, today);

    if (diff <= URGENT_WINDOW_DAYS) {
      const detail =
        diff < 0 ? `期限超過（${formatDueDate(item.dueDate)}）` : diff === 0 ? '本日が期限' : `あと${diff}日（${formatDueDate(item.dueDate)}）`;
      warnings.push({ procedureId: item.procedure.id, title: item.procedure.name, category: item.procedure.category, dueDate: item.dueDate, detail });
    } else if (diff <= PRIORITY_WINDOW_DAYS) {
      priority.push({
        procedureId: item.procedure.id,
        title: item.procedure.name,
        category: item.procedure.category,
        dueDate: item.dueDate,
        detail: `あと${diff}日（${formatDueDate(item.dueDate)}が期限）`,
      });
    }

    if (status === 'on_hold' && diff <= PRIORITY_WINDOW_DAYS) {
      warnings.push({
        procedureId: item.procedure.id,
        title: item.procedure.name,
        category: item.procedure.category,
        dueDate: item.dueDate,
        detail: `保留のまま期限が近づいています（${formatDueDate(item.dueDate)}）`,
      });
    }

    if (item.confidence === 'incomplete' && diff <= INCOMPLETE_LOOKAHEAD_DAYS) {
      opportunities.push({
        procedureId: item.procedure.id,
        title: item.procedure.name,
        category: item.procedure.category,
        dueDate: item.dueDate,
        detail: '会社プロフィールの情報が不足しているため、正確な期限を計算できていません。プロフィールの入力をご確認ください。',
      });
    }
  }

  priority.splice(PRIORITY_MAX_ITEMS);

  if (state.stage.confidence === 'incomplete') {
    opportunities.unshift({
      title: '基本情報の入力',
      dueDate: null,
      detail: '設立日など基本情報が未登録のため、手続きの判定精度が下がっています。会社プロフィールをご確認ください。',
    });
  }

  if (priority.length === 0 && warnings.length === 0) {
    opportunities.push({
      title: '直近の手続きに遅れはありません',
      dueDate: null,
      detail: `今後${PRIORITY_WINDOW_DAYS}日以内に対応が必要な手続きはありません。`,
    });
  }

  const overdueCount = warnings.filter((w) => w.detail.startsWith('期限超過')).length;
  const summary =
    overdueCount > 0
      ? `期限超過が${overdueCount}件あります。至急ご確認ください。`
      : warnings.length > 0
        ? `${warnings.length}件、期限が迫っている手続きがあります。`
        : priority.length > 0
          ? `直近${PRIORITY_WINDOW_DAYS}日以内に${priority.length}件の手続きがあります。`
          : '直近の手続きに遅れはありません。';

  return { priority, warnings, opportunities, summary };
}
