import type { RoadmapYear } from './roadmap.ts';
import type { WorkspaceProcedureStatusMap } from './workspaceProcedureStatus.ts';
import { workspaceProcedureOccurrenceKey } from './workspaceProcedureStatus.ts';

export type WorkspaceRequiredDocument = {
  name: string;
  formNumber: string | null;
  nearestDueDate: string;
  procedures: string[];
};

/**
 * 未完了のロードマップ項目から、必須の提出書類を名前ごとに集約する。
 * 同じ書類を複数手続きで使う場合も一度だけ表示し、用途となる手続き名を併記する。
 */
export function buildWorkspaceRequiredDocuments(
  roadmapYears: RoadmapYear[],
  statusMap: WorkspaceProcedureStatusMap,
): WorkspaceRequiredDocument[] {
  const grouped = new Map<string, WorkspaceRequiredDocument>();

  for (const { items } of roadmapYears) {
    for (const item of items) {
      const status = statusMap[
        workspaceProcedureOccurrenceKey(item.procedure.id, item.dueDate)
      ] ?? 'not_started';
      if (status === 'done') continue;

      for (const document of item.procedure.procedure_documents ?? []) {
        if ((document.item_type ?? 'document') !== 'document' || !document.is_required) {
          continue;
        }

        const name = document.name.trim();
        if (!name) continue;

        const existing = grouped.get(name);
        if (existing) {
          existing.nearestDueDate =
            item.dueDate < existing.nearestDueDate
              ? item.dueDate
              : existing.nearestDueDate;
          if (!existing.procedures.includes(item.procedure.name)) {
            existing.procedures.push(item.procedure.name);
          }
          continue;
        }

        grouped.set(name, {
          name,
          formNumber: document.form_number,
          nearestDueDate: item.dueDate,
          procedures: [item.procedure.name],
        });
      }
    }
  }

  return [...grouped.values()]
    .map((document) => ({
      ...document,
      procedures: [...document.procedures].sort((a, b) => a.localeCompare(b, 'ja')),
    }))
    .sort((a, b) =>
      a.nearestDueDate.localeCompare(b.nearestDueDate) ||
      a.name.localeCompare(b.name, 'ja'),
    );
}
