import type { ScheduleProcedure } from './scheduleProcedure';

type Procedure = Pick<ScheduleProcedure, 'code' | 'category' | 'e_filing_system_name' | 'e_filing_system_url'>;
type Entry = { state: 'ready'; system: string; note: string; links: { label: string; url: string }[] }
  | { state: 'missing' | 'unavailable' };

/** Route only registered tax systems to reviewed public entry pages; never infer from tax names. */
export function electronicFilingEntry(procedure: Procedure): Entry | null {
  if (!['tax', 'local_tax'].includes(procedure.category)) return null;
  const name = procedure.e_filing_system_name?.trim();
  const raw = procedure.e_filing_system_url;
  if (!name && !raw) return { state: 'missing' };
  try {
    const url = new URL(raw ?? '');
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash
      || url.pathname !== '/') return { state: 'unavailable' };
    const host = url.hostname.replace(/^www\./, '');
    const national = ['CORP_TAX_RETURN', 'CONSUMPTION_TAX_RETURN', 'WITHHOLDING_TAX', 'WITHHOLDING_SPECIAL_EXCEPTION', 'TAX_OFFICE_CHANGE_NOTICE'];
    const local = ['PREFECTURAL_RESIDENT_TAX_RETURN', 'PREFECTURAL_BUSINESS_TAX_RETURN', 'MUNICIPAL_RESIDENT_TAX_RETURN', 'DEPRECIABLE_ASSET_TAX_RETURN', 'SALARY_PAYMENT_REPORT', 'RESIDENT_TAX_WITHHOLDING', 'FUKUOKA_PREFECTURAL_ESTABLISHMENT_NOTICE', 'FUKUOKA_CITY_ESTABLISHMENT_NOTICE'];
    if (national.includes(procedure.code) && name === 'e-Tax' && host === 'e-tax.nta.go.jp') return {
      state: 'ready', system: 'e-Tax',
      note: '申告書の作成には、手続きに対応した税務ソフトが必要な場合があります。',
      links: [
        { label: '初めての方・使い方を確認', url: 'https://www.e-tax.nta.go.jp/hojin.html' },
        { label: 'e-Taxへログイン（法人）', url: 'https://login.e-tax.nta.go.jp/login/reception/loginCorporate' },
      ],
    };
    if (local.includes(procedure.code) && name?.startsWith('eLTAX') && host === 'eltax.lta.go.jp') return {
      state: 'ready', system: 'eLTAX',
      note: '利用するソフトは、税目や手続きの内容によって異なります。リンク先で確認してください。',
      links: [{ label: 'eLTAXの利用案内・手続きの入口', url: 'https://www.lta.go.jp/eltax/shinkoku/pcdesk/' }],
    };
  } catch { /* Missing or invalid metadata must not become an executable link. */ }
  return { state: 'unavailable' };
}
