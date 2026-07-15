import ExcelJS from 'exceljs';
import type { RoadmapExportRow } from '@/lib/roadmapExport';
import { buildExportFilename } from '@/lib/exportFilename';

// ── Roadmap Excel出力 — ワークブック生成（Sprint 51）───────────────────
// buildRoadmapExportRows（src/lib/roadmapExport.ts）が組み立てたプレーンな行データを
// .xlsx（exceljs）に変換するだけの層。行データの組み立てロジック（提出先URL選択・提出方法判定等）は
// 一切持たない（Sprint50の「JSXに依存しない共通データ」方針をExcel側でも維持する）。
// このファイルはブラウザ専用（exceljsのbrowserビルド、package.jsonのbrowserフィールド経由で
// バンドラーが自動解決する）。Client Componentからのみ呼び出す想定。

const COLUMNS: { header: string; key: keyof RoadmapExportRow | 'companyAddress'; width: number }[] = [
  { header: '年度', key: 'year', width: 8 },
  { header: '月', key: 'month', width: 6 },
  { header: '期限', key: 'dueDate', width: 12 },
  { header: '手続き名', key: 'procedureName', width: 32 },
  { header: 'カテゴリ', key: 'category', width: 10 },
  { header: '会社所在地', key: 'companyAddress', width: 30 },
  { header: '提出先', key: 'officeName', width: 26 },
  { header: '提出方法', key: 'submissionMethod', width: 18 },
  { header: 'リンク種別', key: 'linkKind', width: 10 },
  { header: '公式/関連URL', key: 'url', width: 42 },
  { header: 'リンク確認状態', key: 'urlStatus', width: 14 },
  { header: 'ステータス', key: 'status', width: 10 },
  { header: 'Confidence', key: 'confidence', width: 12 },
  { header: '注意事項', key: 'cautionNote', width: 44 },
  { header: '必要書類ガイド', key: 'documentGuide', width: 40 },
  { header: '担当者', key: 'assignee', width: 12 },
  { header: 'メモ', key: 'memo', width: 26 },
];

// Brand System v1.0（凍結）準拠。旧ブランドカラーから変更。ロゴ画像は挿入しない（色のみの変更）。
const HYPERLINK_FONT = { color: { argb: 'FF0F172A' }, underline: true } as const;

// 会社名・作成日からファイル名を安全に組み立てる。拡張子は常に.xlsxで固定する。
// 【Sprint52で共通化】サニタイズ本体はsrc/lib/exportFilename.tsへ移動し、PDF出力と共有する
// （docs/BETA_BACKLOG.md L-04「Windows/macOS双方で安全な文字への統一」に対応）。
export function buildRoadmapExcelFilename(companyName: string, createdAt: Date): string {
  return buildExportFilename('SUNBOO_年間ロードマップ', companyName, createdAt, 'xlsx');
}

export async function buildRoadmapExcelBuffer(
  rows: RoadmapExportRow[],
  companyName: string,
  companyAddress: string,
  createdAt: Date,
): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SUNBOO経営ナビ';
  workbook.created = createdAt;

  // シート名は31文字・一部記号が使えないため、会社名をそのまま使わず固定名にする。
  const sheet = workbook.addWorksheet('年間ロードマップ', {
    views: [{ state: 'frozen', ySplit: 1 }], // 先頭行（ヘッダー）を固定
  });

  sheet.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    const excelRow = sheet.addRow({
      ...row,
      companyAddress,
      dueDate: row.dueDate ? new Date(`${row.dueDate}T00:00:00`) : null,
    });

    const dueDateCell = excelRow.getCell('dueDate');
    dueDateCell.numFmt = 'yyyy-mm-dd'; // Excel上で日付として扱える形式

    if (row.url) {
      const urlCell = excelRow.getCell('url');
      urlCell.value = { text: row.url, hyperlink: row.url }; // クリック可能なハイパーリンク
      urlCell.font = { ...HYPERLINK_FONT };
    }

    if (row.documentGuide) {
      // 必要書類ガイドは[見出し]付きで改行結合しているため、セル内で折り返して読めるようにする
      const docGuideCell = excelRow.getCell('documentGuide');
      docGuideCell.alignment = { wrapText: true, vertical: 'top' };
      const lineCount = row.documentGuide.split('\n').length;
      if (lineCount > 1) excelRow.height = 15 * lineCount;
    }
  }

  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };

  return workbook.xlsx.writeBuffer();
}
