import pdfMake from 'pdfmake';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { RoadmapExportRow } from '@/lib/roadmapExport';
import { buildExportFilename } from '@/lib/exportFilename';

// ── Roadmap PDF出力 — 文書生成（Sprint 52）───────────────────────────
// buildRoadmapExportRows（src/lib/roadmapExport.ts、Sprint51）が組み立てたプレーンな行データを
// PDF（pdfmake）に変換するだけの層。Excel出力（roadmapExcelWorkbook.ts）と全く同じ行データを
// 入力にするため、期限・提出先・ステータス等の内容がExcelとPDFで食い違うことはない。
// 行データの組み立てロジック（提出先URL選択・提出方法判定等）はここには一切持たない。
//
// このファイルはブラウザ専用（pdfmakeのbrowserビルド、package.jsonのbrowserフィールド経由で
// バンドラーが自動解決する）。Client Componentからのみ呼び出す想定。

const FONT_FAMILY = 'NotoSansJP';
const VFS_REGULAR_PATH = 'NotoSansJP-Regular.ttf';
const VFS_BOLD_PATH = 'NotoSansJP-Bold.ttf';
let fontsRegistered = false;

// ArrayBufferをbase64文字列へ変換する。5MB超のフォントファイルを一度に
// String.fromCharCode(...bytes) へ展開するとコールスタック上限を超えるため、
// 32KBずつチャンク処理する（大きいバイナリをbase64化する定石パターン）。
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

// Noto Sans JP（Regular/Bold）はpublic/fonts/に静的アセットとして配置し、JSバンドルには含めない
// （「PDFで出力」クリック時にのみfetchする。初期ページ読み込みには影響しない、Sprint51のexceljs
// 動的import方針と同じ考え方）。フォント登録はセッション中1回だけ行えばよいためキャッシュする。
//
// 【重要】pdfmake（browserビルド、v0.3.11）の addFonts() に ArrayBuffer/Uint8Array を直接渡すと、
// 内部の resolveUrls() が非文字列のフォント記述子を `{url: undefined}` として扱ってしまい
// `url.toLowerCase()` で例外になる（型定義上は ArrayBuffer 等も許容すると書かれているが、
// browserビルドの実装では動作しないことを実機検証で確認した）。正しい手順は、
// addVirtualFileSystem() でbase64文字列としてファイルを登録し、addFonts() では
// そのファイル名（文字列パス）を指すことである（pdfmakeのbrowser-extensions実装を確認して確定）。
async function ensureFontsRegistered(): Promise<void> {
  if (fontsRegistered) return;
  const [regular, bold] = await Promise.all([
    fetch('/fonts/NotoSansJP-Regular.ttf').then((r) => {
      if (!r.ok) throw new Error('フォントの取得に失敗しました');
      return r.arrayBuffer();
    }),
    fetch('/fonts/NotoSansJP-Bold.ttf').then((r) => {
      if (!r.ok) throw new Error('フォントの取得に失敗しました');
      return r.arrayBuffer();
    }),
  ]);

  pdfMake.addVirtualFileSystem({
    [VFS_REGULAR_PATH]: arrayBufferToBase64(regular),
    [VFS_BOLD_PATH]: arrayBufferToBase64(bold),
  });
  pdfMake.addFonts({
    [FONT_FAMILY]: {
      normal: VFS_REGULAR_PATH,
      bold: VFS_BOLD_PATH,
      italics: VFS_REGULAR_PATH, // 斜体フォントは用意しない（本文中で使わないため、通常体で代用）
      bolditalics: VFS_BOLD_PATH,
    },
  });
  fontsRegistered = true;
}

const COLOR_TEXT = '#111827';
const COLOR_MUTED = '#6B7280';
const COLOR_LINK = '#2563EB';
const COLOR_RULE = '#D1D5DB';

function ruleLine(): Content {
  return {
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: COLOR_RULE }],
    margin: [0, 4, 0, 8],
  };
}

// 1件のoccurrence（=Excelの1行）を、改ページで途中分断されない1ブロックとして組み立てる。
// 色だけでステータス・情報不足を表現しない（白黒印刷でも判別できるよう、テキストで明記する）。
function procedureBlock(row: RoadmapExportRow): Content {
  const stack: Content[] = [
    {
      columns: [
        { text: row.dueDate, width: 70, bold: true, color: COLOR_TEXT },
        { text: row.procedureName, width: '*', bold: true, color: COLOR_TEXT },
        { text: `[${row.status}]`, width: 70, alignment: 'right', color: COLOR_TEXT },
      ],
    },
    {
      text: `カテゴリ: ${row.category}　提出先: ${row.officeName || '未登録'}`,
      color: COLOR_MUTED,
      fontSize: 9,
      margin: [0, 2, 0, 0],
    },
  ];

  if (row.submissionMethod) {
    stack.push({ text: `提出方法: ${row.submissionMethod}`, color: COLOR_MUTED, fontSize: 9 });
  }

  if (row.confidence !== '確定') {
    stack.push({
      text: `※ ${row.confidence}（登録情報が不足しているため、期限が変わる可能性があります）`,
      color: COLOR_TEXT,
      fontSize: 9,
      italics: true,
      margin: [0, 2, 0, 0],
    });
  }

  if (row.cautionNote) {
    stack.push({ text: row.cautionNote, color: COLOR_MUTED, fontSize: 8.5, margin: [0, 2, 0, 0] });
  }

  // 必要書類ガイド（Sprint53設計・Sprint54実装）。row.documentGuideはroadmapExport.tsが既に
  // [必要書類]/[事前準備]/[提出前チェック]の見出し付きで改行結合済み（Excelと同一のテキスト）。
  // ここで再度item_typeを判定し直すことはせず、Excel/PDFで内容が食い違わないようにする。
  if (row.documentGuide) {
    stack.push({
      stack: row.documentGuide.split('\n').map((line) => ({ text: line, color: COLOR_MUTED, fontSize: 8.5 })),
      margin: [0, 2, 0, 0],
    });
  }

  // URLが無い場合はURL欄自体を出さない（推測しない、Sprint50の方針を踏襲）
  if (row.url) {
    stack.push({
      text: `${row.linkKind === '公式' ? '公式ページ' : '関連ページ'}: ${row.url}`,
      link: row.url,
      color: COLOR_LINK,
      decoration: 'underline',
      fontSize: 8.5,
      margin: [0, 2, 0, 0],
    });
  }

  stack.push(ruleLine());

  return { unbreakable: true, stack, margin: [0, 0, 0, 2] };
}

function groupRowsByYearMonth(rows: RoadmapExportRow[]): { year: number; months: { month: number; rows: RoadmapExportRow[] }[] }[] {
  const byYear = new Map<number, Map<number, RoadmapExportRow[]>>();
  for (const row of rows) {
    let months = byYear.get(row.year);
    if (!months) {
      months = new Map();
      byYear.set(row.year, months);
    }
    const monthRows = months.get(row.month) ?? [];
    monthRows.push(row);
    months.set(row.month, monthRows);
  }
  return Array.from(byYear.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, months]) => ({
      year,
      months: Array.from(months.entries())
        .sort(([a], [b]) => a - b)
        .map(([month, monthRows]) => ({ month, rows: monthRows })),
    }));
}

function formatPeriodLabel(rows: RoadmapExportRow[]): string {
  if (rows.length === 0) return '－';
  const first = rows[0];
  const last = rows[rows.length - 1];
  return `${first.year}年${first.month}月 〜 ${last.year}年${last.month}月`;
}

function formatCreatedLabel(createdAt: Date): string {
  return `${createdAt.getFullYear()}年${createdAt.getMonth() + 1}月${createdAt.getDate()}日`;
}

const DISCLAIMER = '本資料は登録情報に基づく参考資料です。実際の手続き内容・期限・提出先は必ず専門家・各公式機関にご確認ください。';

function buildDocumentDefinition(
  rows: RoadmapExportRow[],
  companyName: string,
  companyAddress: string,
  createdAt: Date,
): TDocumentDefinitions {
  const createdLabel = formatCreatedLabel(createdAt);
  const periodLabel = formatPeriodLabel(rows);
  const yearGroups = groupRowsByYearMonth(rows);

  const bodyContent: Content[] = yearGroups.flatMap((yearGroup) => [
    { text: `${yearGroup.year}年`, style: 'yearHeading' },
    ...yearGroup.months.flatMap((monthGroup) => [
      // 月見出しは最初の1件と一緒に不可分ブロックにし、見出しだけがページ末尾に
      // 取り残される（孤立する）ことを避ける。2件目以降は通常どおり改ページを許可する。
      {
        unbreakable: true,
        stack: [{ text: `${monthGroup.month}月`, style: 'monthHeading' }, procedureBlock(monthGroup.rows[0])],
      },
      ...monthGroup.rows.slice(1).map((row) => procedureBlock(row)),
    ]),
  ]);

  return {
    info: {
      title: `SUNBOO 年間手続きロードマップ - ${companyName}`,
      creator: 'SUNBOO経営ナビ',
    },
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: [40, 50, 40, 60],
    defaultStyle: { font: FONT_FAMILY, fontSize: 10, color: COLOR_TEXT },
    content: [
      // ── 表紙 ──
      { text: 'SUNBOO', style: 'coverBrand', margin: [0, 120, 0, 4] },
      { text: '年間手続きロードマップ', style: 'coverTitle' },
      { text: companyName, style: 'coverCompany', margin: [0, 24, 0, 0] },
      ...(companyAddress ? [{ text: companyAddress, style: 'coverMeta' }] : []),
      { text: `対象期間: ${periodLabel}`, style: 'coverMeta' },
      { text: `作成日: ${createdLabel}`, style: 'coverMeta' },
      { text: DISCLAIMER, style: 'coverDisclaimer', margin: [0, 40, 0, 0] },
      { text: '', pageBreak: 'after' },
      // ── 本文 ──
      ...bodyContent,
    ],
    styles: {
      coverBrand: { fontSize: 14, bold: true, color: COLOR_LINK, alignment: 'center' },
      coverTitle: { fontSize: 22, bold: true, alignment: 'center' },
      coverCompany: { fontSize: 16, bold: true, alignment: 'center' },
      coverMeta: { fontSize: 11, color: COLOR_MUTED, alignment: 'center', margin: [0, 2, 0, 0] },
      coverDisclaimer: { fontSize: 9, color: COLOR_MUTED, alignment: 'center' },
      yearHeading: { fontSize: 16, bold: true, margin: [0, 16, 0, 8] },
      monthHeading: { fontSize: 12, bold: true, margin: [0, 8, 0, 6], color: COLOR_LINK },
    },
    footer: (currentPage: number, pageCount: number) => ({
      margin: [40, 10, 40, 0],
      stack: [
        { text: DISCLAIMER, fontSize: 7, color: COLOR_MUTED },
        {
          columns: [
            { text: `作成日: ${createdLabel}`, fontSize: 8, color: COLOR_MUTED },
            { text: `${currentPage} / ${pageCount}`, fontSize: 8, color: COLOR_MUTED, alignment: 'right' },
          ],
        },
      ],
    }),
  };
}

export async function buildRoadmapPdfBlob(
  rows: RoadmapExportRow[],
  companyName: string,
  companyAddress: string,
  createdAt: Date,
): Promise<Blob> {
  await ensureFontsRegistered();
  const docDefinition = buildDocumentDefinition(rows, companyName, companyAddress, createdAt);
  const pdf = pdfMake.createPdf(docDefinition);
  return pdf.getBlob();
}

export function buildRoadmapPdfFilename(companyName: string, createdAt: Date): string {
  return buildExportFilename('SUNBOO_年間ロードマップ', companyName, createdAt, 'pdf');
}
