// ── 償却資産申告の下書き（純粋モデル）──────────────────────────────
// 画面内で入力→即時プレビュー→Excel1ファイルの下書きを作るための計算層。
// 下書き作成のみ。課税対象の判定・分類・償却/税額計算・期限計算・提出可否の判断は一切しない。
// 未入力/不明は空欄・未入力・要確認として扱い、0に置換しない。

export const DRAFT_NOTICE = '下書き・提出用ではありません';
export const MAX_ROWS = 100;
export const MAX_NAME_LENGTH = 100;
export const MAX_ADDRESS_LENGTH = 200;
export const MAX_REPRESENTATIVE_LENGTH = 60;
export const MIN_YEAR = 1989;
export const MAX_YEAR = 2100;
export const MAX_USEFUL_LIFE = 100;

export const ASSET_CATEGORIES = [
  { value: '1', label: '1 構築物' },
  { value: '2', label: '2 機械及び装置' },
  { value: '3', label: '3 船舶' },
  { value: '4', label: '4 航空機' },
  { value: '5', label: '5 車両及び運搬具' },
  { value: '6', label: '6 工具、器具及び備品' },
] as const;

export const ACQUISITION_REASONS = [
  { value: 'new', label: '新品として取得' },
  { value: 'used', label: '中古として取得' },
  { value: 'other', label: 'その他' },
] as const;

export type AssetRowInput = {
  id: string;
  name: string;
  quantity: string;
  acquiredOn: string;
  totalCost: string; // この行の取得価額の合計（円）。数量を掛けない。
  usefulLife: string;
  category: string; // '' | '1'..'6'
  reason: string; // '' | 'new' | 'used' | 'other'
};

export type DraftInput = {
  companyName: string;
  address: string;
  /** 登録済みの都道府県+市区町村。住所がこれだけなら番地未登録として不足扱い。 */
  addressBase: string;
  representative: string;
  targetYear: string;
  ownershipConfirmed: boolean;
  assets: AssetRowInput[];
};

export type RowIssue =
  | 'name' | 'quantity' | 'acquiredOn' | 'totalCost' | 'usefulLife' | 'category' | 'reason'
  | 'costOverflow';

export const ROW_ISSUE_LABEL: Record<RowIssue, string> = {
  name: '資産名が未入力または不正です',
  quantity: '数量が未入力または正の整数ではありません',
  acquiredOn: '取得年月日が未入力または存在しない日付です',
  totalCost: '取得価額（この行の合計）が未入力または正の整数ではありません',
  usefulLife: '耐用年数が未入力または1〜100の整数ではありません',
  category: '種類が未選択です',
  reason: '取得区分が未選択です',
  costOverflow: '取得価額が大きすぎるため集計できません',
};

// ── 部品 ──────────────────────────────────────────────

/** 制御文字・ゼロ幅/方向制御文字を除去し前後空白を削る。式として解釈させないため文字列のまま扱う。 */
export function cleanText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return Array.from(value)
    .filter((ch) => {
      const c = ch.codePointAt(0) ?? 0;
      if (c < 0x20 || c === 0x7f) return false;
      if (c >= 0x80 && c <= 0x9f) return false;
      if ((c >= 0x200b && c <= 0x200f) || (c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069) || c === 0xfeff) return false;
      return true;
    })
    .join('')
    .trim();
}

function toAsciiDigits(value: string): string {
  return value.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0));
}

/** 正の安全な整数のみ許可（カンマ区切りは許容）。それ以外はnull。0・小数・負・空はnull。 */
export function parsePositiveSafeInteger(value: string): number | null {
  const raw = toAsciiDigits(cleanText(value)).replace(/，/g, ',');
  // カンマ無し、または正しい3桁区切り（1,234 / 12,345,678）のみ許可。1,,2 や 12,34 は不正。
  if (!/^(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)$/.test(raw)) return null;
  const s = raw.replace(/,/g, '');
  const n = Number(s);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** 実在するISO日付（YYYY-MM-DD、うるう年を含む）のみtrue。 */
export function isValidIsoDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1 || mo < 1 || mo > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return d <= days;
}

export function parseTargetYear(value: string): number | null {
  const s = toAsciiDigits(cleanText(value));
  if (!/^\d{4}$/.test(s)) return null;
  const n = Number(s);
  return n >= MIN_YEAR && n <= MAX_YEAR ? n : null;
}

export function parseUsefulLife(value: string): number | null {
  const n = parsePositiveSafeInteger(value);
  return n !== null && n <= MAX_USEFUL_LIFE ? n : null;
}

// ── 書類の特定・対象年の提案 ────────────────────────────────

type RequiredDocLike = { name: string; nearestDueDate: string; procedures: string[] };

/**
 * 既存の必要書類から「償却資産申告」の償却資産申告書と種類別明細書が両方あるときだけ結果を返す。
 * 対象年は既存の期限の年から提案するだけ（法定期限ではない。実行時刻から推測しない）。
 */
export function findDepreciationDocuments(
  docs: readonly RequiredDocLike[] | null | undefined,
): { suggestedYear: string } | null {
  if (!docs) return null;
  const forProcedure = docs.filter((d) => d.procedures.some((p) => p.includes('償却資産申告')));
  const form = forProcedure.find((d) => d.name.includes('償却資産申告書'));
  const detail = forProcedure.find((d) => d.name.includes('種類別明細書'));
  if (!form || !detail) return null;
  const due = [form.nearestDueDate, detail.nearestDueDate].filter((d) => isValidIsoDate(d)).sort()[0];
  return { suggestedYear: due ? due.slice(0, 4) : '' };
}

export function buildCompanySource(
  companyName: string,
  prefectureName: string,
  municipalityName: string,
  street: string | null | undefined,
): { companyName: string; address: string; addressBase: string; addressComplete: boolean } {
  const addressBase = `${cleanText(prefectureName)}${cleanText(municipalityName)}`;
  const st = cleanText(street ?? '');
  const complete = Boolean(cleanText(prefectureName) && cleanText(municipalityName) && st);
  return { companyName: cleanText(companyName), address: `${addressBase}${st}`, addressBase, addressComplete: complete };
}

// ── 行の操作 ──────────────────────────────────────────

export function createBlankRow(id: string): AssetRowInput {
  return { id, name: '', quantity: '', acquiredOn: '', totalCost: '', usefulLife: '', category: '', reason: '' };
}

export function addRow(rows: readonly AssetRowInput[], id: string): AssetRowInput[] {
  if (rows.length >= MAX_ROWS || rows.some((r) => r.id === id)) return [...rows];
  return [...rows, createBlankRow(id)];
}

export function removeRow(rows: readonly AssetRowInput[], id: string): AssetRowInput[] {
  return rows.filter((r) => r.id !== id);
}

export function updateRow(
  rows: readonly AssetRowInput[], id: string, patch: Partial<Omit<AssetRowInput, 'id'>>,
): AssetRowInput[] {
  return rows.map((r) => (r.id === id ? { ...r, ...patch } : r));
}

/** ダウンロード時点の値を固定するための複製。以後の入力変更は影響しない。 */
export function freezeInput(input: DraftInput): DraftInput {
  return { ...input, assets: input.assets.map((a) => ({ ...a })) };
}

// ── モデル ────────────────────────────────────────────

export type RowModel = {
  id: string;
  index: number;
  name: string; // 清浄化済み文字列（空は空）
  quantity: number | null;
  quantityRaw: string;
  acquiredOn: string | null; // 検証済みISO
  acquiredOnRaw: string;
  totalCost: number | null;
  totalCostRaw: string;
  usefulLife: number | null;
  usefulLifeRaw: string;
  category: string | null;
  categoryLabel: string | null;
  reason: string | null;
  reasonLabel: string | null;
  blank: boolean; // 全項目が空
  issues: RowIssue[];
};

export type CategoryTotal = {
  category: string;
  label: string;
  rowCount: number; // この種類を選んだ行数
  countedRows: number; // うち取得価額が有効で集計に含めた行数
  incompleteRows: number; // 種類は選択済みだが取得価額が無効/空の行数
  total: number | null; // 有効行なし/桁あふれ→null（0にしない）
  overflow: boolean;
};

export type DraftModel = {
  companyName: string;
  address: string;
  representative: string;
  targetYear: number | null;
  targetYearRaw: string;
  ownershipConfirmed: boolean;
  rows: RowModel[];
  categoryTotals: CategoryTotal[];
  uncategorizedRows: number; // 種類未選択の行数（空行を除く）
  invalidCostRows: number; // 取得価額が無効/空の行数（空行を除く）
  grandTotal: number | null; // 全行が集計可能なときだけ数値。それ以外null（要確認）
  grandTotalComplete: boolean;
  totalOverflow: boolean; // 種類内または種類をまたぐ合計の桁あふれ
  missing: string[];
  hasMissing: boolean;
};

function rowIsBlank(r: AssetRowInput): boolean {
  return !cleanText(r.name) && !cleanText(r.quantity) && !cleanText(r.acquiredOn) &&
    !cleanText(r.totalCost) && !cleanText(r.usefulLife) && !r.category && !r.reason;
}

export function buildRowModel(r: AssetRowInput, index: number): RowModel {
  const name = cleanText(r.name);
  const quantity = parsePositiveSafeInteger(r.quantity);
  const acquiredRaw = cleanText(r.acquiredOn);
  const acquiredOn = isValidIsoDate(acquiredRaw) ? acquiredRaw : null;
  const totalCost = parsePositiveSafeInteger(r.totalCost);
  const usefulLife = parseUsefulLife(r.usefulLife);
  const cat = ASSET_CATEGORIES.find((c) => c.value === r.category) ?? null;
  const reason = ACQUISITION_REASONS.find((c) => c.value === r.reason) ?? null;
  const issues: RowIssue[] = [];
  if (!name || name.length > MAX_NAME_LENGTH) issues.push('name');
  if (quantity === null) issues.push('quantity');
  if (acquiredOn === null) issues.push('acquiredOn');
  if (totalCost === null) issues.push('totalCost');
  if (usefulLife === null) issues.push('usefulLife');
  if (!cat) issues.push('category');
  if (!reason) issues.push('reason');
  return {
    id: r.id, index, name, quantity, quantityRaw: cleanText(r.quantity),
    acquiredOn, acquiredOnRaw: acquiredRaw, totalCost, totalCostRaw: cleanText(r.totalCost),
    usefulLife, usefulLifeRaw: cleanText(r.usefulLife),
    category: cat?.value ?? null, categoryLabel: cat?.label ?? null,
    reason: reason?.value ?? null, reasonLabel: reason?.label ?? null,
    blank: rowIsBlank(r), issues,
  };
}

export function buildDraftModel(input: DraftInput): DraftModel {
  const companyName = cleanText(input.companyName);
  const address = cleanText(input.address);
  const base = cleanText(input.addressBase);
  const representative = cleanText(input.representative);
  const targetYear = parseTargetYear(input.targetYear);
  const rows = input.assets.slice(0, MAX_ROWS).map((a, i) => buildRowModel(a, i));
  const entered = rows.filter((r) => !r.blank);

  const categoryTotals: CategoryTotal[] = ASSET_CATEGORIES.map((c) => {
    const inCat = entered.filter((r) => r.category === c.value);
    const valid = inCat.filter((r) => r.totalCost !== null);
    let sum = 0;
    let overflow = false;
    for (const r of valid) {
      const next = sum + (r.totalCost as number);
      if (!Number.isSafeInteger(next)) { overflow = true; break; }
      sum = next;
    }
    if (overflow) for (const r of valid) if (!r.issues.includes('costOverflow')) r.issues.push('costOverflow');
    return {
      category: c.value, label: c.label, rowCount: inCat.length, countedRows: valid.length,
      incompleteRows: inCat.length - valid.length,
      total: overflow || valid.length === 0 ? null : sum, overflow,
    };
  });

  const uncategorizedRows = entered.filter((r) => r.category === null).length;
  const invalidCostRows = entered.filter((r) => r.totalCost === null).length;
  let anyOverflow = categoryTotals.some((c) => c.overflow);
  let grandTotal: number | null = null;
  if (entered.length > 0 && uncategorizedRows === 0 && invalidCostRows === 0 && !anyOverflow) {
    let s = 0;
    for (const c of categoryTotals) {
      if (c.total === null) continue;
      const next = s + c.total;
      if (!Number.isSafeInteger(next)) { anyOverflow = true; break; } // 種類をまたぐ総合計の桁あふれ
      s = next;
    }
    if (!anyOverflow) grandTotal = s;
  }
  const grandTotalComplete = grandTotal !== null;

  const missing: string[] = [];
  if (!companyName) missing.push('会社名');
  else if (companyName.length > MAX_NAME_LENGTH) missing.push('会社名（長すぎます）');
  if (!address || address === base || address.length <= base.length) missing.push('所在地（番地まで）');
  else if (address.length > MAX_ADDRESS_LENGTH) missing.push('所在地（長すぎます）');
  if (!representative) missing.push('代表者名');
  else if (representative.length > MAX_REPRESENTATIVE_LENGTH) missing.push('代表者名（長すぎます）');
  if (targetYear === null) missing.push(`対象年（${MIN_YEAR}〜${MAX_YEAR}の4桁）`);
  if (entered.length === 0) missing.push('資産が1件も入力されていません');
  const rowMissing = (issue: RowIssue, label: string) => {
    const n = entered.filter((r) => r.issues.includes(issue)).length;
    if (n > 0) missing.push(`${label}（${n}件）`);
  };
  rowMissing('name', '資産名');
  rowMissing('quantity', '数量');
  rowMissing('acquiredOn', '取得年月日');
  rowMissing('totalCost', '取得価額');
  rowMissing('usefulLife', '耐用年数');
  rowMissing('category', '種類');
  rowMissing('reason', '取得区分');
  if (anyOverflow) missing.push('取得価額の合計が大きすぎます');
  if (!input.ownershipConfirmed) missing.push('対象年1月1日時点で所有していた資産であることの確認');

  return {
    companyName, address, representative, targetYear, targetYearRaw: cleanText(input.targetYear),
    ownershipConfirmed: input.ownershipConfirmed === true, rows, categoryTotals,
    uncategorizedRows, invalidCostRows, grandTotal, grandTotalComplete, totalOverflow: anyOverflow, missing, hasMissing: missing.length > 0,
  };
}

export function rowWarnings(r: RowModel): string[] {
  return r.blank ? ['未入力の行です'] : r.issues.map((i) => ROW_ISSUE_LABEL[i]);
}

export const FORM_FIELDS_NOT_FILLED_NOTE =
  '前年までに所有していた資産・当年の増加/減少・評価額・課税標準額・所有者コード・連絡先・業種などの公式様式の欄は未記入です。公式様式で確認してください。';

export function formatYen(n: number | null): string {
  return n === null ? '要確認' : `${n.toLocaleString('ja-JP')}円`;
}
