// Presentation/input helpers only. Never infer the start date or change tax dates.
export function selectedFiscalYear(label: string): number | null {
  const match = /^(\d{4})年(?:決算|(?:[1-9]|1[0-2])月期)$/.exec(label);
  return match ? Number(match[1]) : null;
}

export function fiscalYearOptions(currentYear: number, selected: number | null): number[] {
  const years = Array.from({ length: 106 }, (_, index) => currentYear + 5 - index);
  if (selected !== null && !years.includes(selected)) years.push(selected);
  return years.sort((a, b) => b - a);
}

export function fiscalYearLabel(year: number, endDate: string): string {
  return endDate.startsWith(`${year}-`)
    ? `${year}年${Number(endDate.slice(5, 7))}月期`
    : `${year}年決算`;
}

export function labelAfterEndDateChange(label: string, endDate: string): string {
  const year = selectedFiscalYear(label);
  return year === null ? label : fiscalYearLabel(year, endDate);
}

export function fiscalYearSelectionError(label: string, endDate: string): string | null {
  const year = selectedFiscalYear(label);
  return year !== null && endDate && !endDate.startsWith(`${year}-`)
    ? '対象年度と決算日の年が異なります。申告書を確認して、どちらかを修正してください。'
    : null;
}

export function fiscalPeriodHeading(endDate: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(endDate)
    ? `${Number(endDate.slice(0, 4))}年${Number(endDate.slice(5, 7))}月期の実績`
    : '対象決算期：決算日未入力';
}

export function fiscalPeriodRange(startDate: string | null, endDate: string): string {
  return `${startDate?.replaceAll('-', '/') || '開始日未入力'} 〜 ${endDate.replaceAll('-', '/') || '決算日未入力'}`;
}
