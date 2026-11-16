import ExcelJS from 'exceljs';
import { buildExportFilename } from './exportFilename.ts';
import {
  DRAFT_NOTICE,
  FORM_FIELDS_NOT_FILLED_NOTE,
  buildDraftModel,
  rowWarnings,
  type DraftInput,
  type DraftModel,
} from './depreciationDocumentDraft.ts';

// 償却資産申告の下書きXLSX（2タブ）。ブラウザのクリック時に動的importして使う。
// 文字は常に文字列セル（式にならない）。数値/日付は検証済みの値のみ型付きで書き、無効な入力は入力文字のまま警告付きで残す。

export const SHEET_DETAIL = '種類別明細書（下書き）';
export const SHEET_FORM = '償却資産申告書（下書き）';

export function buildDepreciationDraftFilename(companyName: string, createdAt: Date): string {
  return buildExportFilename('SUNBOO_償却資産申告_下書き', companyName, createdAt, 'xlsx');
}

function str(v: string): string {
  return v; // 文字列のまま。exceljsは文字列を式として解釈しない
}

// 文字幅（全角=2）。折り返し行数の見積もりに使う。
function visualWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += (ch.codePointAt(0) ?? 0) > 0xff ? 2 : 1;
  return w;
}

/** 全セルを折り返し、文字量に応じて行高を確保（結合セルは結合幅で計算）。切れないようにする。 */
function fitRows(sheet: ExcelJS.Worksheet) {
  sheet.eachRow((row, rowNumber) => {
    let lines = 1;
    row.eachCell((cell) => {
      if (cell.isMerged && cell.master !== cell) return;
      const prev = cell.alignment ?? {};
      cell.alignment = { ...prev, wrapText: true, vertical: prev.vertical ?? 'top' };
      const v = cell.value;
      if (v === null || v === undefined || v instanceof Date) return;
      const text = String(v);
      let width = sheet.getColumn(Number(cell.col)).width ?? 10;
      if (cell.isMerged) {
        // 同じ行で結合範囲の右端まで幅を加算
        const m = sheet.model.merges?.find((a: string) => a.startsWith(`${cell.address}:`));
        if (m) {
          const endCol = sheet.getCell(m.split(':')[1]).col;
          width = 0;
          for (let c = Number(cell.col); c <= Number(endCol); c++) width += sheet.getColumn(c).width ?? 10;
        }
      }
      const perLine = Math.max(4, Math.floor(width * 0.9));
      const n = text.split('\n').reduce((a, seg) => a + Math.max(1, Math.ceil(visualWidth(seg) / perLine)), 0);
      lines = Math.max(lines, n);
    });
    const base = rowNumber === 1 ? 28 : 18;
    row.height = Math.max(base, 16 * lines + 2);
  });
}

function banner(sheet: ExcelJS.Worksheet, cols: number, text: string, row: number) {
  sheet.mergeCells(row, 1, row, cols);
  const c = sheet.getCell(row, 1);
  c.value = text;
  c.font = { bold: true, size: 16, color: { argb: 'FFC00000' } };
  c.alignment = { wrapText: true, vertical: 'middle' };
  sheet.getRow(row).height = 28;
}

function note(sheet: ExcelJS.Worksheet, cols: number, text: string, row: number, bold = false) {
  sheet.mergeCells(row, 1, row, cols);
  const c = sheet.getCell(row, 1);
  c.value = text;
  c.font = { bold };
  c.alignment = { wrapText: true, vertical: 'top' };
  sheet.getRow(row).height = Math.max(18, 16 * Math.ceil(text.length / 40));
}

function header(sheet: ExcelJS.Worksheet, row: number, labels: string[]) {
  labels.forEach((l, i) => {
    const c = sheet.getCell(row, i + 1);
    c.value = l;
    c.font = { bold: true };
    c.alignment = { wrapText: true, vertical: 'middle' };
  });
}

function companyBlock(sheet: ExcelJS.Worksheet, cols: number, m: DraftModel, start: number): number {
  let r = start;
  const pairs: [string, string][] = [
    ['会社名', m.companyName || '未入力'],
    ['所在地', m.address || '未入力'],
    ['代表者名', m.representative || '未入力'],
    ['対象年（賦課期日 1月1日）', m.targetYear === null ? '未入力' : `${m.targetYear}年`],
    ['1月1日時点の所有確認', m.ownershipConfirmed ? '入力者が確認済み（制度上の判定ではありません）' : '未確認'],
  ];
  for (const [k, v] of pairs) {
    sheet.getCell(r, 1).value = k;
    sheet.getCell(r, 1).font = { bold: true };
    sheet.mergeCells(r, 2, r, cols);
    sheet.getCell(r, 2).value = str(v);
    r++;
  }
  note(sheet, cols, m.hasMissing ? `要確認の項目：${m.missing.join('、')}` : '未入力の項目はありません（内容の正確性は別途確認してください）', r, true);
  return r + 1;
}

export async function buildDepreciationDraftBuffer(input: DraftInput, createdAt: Date): Promise<ExcelJS.Buffer> {
  const m = buildDraftModel(input);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SUNBOO経営ナビ';
  wb.created = createdAt;

  // ── 1枚目：種類別明細書（下書き）
  const d = wb.addWorksheet(SHEET_DETAIL);
  const dCols = 9;
  [6, 28, 8, 14, 20, 10, 20, 16, 48].forEach((w, i) => { d.getColumn(i + 1).width = w; });
  banner(d, dCols, `${DRAFT_NOTICE}（種類別明細書）`, 1);
  let r = companyBlock(d, dCols, m, 2);
  r++;
  header(d, r, ['No.', '資産名', '数量', '取得年月日', '取得価額（この行の合計・円）', '耐用年数', '種類', '取得区分', '注意']);
  r++;
  for (const row of m.rows) {
    const set = (col: number, v: string | number | Date | null, fmt?: string) => {
      const c = d.getCell(r, col);
      c.value = v;
      if (fmt) c.numFmt = fmt;
      return c;
    };
    set(1, row.index + 1);
    set(2, row.name ? str(row.name) : null);
    set(3, row.quantity ?? (row.quantityRaw ? str(row.quantityRaw) : null), row.quantity !== null ? '#,##0' : undefined);
    if (row.acquiredOn) {
      const [y, mo, da] = row.acquiredOn.split('-').map(Number);
      set(4, new Date(Date.UTC(y, mo - 1, da)), 'yyyy-mm-dd');
    } else set(4, row.acquiredOnRaw ? str(row.acquiredOnRaw) : null);
    set(5, row.totalCost ?? (row.totalCostRaw ? str(row.totalCostRaw) : null), row.totalCost !== null ? '#,##0' : undefined);
    set(6, row.usefulLife ?? (row.usefulLifeRaw ? str(row.usefulLifeRaw) : null));
    set(7, row.categoryLabel);
    set(8, row.reasonLabel);
    const w = d.getCell(r, 9);
    w.value = rowWarnings(row).join(' / ');
    w.alignment = { wrapText: true, vertical: 'top' };
    if (row.issues.length > 0) w.font = { color: { argb: 'FFC00000' } };
    r++;
  }
  r++;
  note(d, dCols, '取得価額は各行の合計額です（数量を掛けていません）。空欄は未入力で、0ではありません。', r);

  // ── 2枚目：償却資産申告書（下書き）
  const f = wb.addWorksheet(SHEET_FORM);
  const fCols = 5;
  [28, 12, 22, 14, 44].forEach((w, i) => { f.getColumn(i + 1).width = w; });
  banner(f, fCols, `${DRAFT_NOTICE}（償却資産申告書）`, 1);
  r = companyBlock(f, fCols, m, 2);
  r++;
  f.mergeCells(r, 1, r, fCols);
  f.getCell(r, 1).value = '入力した資産の取得価額集計';
  f.getCell(r, 1).font = { bold: true, size: 13 };
  r++;
  header(f, r, ['種類', '入力件数', '取得価額の合計（円）', '集計した件数', '備考']);
  r++;
  for (const c of m.categoryTotals) {
    f.getCell(r, 1).value = c.label;
    f.getCell(r, 2).value = c.rowCount;
    const t = f.getCell(r, 3);
    t.value = c.total;
    if (c.total !== null) t.numFmt = '#,##0';
    f.getCell(r, 4).value = c.countedRows;
    const remark: string[] = [];
    if (c.overflow) remark.push('合計が大きすぎるため集計できません');
    else if (c.rowCount === 0) remark.push('入力なし（0円ではなく未入力）');
    else if (c.incompleteRows > 0) remark.push(`取得価額が未入力/不正の行が${c.incompleteRows}件あり、合計は不完全です`);
    f.getCell(r, 5).value = remark.join(' / ');
    r++;
  }
  f.getCell(r, 1).value = '種類未選択の行';
  f.getCell(r, 2).value = m.uncategorizedRows;
  f.getCell(r, 5).value = m.uncategorizedRows > 0 ? '種類が未選択のため上の集計に含めていません' : '';
  r++;
  f.getCell(r, 1).value = '入力した資産の取得価額 総合計（円）';
  f.getCell(r, 1).font = { bold: true };
  const g = f.getCell(r, 3);
  g.value = m.grandTotal;
  if (m.grandTotal !== null) g.numFmt = '#,##0';
  g.font = { bold: true };
  f.getCell(r, 5).value = m.grandTotalComplete
    ? '入力した全行の合計（入力分のみ）'
    : m.totalOverflow ? '合計が大きすぎて集計できないため総合計は空欄（要確認）' : '未入力・不正の行があるため総合計は空欄（要確認）';
  r += 2;
  note(f, fCols, `この集計は今回入力した資産だけの取得価額です。${FORM_FIELDS_NOT_FILLED_NOTE}`, r);
  r++;
  note(f, fCols, '課税対象かどうか・評価額・税額の判定は行っていません。', r);

  fitRows(d);
  fitRows(f);
  return wb.xlsx.writeBuffer();
}
