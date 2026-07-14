import pdfMake from 'pdfmake';
import type { Content, TDocumentDefinitions, CustomTableLayout } from 'pdfmake/interfaces';
import type { RoadmapExportRow } from '@/lib/roadmapExport';
import { buildExportFilename } from '@/lib/exportFilename';

// ── Roadmap PDF出力 — 文書生成（Sprint 52・Sprint 63で印刷前提のレイアウトへ刷新）───────
// buildRoadmapExportRows（src/lib/roadmapExport.ts、Sprint51）が組み立てたプレーンな行データを
// PDF（pdfmake）に変換するだけの層。Excel出力（roadmapExcelWorkbook.ts）と全く同じ行データを
// 入力にするため、期限・提出先・ステータス等の内容がExcelとPDFで食い違うことはない。
// 行データの組み立てロジック（提出先URL選択・提出方法判定等）はここには一切持たない。
//
// 【Sprint63で刷新】「出力ファイル」ではなく「紙に印刷して1年間使う実務資料」を前提に、
// 月単位のページ・カード化・チェック欄・メモ欄・年間チェックシートを追加した
// （Engine・Procedure・DBは無変更、PDFレイアウトのみの変更）。
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

// 印刷（白黒）でも判別できるよう、色だけに依存しない表現を徹底する（Sprint63要件⑨）。
// ・重要度は「文字サイズ」「太字」「枠」「余白」で表現する（色の濃淡だけに頼らない）
// ・状態・確からしさは必ずテキストで明記する（[ステータス]・※情報不足 等）
// ・チェック欄は文字（☐等）ではなくcanvasの矩形で描画する。実機確認（pdfjs-distでのレンダリング検証）で
//   Unicodeのチェックボックス記号がNotoSansJPフォントに存在せず「.notdef」の代替字形（豆腐）で
//   表示されることを確認したため、フォント依存を避けベクター矩形で確実に空欄の四角を表示する。

const PAGE_CONTENT_WIDTH = 515; // A4ポートレート・左右余白40+40を引いた実効幅（既存値を踏襲）
const CARD_CONTENT_WIDTH = 480; // カード内側の余白を差し引いた概算幅（メモ罫線の長さに使う）

function ruleLine(width: number = PAGE_CONTENT_WIDTH, margin: [number, number, number, number] = [0, 0, 0, 0]): Content {
  return {
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: width, y2: 0, lineWidth: 0.5, lineColor: COLOR_RULE }],
    margin,
  };
}

// チェック欄1個分（矩形+ラベル）。canvasの矩形はフォントに依存しないため、印刷前提のチェック欄として
// 確実に空欄の四角が表示される（Sprint63要件④⑨）。
function checkboxCell(): Content {
  return { canvas: [{ type: 'rect', x: 1, y: 1, w: 8, h: 8, lineColor: COLOR_TEXT, lineWidth: 1 }] };
}

function checkboxLabelCell(label: string): Content {
  return { text: label, fontSize: 9, color: COLOR_TEXT, margin: [3, 1, 0, 0] };
}

// カード（table 1セル）の外枠。色ではなく「枠」で1手続き=1カードの境界を明示する。
const cardLayout: CustomTableLayout = {
  hLineWidth: () => 1,
  vLineWidth: () => 1,
  hLineColor: () => COLOR_RULE,
  vLineColor: () => COLOR_RULE,
  paddingLeft: () => 12,
  paddingRight: () => 12,
  paddingTop: () => 10,
  paddingBottom: () => 10,
};

// 年間チェックシート用のテーブル罫線（ヘッダー行のみ太線、以降は薄い横線のみ）。
const checklistLayout: CustomTableLayout = {
  hLineWidth: (i) => (i <= 1 ? 1 : 0.5),
  vLineWidth: () => 0,
  hLineColor: () => COLOR_RULE,
  paddingLeft: () => 4,
  paddingRight: () => 4,
  paddingTop: () => 5,
  paddingBottom: () => 5,
};

function formatDueDateLabel(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(m)}月${Number(d)}日`;
}

// ラベル（太字）+ 値の1行を組み立てる。色ではなく太字を「見出し」として使う共通ヘルパー
// （Sprint63要件⑨）。値が空の場合は「未登録」等の代わりの文言を呼び出し側が渡す。
function labeledLine(label: string, value: string, fontSize = 9): Content {
  return {
    text: [
      { text: `${label}  `, bold: true, color: COLOR_TEXT },
      { text: value, color: COLOR_MUTED },
    ],
    fontSize,
    margin: [0, 3, 0, 0],
  };
}

// 1件のoccurrence（=Excelの1行）を、印刷して1枚のカードとして扱える単位で組み立てる。
// 【Sprint63】枠付きテーブル（1セル）でカード化し、期限を最も大きい文字で表示する（要件①③）。
// チェック欄（要件④）・メモ欄（要件⑤）をカード内に含める。改ページで内容が分断されないよう
// unbreakableを維持する。
function procedureCard(row: RoadmapExportRow): Content {
  const inner: Content[] = [
    // ── 見出し行: 期限を最大の文字で表示（要件①） ──
    {
      columns: [
        { text: formatDueDateLabel(row.dueDate), width: 100, fontSize: 22, bold: true, color: COLOR_TEXT },
        {
          width: '*',
          stack: [
            { text: row.procedureName, fontSize: 12, bold: true, color: COLOR_TEXT },
            { text: `【${row.category}】`, fontSize: 8, color: COLOR_MUTED, margin: [0, 2, 0, 0] },
          ],
        },
        { text: `[${row.status}]`, width: 64, fontSize: 9, alignment: 'right', color: COLOR_TEXT },
      ],
    },
    ruleLine(CARD_CONTENT_WIDTH, [0, 8, 0, 6]),
    // ── 詳細: 提出先・提出方法・必要書類（要件③） ──
    labeledLine('提出先', row.officeName || '未登録'),
  ];

  if (row.submissionMethod) {
    inner.push(labeledLine('提出方法', row.submissionMethod));
  }

  if (row.confidence !== '確定') {
    inner.push({
      text: `※ ${row.confidence}（登録情報が不足しているため、期限が変わる可能性があります）`,
      color: COLOR_TEXT,
      fontSize: 9,
      italics: true,
      margin: [0, 3, 0, 0],
    });
  }

  if (row.cautionNote) {
    inner.push({ text: row.cautionNote, color: COLOR_MUTED, fontSize: 8.5, margin: [0, 3, 0, 0] });
  }

  // 必要書類ガイド（Sprint53設計・Sprint54実装）。row.documentGuideはroadmapExport.tsが既に
  // [必要書類]/[事前準備]/[提出前チェック]の見出し付きで改行結合済み（Excelと同一のテキスト）。
  if (row.documentGuide) {
    inner.push({
      text: [{ text: '必要書類  ', bold: true, color: COLOR_TEXT, fontSize: 9 }],
      margin: [0, 3, 0, 0],
    });
    inner.push({
      stack: row.documentGuide.split('\n').map((line) => ({ text: line, color: COLOR_MUTED, fontSize: 8.5 })),
      margin: [0, 1, 0, 0],
    });
  }

  // URLが無い場合はURL欄自体を出さない（推測しない、Sprint50の方針を踏襲）。
  // QRコードは使わずURL文字列のみを表示する（Sprint63要件⑧）。
  if (row.url) {
    inner.push({
      text: `${row.linkKind === '公式' ? '公式ページ' : '関連ページ'}: ${row.url}`,
      link: row.url,
      color: COLOR_LINK,
      decoration: 'underline',
      fontSize: 8.5,
      margin: [0, 3, 0, 0],
    });
  }

  // ── チェック欄（要件④）: 印刷してペンでチェックする前提。PDFフォームにはしない ──
  inner.push({
    table: {
      widths: [10, 62, 10, 62, 10, 62],
      body: [[
        checkboxCell(), checkboxLabelCell('書類準備'),
        checkboxCell(), checkboxLabelCell('内容確認'),
        checkboxCell(), checkboxLabelCell('提出完了'),
      ]],
    },
    layout: 'noBorders',
    margin: [0, 10, 0, 0],
  });

  // ── メモ欄（要件⑤）: 3〜4行分の罫線のみ。手書き前提でラベル以外は空欄にする ──
  inner.push({
    text: 'メモ', bold: true, fontSize: 8, color: COLOR_MUTED, margin: [0, 8, 0, 0],
  });
  inner.push({
    stack: Array.from({ length: 3 }, () => ruleLine(CARD_CONTENT_WIDTH, [0, 14, 0, 0])),
  });

  return {
    unbreakable: true,
    table: { widths: ['*'], body: [[{ stack: inner }]] },
    layout: cardLayout,
    margin: [0, 0, 0, 12],
  };
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

// 月ごとに1ページを割り当てる（要件②）。最初の月は表紙直後のページ区切りをそのまま使うため
// pageBreakを付けず、2件目以降の月にのみ'before'を付ける。
function buildMonthPages(yearGroups: ReturnType<typeof groupRowsByYearMonth>): Content[] {
  const pages: Content[] = [];
  let isFirstMonth = true;
  for (const yearGroup of yearGroups) {
    for (const monthGroup of yearGroup.months) {
      const monthLabel = `${yearGroup.year}年${monthGroup.month}月`;
      pages.push({
        pageBreak: isFirstMonth ? undefined : 'before',
        stack: [
          { text: monthLabel, style: 'monthHeading' },
          { text: `${monthGroup.month}月の手続き`, style: 'monthSubheading' },
          // ── ページ上部に「今月やること」件数を明示（要件⑥） ──
          {
            text: `${monthGroup.month}月は${monthGroup.rows.length}件の行政手続きがあります。`,
            style: 'monthSummary',
          },
          ...monthGroup.rows.map((row) => procedureCard(row)),
        ],
      });
      isFirstMonth = false;
    }
  }
  return pages;
}

// 最終ページ: 年間チェックシート（要件⑦）。月ごとの件数と確認欄を一覧化し、年間を俯瞰できるようにする。
// 複数年にまたがる場合は「YYYY年M月」で全期間分を1つの表にまとめる（12ヶ月固定にはしない。
// horizonYearsが3年のため、1月だけの12行に切り詰めると2年目・3年目の月が消えてしまうため）。
function buildAnnualChecklistPage(yearGroups: ReturnType<typeof groupRowsByYearMonth>): Content {
  const headerRow = [
    { text: '年月', bold: true, fontSize: 9, color: COLOR_TEXT },
    { text: '件数', bold: true, fontSize: 9, color: COLOR_TEXT, alignment: 'center' as const },
    { text: '確認', bold: true, fontSize: 9, color: COLOR_TEXT, alignment: 'center' as const },
  ];
  const dataRows = yearGroups.flatMap((yg) =>
    yg.months.map((mg) => [
      { text: `${yg.year}年${mg.month}月`, fontSize: 9, color: COLOR_TEXT },
      { text: `${mg.rows.length}件`, fontSize: 9, color: COLOR_MUTED, alignment: 'center' as const },
      { canvas: [{ type: 'rect' as const, x: 22, y: 2, w: 9, h: 9, lineColor: COLOR_TEXT, lineWidth: 1 }] },
    ]),
  );

  return {
    pageBreak: 'before',
    stack: [
      { text: '年間チェックシート', style: 'monthHeading' },
      {
        text: '月ごとの手続き件数の一覧です。その月の対応がすべて終わったら確認欄にチェックしてください。',
        style: 'monthSummary',
      },
      {
        table: { widths: ['*', 70, 60], body: [headerRow, ...dataRows] },
        layout: checklistLayout,
        margin: [0, 10, 0, 0],
      },
    ],
  };
}

function buildDocumentDefinition(
  rows: RoadmapExportRow[],
  companyName: string,
  companyAddress: string,
  createdAt: Date,
): TDocumentDefinitions {
  const createdLabel = formatCreatedLabel(createdAt);
  const periodLabel = formatPeriodLabel(rows);
  const yearGroups = groupRowsByYearMonth(rows);
  const monthPages = buildMonthPages(yearGroups);
  const annualChecklistPage = buildAnnualChecklistPage(yearGroups);

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
      { text: 'SUNBOO', style: 'coverBrand', margin: [0, 110, 0, 4] },
      { text: '年間手続きロードマップ', style: 'coverTitle' },
      { text: '印刷して、そのまま1年間ご利用いただけます', style: 'coverSubtitle' },
      { text: companyName, style: 'coverCompany', margin: [0, 24, 0, 0] },
      ...(companyAddress ? [{ text: companyAddress, style: 'coverMeta' }] : []),
      { text: `対象期間: ${periodLabel}`, style: 'coverMeta' },
      { text: `作成日: ${createdLabel}`, style: 'coverMeta' },
      { text: DISCLAIMER, style: 'coverDisclaimer', margin: [0, 40, 0, 0] },
      { text: '', pageBreak: 'after' },
      // ── 本文（月単位ページ） ──
      ...monthPages,
      // ── 年間チェックシート ──
      annualChecklistPage,
    ],
    styles: {
      coverBrand: { fontSize: 14, bold: true, color: COLOR_LINK, alignment: 'center' },
      coverTitle: { fontSize: 22, bold: true, alignment: 'center' },
      coverSubtitle: { fontSize: 10, color: COLOR_MUTED, alignment: 'center', margin: [0, 6, 0, 0] },
      coverCompany: { fontSize: 16, bold: true, alignment: 'center' },
      coverMeta: { fontSize: 11, color: COLOR_MUTED, alignment: 'center', margin: [0, 2, 0, 0] },
      coverDisclaimer: { fontSize: 9, color: COLOR_MUTED, alignment: 'center' },
      monthHeading: { fontSize: 18, bold: true, margin: [0, 0, 0, 2] },
      monthSubheading: { fontSize: 10, color: COLOR_MUTED, margin: [0, 0, 0, 6] },
      monthSummary: { fontSize: 10, bold: true, color: COLOR_TEXT, margin: [0, 0, 0, 12] },
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
