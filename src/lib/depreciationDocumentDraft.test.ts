import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {
  addRow, buildCompanySource, buildDraftModel, cleanText, createBlankRow, findDepreciationDocuments,
  freezeInput, isValidIsoDate, parsePositiveSafeInteger, parseTargetYear, removeRow, updateRow, MAX_ROWS,
  type AssetRowInput, type DraftInput,
} from './depreciationDocumentDraft.ts';
import {
  buildDepreciationDraftBuffer, buildDepreciationDraftFilename, SHEET_DETAIL, SHEET_FORM,
} from './depreciationDocumentDraftExcel.ts';

const row = (id: string, p: Partial<AssetRowInput> = {}): AssetRowInput => ({ ...createBlankRow(id), ...p });
const full = (id: string, p: Partial<AssetRowInput> = {}): AssetRowInput =>
  row(id, { name: '合成資産', quantity: '3', acquiredOn: '2024-02-29', totalCost: '300000', usefulLife: '5', category: '6', reason: 'new', ...p });
const input = (assets: AssetRowInput[], p: Partial<DraftInput> = {}): DraftInput => ({
  companyName: '合成会社', address: '東京都千代田区1-1', addressBase: '東京都千代田区', representative: '合成代表',
  targetYear: '2027', ownershipConfirmed: true, assets, ...p,
});

test('blank vs 0: 未入力は0にならず合計はnull、要確認に出る', () => {
  const m = buildDraftModel(input([row('a')], { ownershipConfirmed: false, representative: '' }));
  assert.equal(m.grandTotal, null);
  assert.equal(m.grandTotalComplete, false);
  assert.ok(m.categoryTotals.every((c) => c.total === null));
  assert.ok(m.missing.includes('代表者名'));
  assert.ok(m.missing.some((s) => s.includes('資産が1件も')));
  assert.ok(m.missing.some((s) => s.includes('所有していた')));
  assert.equal(parsePositiveSafeInteger('0'), null);
  assert.equal(parsePositiveSafeInteger(''), null);
});

test('日付：うるう年・存在しない日付・形式', () => {
  assert.equal(isValidIsoDate('2024-02-29'), true);
  assert.equal(isValidIsoDate('2023-02-29'), false);
  assert.equal(isValidIsoDate('1900-02-29'), false);
  assert.equal(isValidIsoDate('2000-02-29'), true);
  assert.equal(isValidIsoDate('2024-13-01'), false);
  assert.equal(isValidIsoDate('2024-04-31'), false);
  assert.equal(isValidIsoDate('2024-4-1'), false);
  assert.equal(isValidIsoDate(''), false);
});

test('対象年の範囲', () => {
  assert.equal(parseTargetYear('2027'), 2027);
  assert.equal(parseTargetYear('１９９０'), 1990);
  for (const v of ['', '27', '1988', '2101', '2027.5', 'abcd', '-2027']) assert.equal(parseTargetYear(v), null, v);
});

test('数量・取得価額は正の安全な整数のみ', () => {
  assert.equal(parsePositiveSafeInteger('1,234'), 1234);
  assert.equal(parsePositiveSafeInteger('１２'), 12);
  for (const v of ['-1', '1.5', '1e3', '9007199254740992', ' ', 'abc', '0x10']) assert.equal(parsePositiveSafeInteger(v), null, v);
  assert.equal(parsePositiveSafeInteger('9007199254740991'), 9007199254740991);
});

test('合計の桁あふれは偽の0/誤った数にならずnull＋要確認', () => {
  const m = buildDraftModel(input([
    full('a', { totalCost: '9007199254740991', category: '1' }),
    full('b', { totalCost: '5', category: '1' }),
  ]));
  assert.equal(m.categoryTotals[0].total, null);
  assert.equal(m.categoryTotals[0].overflow, true);
  assert.equal(m.grandTotal, null);
  assert.ok(m.missing.some((s) => s.includes('大きすぎ')));
});

test('複数種類の合計・数量を掛けない', () => {
  const m = buildDraftModel(input([
    full('a', { quantity: '10', totalCost: '100000', category: '6' }),
    full('b', { quantity: '2', totalCost: '50000', category: '6' }),
    full('c', { quantity: '1', totalCost: '700000', category: '5' }),
  ]));
  assert.equal(m.categoryTotals.find((c) => c.category === '6')?.total, 150000);
  assert.equal(m.categoryTotals.find((c) => c.category === '5')?.total, 700000);
  assert.equal(m.categoryTotals.find((c) => c.category === '1')?.total, null);
  assert.equal(m.grandTotal, 850000);
  assert.equal(m.hasMissing, false);
});

test('不完全：種類未選択・不正金額は総合計を出さず区別される', () => {
  const m = buildDraftModel(input([
    full('a', { category: '6' }),
    full('b', { category: '' }),
    full('c', { totalCost: 'abc', category: '6' }),
  ]));
  assert.equal(m.uncategorizedRows, 1);
  assert.equal(m.invalidCostRows, 1);
  const c6 = m.categoryTotals.find((c) => c.category === '6')!;
  assert.equal(c6.total, 300000);
  assert.equal(c6.incompleteRows, 1);
  assert.equal(m.grandTotal, null);
  assert.equal(m.grandTotalComplete, false);
});

test('行の追加・削除は安定ID、上限あり', () => {
  let rows = [createBlankRow('r1')];
  rows = addRow(rows, 'r2');
  rows = addRow(rows, 'r2'); // 重複IDは追加されない
  assert.deepEqual(rows.map((r) => r.id), ['r1', 'r2']);
  rows = updateRow(rows, 'r2', { name: 'x' });
  rows = removeRow(rows, 'r1');
  assert.deepEqual(rows.map((r) => r.id), ['r2']);
  assert.equal(rows[0].name, 'x');
  let many = [createBlankRow('0')];
  for (let i = 1; i < MAX_ROWS + 5; i++) many = addRow(many, String(i));
  assert.equal(many.length, MAX_ROWS);
});

test('登録住所：番地なしは不足、完全なら不足なし', () => {
  const p = buildCompanySource('合成会社', '東京都', '千代田区', null);
  assert.equal(p.addressComplete, false);
  assert.equal(p.address, '東京都千代田区');
  assert.ok(buildDraftModel(input([full('a')], { address: p.address, addressBase: p.addressBase })).missing.includes('所在地（番地まで）'));
  const c = buildCompanySource('合成会社', '東京都', '千代田区', '1-1');
  assert.equal(c.addressComplete, true);
  assert.ok(!buildDraftModel(input([full('a')], { address: c.address, addressBase: c.addressBase })).missing.includes('所在地（番地まで）'));
  assert.equal(buildCompanySource('x', '', '', '1-1').addressComplete, false);
});

test('所有確認は未確認が既定で不足に出る', () => {
  const m = buildDraftModel(input([full('a')], { ownershipConfirmed: false }));
  assert.equal(m.ownershipConfirmed, false);
  assert.ok(m.missing.some((s) => s.includes('1月1日時点')));
});

test('スナップショット：複製後の入力変更は影響しない', () => {
  const src = input([full('a')]);
  const snap = freezeInput(src);
  src.assets[0].name = '変更後';
  src.companyName = '別会社';
  assert.equal(snap.assets[0].name, '合成資産');
  assert.equal(snap.companyName, '合成会社');
});

test('不正文字：制御/方向制御文字を除去、式風は文字列のまま、長さ超過は不足', () => {
  assert.equal(cleanText('a\u0000b‮c​d\n'), 'abcd');
  assert.equal(cleanText(null as unknown as string), '');
  const m = buildDraftModel(input([full('a', { name: 'あ'.repeat(101) })]));
  assert.ok(m.missing.some((s) => s.startsWith('資産名')));
});

test('必要書類の特定：両書類＋償却資産申告のときだけ。年は期限の年', () => {
  const d = (name: string, due: string, procedures: string[]) => ({ name, nearestDueDate: due, procedures });
  assert.deepEqual(findDepreciationDocuments([
    d('償却資産申告書', '2027-01-31', ['償却資産申告']), d('種類別明細書', '2027-01-31', ['償却資産申告']),
  ]), { suggestedYear: '2027' });
  assert.equal(findDepreciationDocuments([d('償却資産申告書', '2027-01-31', ['償却資産申告'])]), null);
  assert.equal(findDepreciationDocuments([d('償却資産申告書', '2027-01-31', ['他']), d('種類別明細書', '2027-01-31', ['他'])]), null);
  assert.equal(findDepreciationDocuments(null), null);
  assert.deepEqual(findDepreciationDocuments([
    d('償却資産申告書', 'bad', ['償却資産申告']), d('種類別明細書', 'bad', ['償却資産申告']),
  ]), { suggestedYear: '' });
});

test('XLSX往復：2タブ・下書き表示・空欄・型・式風文字列・合計一致', async () => {
  const buf = await buildDepreciationDraftBuffer(input([
    full('a', { name: '=SUM(1,2)', totalCost: '100000', category: '6' }),
    full('b', { name: '+cmd|x', totalCost: '250000', category: '6', acquiredOn: '2023-02-29' }),
    row('c', { name: '@bad', quantity: 'x' }),
  ], { representative: '' }), new Date('2026-11-16T00:00:00Z'));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as ArrayBuffer);
  assert.deepEqual(wb.worksheets.map((w) => w.name), [SHEET_DETAIL, SHEET_FORM]);
  for (const ws of wb.worksheets) assert.match(String(ws.getCell(1, 1).value), /下書き・提出用ではありません/);
  const d = wb.getWorksheet(SHEET_DETAIL)!;
  let hdr = 0;
  d.eachRow((r, n) => { if (r.getCell(1).value === 'No.') hdr = n; });
  const r1 = d.getRow(hdr + 1);
  assert.equal(r1.getCell(2).type, ExcelJS.ValueType.String);
  assert.equal(r1.getCell(2).value, '=SUM(1,2)');
  assert.equal(typeof r1.getCell(3).value, 'number');
  assert.ok(r1.getCell(4).value instanceof Date);
  assert.equal((r1.getCell(4).value as Date).toISOString().slice(0, 10), '2024-02-29');
  assert.equal(r1.getCell(5).value, 100000);
  const r2 = d.getRow(hdr + 2);
  assert.equal(typeof r2.getCell(4).value, 'string'); // 不正日付は文字のまま
  assert.match(String(r2.getCell(9).value), /取得年月日/);
  const r3 = d.getRow(hdr + 3);
  assert.equal(r3.getCell(5).value, null); // 空欄は空欄
  assert.equal(r3.getCell(6).value, null);
  assert.equal(r3.getCell(3).value, 'x');
  const f = wb.getWorksheet(SHEET_FORM)!;
  let c6 = 0, grand = 0;
  f.eachRow((r) => {
    if (String(r.getCell(1).value).startsWith('6 ')) c6 = r.getCell(3).value as number;
    if (String(r.getCell(1).value).startsWith('入力した資産の取得価額 総合計')) grand = r.getCell(3).value as number;
  });
  assert.equal(c6, 350000);
  assert.equal(grand, null); // 空行ではなく入力済み行cが不完全のため総合計は空欄
  const texts: string[] = [];
  f.eachRow((r) => r.eachCell((c) => texts.push(String(c.value))));
  assert.ok(texts.some((t) => t.includes('代表者名') && t.includes('要確認')));
  assert.ok(texts.some((t) => t.includes('未記入です')));
});

test('ファイル名は既存サニタイズを使う', () => {
  const n = buildDepreciationDraftFilename('A/B:会社', new Date(2026, 10, 16));
  assert.equal(n, 'SUNBOO_償却資産申告_下書き_AB会社_2026-11-16.xlsx');
});

test('種類をまたぐ総合計の桁あふれは不完全＋要確認（各種類は安全）', () => {
  const m = buildDraftModel(input([
    full('a', { totalCost: '9007199254740991', category: '1' }),
    full('b', { totalCost: '5', category: '2' }),
  ]));
  assert.equal(m.categoryTotals[0].total, 9007199254740991);
  assert.equal(m.categoryTotals[1].total, 5);
  assert.equal(m.grandTotal, null);
  assert.equal(m.grandTotalComplete, false);
  assert.equal(m.totalOverflow, true);
  assert.equal(m.hasMissing, true);
  assert.ok(m.missing.some((s) => s.includes('大きすぎ')));
});

test('桁区切り：正しい3桁区切りかカンマ無しのみ', () => {
  assert.equal(parsePositiveSafeInteger('12,345,678'), 12345678);
  assert.equal(parsePositiveSafeInteger('１，２３４'), 1234);
  for (const v of ['1,,2', '12,34', ',123', '123,', '1,2345', '1,23,456']) assert.equal(parsePositiveSafeInteger(v), null, v);
});

test('XLSX：長い文字は折り返しと行高を確保', async () => {
  const long = '長'.repeat(90);
  const buf = await buildDepreciationDraftBuffer(input([full('a', { name: long, totalCost: 'x' })], { address: long }), new Date(0));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as ArrayBuffer);
  const d = wb.getWorksheet(SHEET_DETAIL)!;
  let nameRow = 0, addrRow = 0;
  d.eachRow((r, n) => {
    if (r.getCell(2).value === long && r.getCell(1).value === 1) nameRow = n;
    if (r.getCell(1).value === '所在地') addrRow = n;
  });
  assert.ok(nameRow > 0 && addrRow > 0);
  assert.equal(d.getRow(nameRow).getCell(2).alignment?.wrapText, true);
  assert.ok((d.getRow(nameRow).height ?? 0) >= 16 * 6, 'name row height');
  assert.ok((d.getRow(addrRow).height ?? 0) >= 16 * 2, 'address row height'); // 結合幅が広く180文字幅で2行
});
