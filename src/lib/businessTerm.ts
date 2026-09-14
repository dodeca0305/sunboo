function parseIsoDate(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) return null;
  return { year, month, day };
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function compareDate(
  left: { year: number; month: number; day: number },
  right: { year: number; month: number; day: number },
): number {
  return left.year - right.year || left.month - right.month || left.day - right.day;
}

export function getBusinessTermNumber(
  establishedDate: string,
  fiscalMonth: number | null,
  asOfDate: string,
): number | null {
  const established = parseIsoDate(establishedDate);
  const asOf = parseIsoDate(asOfDate);
  if (!established || !asOf || !Number.isInteger(fiscalMonth) || fiscalMonth === null || fiscalMonth < 1 || fiscalMonth > 12) {
    return null;
  }
  if (compareDate(asOf, established) < 0) return null;

  let firstEndYear = established.year;
  let firstEnd = {
    year: firstEndYear,
    month: fiscalMonth,
    day: lastDayOfMonth(firstEndYear, fiscalMonth),
  };
  if (compareDate(firstEnd, established) < 0) {
    firstEndYear += 1;
    firstEnd = {
      year: firstEndYear,
      month: fiscalMonth,
      day: lastDayOfMonth(firstEndYear, fiscalMonth),
    };
  }

  if (compareDate(asOf, firstEnd) <= 0) return 1;
  const asOfEnd = {
    year: asOf.year,
    month: fiscalMonth,
    day: lastDayOfMonth(asOf.year, fiscalMonth),
  };
  const completedTerms = asOf.year - firstEndYear + (compareDate(asOf, asOfEnd) > 0 ? 1 : 0);
  return completedTerms + 1;
}
