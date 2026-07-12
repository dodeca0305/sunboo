// ── 出力ファイル名 — 共通サニタイズ（Sprint 52）─────────────────────────
// Sprint51で作った簡易版（半角記号のみ除去）をWindows/macOS双方で安全な形へ拡張し、
// Excel（roadmapExcelWorkbook.ts）・PDF（roadmapPdfDocument.ts）の両方から共通で使う
// （docs/BETA_BACKLOG.md L-04の対応）。

const UNSAFE_FILENAME_CHARS = [
  // OS/ブラウザ共通の禁止記号（半角）
  '\\', '/', ':', '*', '?', '"', '<', '>', '|',
  // 見た目が似ている全角記号（そのまま許可すると混乱を招くため統一的に除去する）
  '／', '＼', '：', '＊', '？', '＂', '＜', '＞', '｜',
];

// Windows は大文字小文字を区別せずこれらのファイル名（拡張子を除く）を予約している。
const WINDOWS_RESERVED_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);

const MAX_COMPANY_NAME_LENGTH = 40;

// 会社名をファイル名の一部として安全に使える形へ変換する。
// - 禁止記号（半角/全角）を除去
// - 制御文字を除去
// - 末尾のピリオド・空白を除去（Windowsで作成に失敗するため）
// - 長すぎる場合は切り詰める
// - Windows予約デバイス名と完全一致する場合は末尾に記号を足して回避する
export function sanitizeCompanyNameForFilename(companyName: string): string {
  let result = companyName;
  for (const ch of UNSAFE_FILENAME_CHARS) {
    result = result.split(ch).join('');
  }
  // 制御文字（0x00-0x1F）を除去。Array.fromでコードポイント単位に扱い、
  // サロゲートペア（一部の異体字等）を壊さないようにする。
  result = Array.from(result)
    .filter((ch) => (ch.codePointAt(0) ?? 0) >= 0x20)
    .join('');

  result = result.replace(/[.\s]+$/u, ''); // 末尾のピリオド・空白（Windows制約）
  result = result.trim();

  if (result.length > MAX_COMPANY_NAME_LENGTH) {
    result = result.slice(0, MAX_COMPANY_NAME_LENGTH);
  }

  if (WINDOWS_RESERVED_NAMES.has(result.toUpperCase())) {
    result = `${result}_`;
  }

  return result || '会社名未設定';
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// prefix・会社名・作成日・拡張子からファイル名を組み立てる共通関数。
// Excel: buildExportFilename('SUNBOO_年間ロードマップ', companyName, createdAt, 'xlsx')
// PDF:   buildExportFilename('SUNBOO_年間ロードマップ', companyName, createdAt, 'pdf')
export function buildExportFilename(prefix: string, companyName: string, createdAt: Date, extension: string): string {
  const safeName = sanitizeCompanyNameForFilename(companyName);
  return `${prefix}_${safeName}_${formatDate(createdAt)}.${extension}`;
}
