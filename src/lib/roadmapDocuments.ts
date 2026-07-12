import type { ScheduleProcedure } from '@/lib/scheduleProcedure';

// ── Roadmap 必要書類ガイド — 共通データ生成（Sprint 54）───────────────────
// 設計: docs/ROADMAP_REQUIRED_DOCUMENTS_GUIDE_DESIGN.md（Sprint53、設計レビュー承認済み）。
// Sprint50のbuildRoadmapSubmissionInfo・Sprint51のbuildRoadmapExportRowsと同じ方針
// （JSXに依存しないプレーンなデータを唯一の変換経路にする）を踏襲する。
// ScheduleProcedure.procedure_documents（既存、取得済み）から組み立てるだけの純粋関数で、
// 新しいDBクエリ・新しい判定材料は追加しない。JSX・exceljs・pdfmake固有の処理は一切含まない。

export type RoadmapDocumentItem = {
  name: string;
  formNumber: string | null;
  isRequired: boolean;
  notes: string | null;
};

export type RoadmapDocumentGroups = {
  documents: RoadmapDocumentItem[]; // 必要書類・添付書類
  preparations: RoadmapDocumentItem[]; // 事前準備
  checklist: RoadmapDocumentItem[]; // 提出前チェック
};

function toRoadmapDocumentItem(d: NonNullable<ScheduleProcedure['procedure_documents']>[number]): RoadmapDocumentItem {
  return {
    name: d.name,
    formNumber: d.form_number,
    isRequired: d.is_required,
    notes: d.notes,
  };
}

// item_type別（document/preparation/checklist）に分類し、各グループ内はsort_order昇順で並べる。
// item_typeが無い（旧データ・migration未適用環境）場合は'document'として扱う
// （normalizeProcedureDocuments、src/lib/diagnosis.tsで既にフォールバック済みの値がここに来る想定だが、
// 呼び出し経路に関わらず安全であるよう、ここでも同じフォールバックを行う）。
export function buildRoadmapDocumentItems(proc: ScheduleProcedure): RoadmapDocumentGroups {
  const rows = proc.procedure_documents ?? [];
  const sorted = [...rows].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const documents: RoadmapDocumentItem[] = [];
  const preparations: RoadmapDocumentItem[] = [];
  const checklist: RoadmapDocumentItem[] = [];

  for (const row of sorted) {
    const itemType = row.item_type ?? 'document';
    const item = toRoadmapDocumentItem(row);
    if (itemType === 'preparation') preparations.push(item);
    else if (itemType === 'checklist') checklist.push(item);
    else documents.push(item);
  }

  return { documents, preparations, checklist };
}

// グループが1件も無い（この手続きに必要書類ガイドの登録が無い）かどうかの判定。
// Web/Excel/PDFいずれも「データがある場合のみ表示」する際にこの関数を使い、判定ロジックを重複させない。
export function hasAnyRoadmapDocumentItems(groups: RoadmapDocumentGroups): boolean {
  return groups.documents.length > 0 || groups.preparations.length > 0 || groups.checklist.length > 0;
}
