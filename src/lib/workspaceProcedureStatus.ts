// ── Company Workspace — 手続きステータス（Sprint 24 Phase24.1）───────────
// workspace_procedure_statuses（本Sprintで新規作成）用の型。既存の
// src/lib/scheduleProcedure.ts の ProcedureStatus型（3値、/result等の既存Engineが使用）とは
// 独立させる（4値目「保留」を持ち、既存Engineには一切影響を与えないため）。
//
// 【粒度についての設計判断】(company_id, procedure_id) 単位（手続き単位）でステータスを持つ。
// Annual Roadmapは同じ手続きが複数年・複数回出現しうるが、本MVPでは出現回ごとの個別ステータスは
// 扱わない（詳細: supabase/migration_workspace_procedure_statuses.sql）。

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

export type WorkspaceProcedureStatusMap = Record<number, WorkspaceProcedureStatus>;
