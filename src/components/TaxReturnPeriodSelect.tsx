'use client';

import { useId } from 'react';
import { fiscalYearLabel, fiscalYearOptions, selectedFiscalYear } from '@/lib/taxReturnPeriod';

export default function TaxReturnPeriodSelect({ value, endDate, onChange }: {
  value: string;
  endDate: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const year = selectedFiscalYear(value);
  const legacy = !!value && year === null;
  const currentYear = new Date().getFullYear();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="form-label">対象年度（決算日の年・必須）</label>
      <select id={id} className="form-input" required aria-describedby={`${id}-help`}
        value={legacy ? 'existing' : year === null ? '' : String(year)}
        onChange={(event) => onChange(event.target.value === 'existing' ? value : event.target.value ? fiscalYearLabel(Number(event.target.value), endDate) : '')}>
        <option value="">年を選択してください</option>
        {legacy && <option value="existing">登録済みの表記：{value}（変更せず保持）</option>}
        {fiscalYearOptions(currentYear, year).map((option) => <option key={option} value={option}>{option}年</option>)}
      </select>
      <p id={`${id}-help`} className="text-xs leading-relaxed text-sunboo-ink-muted">
        例：2025年4月〜2026年3月の実績は「2026年」を選びます。日付は下の項目で確認してください。
        {legacy && ' 登録済みの表記は、年を選び直すまで変更しません。'}
      </p>
    </div>
  );
}
