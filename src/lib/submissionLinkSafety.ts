import type { ScheduleProcedure } from './scheduleProcedure';

// Confirmed 404 during the company-23 trial, 2026-11-06. This is a known-bad
// destination check, not a network availability check or a replacement for source review.
export function isKnownUnavailableSubmissionUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.hostname.replace(/^www\./, '') === 'city.shibuya.tokyo.jp'
      && url.pathname.replace(/\/+$/, '') === '/kurashi/zeikin/hojin';
  } catch { return false; }
}

export type SubmissionGuidance = {
  message: string;
  reference: { label: string; url: string };
};
export type SubmissionLocation = { prefectureCode: string | null; municipalityCode: string | null };
export function isTokyoSpecialWard(location: SubmissionLocation): boolean {
  // The legacy master has five-digit codes; newer data uses six-digit JIS codes.
  return location.prefectureCode === '13' && /^131(?:0[1-9]|1\d|2[0-3])\d?$/.test(location.municipalityCode ?? '');
}
const ASSET_GUIDANCE: SubmissionGuidance = {
  message: '資産の所在地を確認してください。東京23区内の資産は、資産がある区の都税事務所へ申告します。23区外の資産は所在する市町村の案内を確認してください。本店所在地だけでは提出先を確定できません。',
  reference: { label: '東京都の償却資産の説明（23区内の資産）', url: 'https://www.tax.metro.tokyo.lg.jp/kazei/work/shokyak_sis' },
};
const RESIDENT_GUIDANCE: SubmissionGuidance = {
  message: '東京23区では、市町村民税相当分も法人都民税として申告します。区役所への別の申告と決めず、東京都の説明で手続きの区分と提出先を確認してください。',
  reference: { label: '東京都の法人事業税・法人都民税の説明', url: 'https://www.tax.metro.tokyo.lg.jp/shitsumon/work/a1' },
};
// Presentation safety only: never changes occurrences, amounts, eligibility or
// filing deadlines. Asset location is not collected by the current profile.
export function protectSubmissionDestination(procedure: ScheduleProcedure, location: SubmissionLocation): ScheduleProcedure {
  const knownWrongShibuyaAsset = procedure.code === 'DEPRECIABLE_ASSET_TAX_RETURN'
    && [procedure.office?.official_url, procedure.office?.website_url].some(isKnownUnavailableSubmissionUrl);
  if (procedure.code === 'DEPRECIABLE_ASSET_TAX_RETURN' && (isTokyoSpecialWard(location) || knownWrongShibuyaAsset)) {
    return { ...procedure, office: null, submissionGuidance: ASSET_GUIDANCE };
  }
  if (procedure.code === 'MUNICIPAL_RESIDENT_TAX_RETURN' && isTokyoSpecialWard(location)) {
    return { ...procedure, office: null, submissionGuidance: RESIDENT_GUIDANCE };
  }
  return procedure;
}
