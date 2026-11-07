import type { SupabaseClient } from './supabase';
import { WORKSPACE_PROCEDURE_STATUSES, workspaceProcedureOccurrenceKey, type WorkspaceProcedureStatus } from './workspaceProcedureStatus.ts';

export const RESPONSIBILITY_LABEL = {
  in_house_admin: '自社の事務担当', tax_accountant: '顧問税理士',
  outsourced_provider: '委託事業者', other: 'その他の担当', undecided: 'まだ決めていない',
} as const;
export type Responsibility = keyof typeof RESPONSIBILITY_LABEL;
export type ResponsibilityRow = { company_id: number; procedure_id: number; occurrence_key: string;
  status: WorkspaceProcedureStatus; responsible_role: Responsibility | null; updated_at: string };
export type ResponsibilityRows = Record<string, ResponsibilityRow>;
type Client = Pick<SupabaseClient, 'from'>;
export const responsibilityColumns = 'company_id,procedure_id,occurrence_key,status,responsible_role,updated_at';
export const isResponsibility = (v: unknown): v is Responsibility => typeof v === 'string' && Object.hasOwn(RESPONSIBILITY_LABEL, v);
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const date = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v;
export function parseResponsibilityRows(data: unknown, companyId: number): ResponsibilityRows | null {
  if (!Array.isArray(data)) return null;
  const rows: ResponsibilityRows = {};
  for (const row of data) {
    if (!row || row.company_id !== companyId || !positive(row.procedure_id) || !date(row.occurrence_key)
      || !WORKSPACE_PROCEDURE_STATUSES.includes(row.status)
      || !(row.responsible_role === null || isResponsibility(row.responsible_role))
      || typeof row.updated_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(row.updated_at)
      || !Number.isFinite(Date.parse(row.updated_at))) return null;
    const key = workspaceProcedureOccurrenceKey(row.procedure_id, row.occurrence_key);
    if (Object.hasOwn(rows, key)) return null;
    rows[key] = row;
  }
  return rows;
}
export async function loadResponsibilities(client: Client, companyId: number): Promise<ResponsibilityRows | null> {
  try {
    if (!positive(companyId)) return null;
    const [company, result] = await Promise.all([
      client.from('workspace_companies').select('id').eq('id', companyId).maybeSingle(),
      client.from('workspace_procedure_statuses').select(responsibilityColumns).eq('company_id', companyId),
    ]);
    if (company.error || company.data?.id !== companyId || result.error) return null;
    return parseResponsibilityRows(result.data, companyId);
  } catch { return null; }
}
export type ResponsibilityIntent = { version: 1; companyId: number; procedureId: number; dueDate: string;
  role: Responsibility; previous: ResponsibilityRow | null };
export function validResponsibilityIntent(value: unknown, companyId: number): value is ResponsibilityIntent {
  if (!value || typeof value !== 'object') return false;
  const v = value as ResponsibilityIntent;
  return v.version === 1 && v.companyId === companyId && positive(companyId) && positive(v.procedureId)
    && date(v.dueDate) && isResponsibility(v.role) && (v.previous === null ||
      !!parseResponsibilityRows([v.previous], companyId) && v.previous.procedure_id === v.procedureId && v.previous.occurrence_key === v.dueDate);
}
export function sameResponsibilityRow(a: ResponsibilityRow | null, b: ResponsibilityRow | null) {
  return a === null ? b === null : b !== null && a.updated_at === b.updated_at && a.responsible_role === b.responsible_role && a.status === b.status;
}
/** Ignore an older server refresh that arrives after a confirmed local save. */
export function mergeResponsibilityRefresh(current: ResponsibilityRows | null, incoming: ResponsibilityRows | null): ResponsibilityRows | null {
  if (!current || !incoming) return incoming;
  const micros = (stamp: string) => BigInt(Date.parse(stamp)) * BigInt(1000)
    + BigInt((stamp.match(/\.(\d+)(?:Z|[+-]\d\d:\d\d)$/)?.[1] ?? '').padEnd(6, '0').slice(3, 6));
  const merged = { ...current };
  for (const [key, row] of Object.entries(incoming)) {
    if (!merged[key] || micros(row.updated_at) >= micros(merged[key].updated_at)) merged[key] = row;
  }
  return merged;
}
/** One column only, with compare-and-swap. Never upsert a stale status alongside a role. */
export async function saveResponsibility(client: Client, intent: ResponsibilityIntent): Promise<boolean> {
  if (!validResponsibilityIntent(intent, intent.companyId)) return false;
  try {
    const { previous } = intent;
    const query = previous
      ? client.from('workspace_procedure_statuses').update({ responsible_role: intent.role })
        .eq('company_id', intent.companyId).eq('procedure_id', intent.procedureId).eq('occurrence_key', intent.dueDate).eq('updated_at', previous.updated_at)
      : client.from('workspace_procedure_statuses').insert({ company_id: intent.companyId,
        procedure_id: intent.procedureId, occurrence_key: intent.dueDate, responsible_role: intent.role });
    const { data, error } = await query.select(responsibilityColumns).maybeSingle();
    const parsed = error || !data ? null : parseResponsibilityRows([data], intent.companyId);
    const row = parsed?.[workspaceProcedureOccurrenceKey(intent.procedureId, intent.dueDate)];
    return !!row && row.responsible_role === intent.role && row.status === (previous?.status ?? 'not_started');
  } catch { return false; }
}
