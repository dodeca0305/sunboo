// ── Company Workspace — 手続きステータス（Sprint 24 Phase24.1・Sprint 32）─────────
// workspace_procedure_statuses用の型。既存の
// src/lib/scheduleProcedure.ts の ProcedureStatus型（3値、/result等の既存Engineが使用）とは
// 独立させる（4値目「保留」を持ち、既存Engineには一切影響を与えないため）。
//
// 【Sprint32で出現回単位に変更】(company_id, procedure_id) 単位（手続き単位）では、Annual
// Roadmapが同じ手続きを複数回展開する場合（毎月納付・毎年申告等）に出現回を区別できなかった
// （docs/PERIODIC_STATUS_REDESIGN.md、Sprint31設計レビューで承認済み）。主キーに
// occurrence_key を追加し (company_id, procedure_id, occurrence_key) とする。occurrence_key には
// 新しい採番ロジックを作らず、Annual Roadmap Engineが計算するRoadmapItem.dueDate（ISO日付）を
// そのまま使う。procedure_id + occurrence_keyの組み立ては必ずworkspaceProcedureOccurrenceKey()を
// 経由し、各画面で独自に文字列結合しない（重複防止）。

export type WorkspaceProcedureStatus = 'not_started' | 'in_progress' | 'done' | 'on_hold';

export const WORKSPACE_PROCEDURE_STATUS_LABEL: Record<WorkspaceProcedureStatus, string> = {
  not_started: '未着手',
  in_progress: '進行中',
  done: '完了',
  on_hold: '保留',
};

export const WORKSPACE_PROCEDURE_STATUSES: WorkspaceProcedureStatus[] = [
  'not_started', 'in_progress', 'done', 'on_hold',
];

// キーは procedure_id + occurrence_key の複合文字列（workspaceProcedureOccurrenceKey()で生成）。
export type WorkspaceProcedureStatusMap = Record<string, WorkspaceProcedureStatus>;

// workspace_procedure_statuses から取得した1行分の型（DB由来のselect結果を各画面で
// 個別に定義しないよう共有する）。
export type WorkspaceProcedureStatusRow = {
  procedure_id: number;
  occurrence_key: string;
  status: WorkspaceProcedureStatus;
};

// procedure_id + occurrence_key（= RoadmapItem.dueDate）から、WorkspaceProcedureStatusMapの
// キーを一意に組み立てる。各画面・Engineはこの関数を必ず経由し、独自に文字列結合しない。
export function workspaceProcedureOccurrenceKey(procedureId: number, occurrenceKey: string): string {
  return `${procedureId}:${occurrenceKey}`;
}
