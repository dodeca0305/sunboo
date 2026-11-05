import test from 'node:test';
import assert from 'node:assert/strict';
import { selectedFiscalYear, fiscalYearOptions, fiscalYearLabel, labelAfterEndDateChange, fiscalYearSelectionError, fiscalPeriodHeading, fiscalPeriodRange } from './taxReturnPeriod.ts';

test('跨年の実績は開始年でなく決算年を選び、年不一致は保存前に拒否する', () => {
  const label = fiscalYearLabel(2026, '2026-03-31');
  assert.equal(label, '2026年3月期');
  assert.equal(fiscalYearSelectionError(label, '2026-03-31'), null);
  assert.ok(fiscalYearSelectionError(label, '2025-03-31'));
  assert.equal(fiscalPeriodRange('2025-04-01', '2026-03-31'), '2025/04/01 〜 2026/03/31');
});
test('既存の任意表記は日付変更でも置換せず保持する', () => {
  assert.equal(selectedFiscalYear('第12期（令和7年度）'), null);
  assert.equal(labelAfterEndDateChange('第12期（令和7年度）', '2026-03-31'), '第12期（令和7年度）');
  assert.equal(fiscalYearSelectionError('第12期（令和7年度）', '2026-03-31'), null);
});
test('決算期変更・短期決算でも開始日を推測せず、実際の期間を表示する', () => {
  assert.equal(fiscalPeriodHeading('2026-09-15'), '2026年9月期の実績');
  assert.equal(fiscalPeriodRange('2026-07-01', '2026-09-15'), '2026/07/01 〜 2026/09/15');
  assert.equal(fiscalPeriodRange(null, '2024-02-29'), '開始日未入力 〜 2024/02/29');
  assert.equal(fiscalPeriodHeading(''), '対象決算期：決算日未入力');
});
test('年を選び直すと明示した年を保持し、決算日の入力で月期を確定する', () => {
  assert.equal(fiscalYearLabel(2026, ''), '2026年決算');
  assert.equal(labelAfterEndDateChange('2026年決算', '2026-03-31'), '2026年3月期');
  assert.equal(labelAfterEndDateChange('2026年3月期', '2025-12-31'), '2026年決算');
  assert.ok(fiscalYearSelectionError('2026年決算', '2025-12-31'));
});
test('既存の古い年・将来年も選択候補から消さない', () => {
  for (const selected of [1901, 2099]) {
    const years = fiscalYearOptions(2026, selected);
    assert.ok(years.includes(selected));
    assert.equal(new Set(years).size, years.length);
  }
});
