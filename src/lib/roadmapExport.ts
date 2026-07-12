import type { ProcedureCategory } from '@/lib/types';
import type { RoadmapYear } from '@/lib/roadmap';
import type { StateConfidence } from '@/lib/state';
import {
  workspaceProcedureOccurrenceKey, WORKSPACE_PROCEDURE_STATUS_LABEL,
  type WorkspaceProcedureStatusMap,
} from '@/lib/workspaceProcedureStatus';
import { buildRoadmapSubmissionInfo, type SubmissionLinkKind, type SubmissionUrlStatus } from '@/lib/roadmapSubmissionInfo';
import { buildRoadmapDocumentItems, type RoadmapDocumentGroups } from '@/lib/roadmapDocuments';

// ── Roadmap 出力行 — 共通データ生成（Sprint 51）──────────────────────
// 設計: docs/ROADMAP_SUBMISSION_OFFICE_LINKS_DESIGN.md（Sprint50）が定めた
// 「JSXに依存しないプレーンなデータを唯一の変換経路にする」方針をExcel出力にも適用する。
// buildRoadmapSubmissionInfo（Sprint50）をそのまま再利用し、提出先URLの選択ロジックを
// 二重に持たない。この関数の戻り値は、Web表示（将来AnnualRoadmapViewが使う場合）・
// Excel出力（本Sprint）・将来のPDF出力のいずれからも同じ形で消費できる。
// DOM/exceljs等の出力形式固有のライブラリには一切依存しない純粋関数。

export const PROCEDURE_CATEGORY_LABEL: Record<ProcedureCategory, string> = {
  tax: '税務',
  local_tax: '地方税',
  labor: '労務',
  insurance: '社保',
  registration: '登録',
  legal: '法務・登記',
  other: 'その他',
};

const CONFIDENCE_LABEL: Record<StateConfidence, string> = {
  confirmed: '確定',
  estimated: '推定',
  incomplete: '情報不足',
};

const LINK_KIND_LABEL: Record<SubmissionLinkKind, string> = {
  official: '公式',
  website: '関連',
  fallback: '関連',
  none: '未登録',
};

const URL_STATUS_LABEL: Record<Exclude<SubmissionUrlStatus, null>, string> = {
  verified: '確認済み',
  unchecked: '未確認',
  broken: 'リンク切れ',
};

export type RoadmapExportRow = {
  year: number;
  month: number;
  dueDate: string; // ISO日付（YYYY-MM-DD）。出力形式側で日付型へ変換する
  procedureName: string;
  category: string;
  officeName: string; // 未登録の場合は空文字（推測しない）
  submissionMethod: string; // buildRoadmapSubmissionInfoのsubmissionMethodsを結合したもの。根拠が無ければ空文字
  linkKind: string;
  url: string; // 無ければ空文字
  urlStatus: string; // 対応するリンクが無い場合は空文字
  status: string;
  confidence: string;
  cautionNote: string;
  documentGuide: string; // 必要書類・事前準備・提出前チェックをitem_type別に見出し付きで改行結合。無ければ空文字
  assignee: string; // 常に空欄（利用者が出力後に記入する列）
  memo: string; // 常に空欄
};

// 必要書類ガイド（Sprint53設計・Sprint54実装）をExcelの1セルに収まる形へ整形する。
// item_type別（document/preparation/checklist）に見出しを付け、改行で区切る
// （複数項目はセル内で改行、Excel/PDFで内容を一致させる方針の一環）。
function formatDocumentGuideCell(groups: RoadmapDocumentGroups): string {
  const lines: string[] = [];
  if (groups.documents.length > 0) {
    lines.push(`[必要書類] ${groups.documents.map((d) => `${d.name}${d.isRequired ? '' : '（任意）'}`).join('、')}`);
  }
  if (groups.preparations.length > 0) {
    lines.push(`[事前準備] ${groups.preparations.map((d) => d.name).join('、')}`);
  }
  if (groups.checklist.length > 0) {
    lines.push(`[提出前チェック] ${groups.checklist.map((d) => d.name).join('、')}`);
  }
  return lines.join('\n');
}

// RoadmapYear[]・Procedure Status Mapから、occurrence単位（1出現=1行）の出力行を組み立てる。
// 日付昇順に並べる。会社情報（会社名等）は行データ自体には含めない
// （ファイル名・シート見出しは出力側＝Excel生成関数の責務、docs/ROADMAP_SUBMISSION_OFFICE_LINKS_DESIGN.md
// と同じく「行データ」と「出力形式ごとの体裁」を分離する）。
export function buildRoadmapExportRows(
  roadmapYears: RoadmapYear[],
  statusMap: WorkspaceProcedureStatusMap,
): RoadmapExportRow[] {
  const items = roadmapYears
    .flatMap((y) => y.items)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return items.map((item) => {
    const submission = buildRoadmapSubmissionInfo(item.procedure);
    const statusKey = workspaceProcedureOccurrenceKey(item.procedure.id, item.dueDate);
    const status = statusMap[statusKey] ?? 'not_started';
    const [yearStr, monthStr] = item.dueDate.split('-');

    return {
      year: Number(yearStr),
      month: Number(monthStr),
      dueDate: item.dueDate,
      procedureName: item.procedure.name,
      category: PROCEDURE_CATEGORY_LABEL[item.procedure.category] ?? 'その他',
      officeName: submission.officeName ?? '',
      submissionMethod: submission.submissionMethods.join('、'),
      linkKind: submission.url ? LINK_KIND_LABEL[submission.linkKind] : '',
      url: submission.url ?? '',
      urlStatus: submission.url && submission.urlStatus ? URL_STATUS_LABEL[submission.urlStatus] : '',
      status: WORKSPACE_PROCEDURE_STATUS_LABEL[status],
      confidence: CONFIDENCE_LABEL[item.confidence],
      cautionNote: item.procedure.caution_note ?? '',
      documentGuide: formatDocumentGuideCell(buildRoadmapDocumentItems(item.procedure)),
      assignee: '',
      memo: '',
    };
  });
}
