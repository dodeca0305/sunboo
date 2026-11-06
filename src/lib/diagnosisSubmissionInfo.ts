import type { JurisdictionOffice } from './types';
import type { ScheduleProcedure } from './scheduleProcedure';
import { buildRoadmapSubmissionInfo } from './roadmapSubmissionInfo.ts';
import { isKnownUnavailableSubmissionUrl } from './submissionLinkSafety.ts';

/** Only offices attached to the final, protected procedures belong in the summary. */
export function buildDiagnosisOfficeSummaries(legacy: JurisdictionOffice[], procedures: ScheduleProcedure[]) {
  const summaries = new Map<string, {
    key: string; name: string; address: string | null; phone: string | null;
    map_url: string | null; procedureNames: string[];
    link: ReturnType<typeof buildRoadmapSubmissionInfo>;
  }>();
  for (const procedure of procedures) {
    if (!procedure.office || procedure.submissionGuidance) continue;
    const office = procedure.office;
    const link = buildRoadmapSubmissionInfo(procedure);
    const key = JSON.stringify([office.name, link.url, office.map_url ?? null]);
    const existing = summaries.get(key);
    if (existing) {
      if (!existing.procedureNames.includes(procedure.name)) existing.procedureNames.push(procedure.name);
      continue;
    }
    // A same-name directory overlay must not inherit another office's contact data.
    const original = legacy.find((old) => old.name === office.name
      && (old.official_url ?? null) === (office.official_url ?? null)
      && (old.website_url ?? null) === (office.website_url ?? null)
      && (old.map_url ?? null) === (office.map_url ?? null));
    summaries.set(key, { key, name: office.name, address: original?.address ?? null,
      phone: original?.phone ?? null, map_url: office.map_url ?? null,
      procedureNames: [procedure.name], link });
  }
  return [...summaries.values()];
}

export function selectProcedureReference(link: ScheduleProcedure['official_links'][number]) {
  const usable = (url: string | null | undefined): url is string => {
    if (!url || isKnownUnavailableSubmissionUrl(url)) return false;
    try { return ['https:', 'http:'].includes(new URL(url).protocol); } catch { return false; }
  };
  if (link.status !== 'broken' && usable(link.url)) return { href: link.url, fallback: false };
  if (usable(link.fallback_url) && link.fallback_url !== link.url) {
    return { href: link.fallback_url, fallback: true };
  }
  return null;
}
