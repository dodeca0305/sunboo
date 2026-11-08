import type { TaxReturnEntry } from './taxReturnProfile';

export type TaxReturnFocus = { entry: string; field: 'fiscalYearEndDate' | 'filedDate' };

export function parseTaxReturnFocus(params: Record<string, string | string[] | undefined>): TaxReturnFocus | null {
  if (params.entry === 'new' && params.field === 'fiscalYearEndDate')
    return { entry: 'new', field: 'fiscalYearEndDate' };
  if (typeof params.entry === 'string' && /^[1-9]\d*$/.test(params.entry)
    && Number.isSafeInteger(Number(params.entry)) && params.field === 'filedDate')
    return { entry: params.entry, field: 'filedDate' };
  return null;
}

export function resolveTaxReturnFocus(entries: TaxReturnEntry[], focus: TaxReturnFocus | null) {
  if (!focus) return null;
  if (focus.entry === 'new') return { focus, entry: null };
  const entry = entries.find(entry => entry.id === focus.entry);
  return entry ? { focus, entry } : null;
}
