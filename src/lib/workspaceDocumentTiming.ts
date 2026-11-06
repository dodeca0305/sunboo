import type { SupabaseClient } from './supabase';
import { WORKSPACE_DOCUMENT_TYPES, WORKSPACE_DOCUMENT_STATUSES, type WorkspaceDocumentType, type WorkspaceDocumentStatus } from './workspaceDocumentStatus.ts';
export type DocumentValues = { status: WorkspaceDocumentStatus; period_start: string | null; period_end: string | null; document_date: string | null };
export type DocumentSnapshot = DocumentValues & { updated_at: string };
export type DocumentSnapshotMap = Partial<Record<WorkspaceDocumentType, DocumentSnapshot>>;
export const DOCUMENT_COLUMNS = 'company_id,document_type,status,period_start,period_end,document_date,updated_at';
export const EMPTY_DOCUMENT: DocumentValues = { status: 'not_registered', period_start: null, period_end: null, document_date: null };
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export function validDocumentDate(v: unknown): v is string | null {
  if (v === null) return true;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || v.slice(0, 4) === '0000') return false;
  const d = new Date(v + 'T00:00:00Z');
  return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 10) === v;
}
export function validDocumentValues(v: unknown): v is DocumentValues {
  return record(v) && WORKSPACE_DOCUMENT_STATUSES.includes(v.status as WorkspaceDocumentStatus)
    && validDocumentDate(v.period_start) && validDocumentDate(v.period_end) && validDocumentDate(v.document_date)
    && ((v.period_start === null && v.period_end === null) || (typeof v.period_start === 'string' && typeof v.period_end === 'string' && v.period_start <= v.period_end));
}
export function validDocumentSnapshot(v: unknown): v is DocumentSnapshot {
  if (!record(v)) return false;
  const updated = v.updated_at;
  return validDocumentValues(v) && typeof updated === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.test(updated) && Number.isFinite(Date.parse(updated));
}
export const documentValues = (v: DocumentValues): DocumentValues => ({ status: v.status, period_start: v.period_start, period_end: v.period_end, document_date: v.document_date });
export const sameDocumentValues = (a: DocumentValues, b: DocumentValues) => JSON.stringify(documentValues(a)) === JSON.stringify(documentValues(b));
export type DocumentIntent = { version: 1; id: string; actorId: string; companyId: number; documentType: WorkspaceDocumentType; expected: DocumentSnapshot | null; values: DocumentValues };
export const documentSaveKey = (actor: string, company: number, type: WorkspaceDocumentType) => `sunboo:document-save:v1:${actor}:${company}:${type}`;
export function validDocumentIntent(v: unknown, actor: string, company: number, type: WorkspaceDocumentType): v is DocumentIntent {
  return record(v) && v.version === 1 && typeof v.id === 'string' && /^[\da-f-]{36}$/i.test(v.id)
    && v.actorId === actor && v.companyId === company && Number.isSafeInteger(company) && company > 0
    && v.documentType === type && WORKSPACE_DOCUMENT_TYPES.includes(type)
    && (v.expected === null || validDocumentSnapshot(v.expected)) && validDocumentValues(v.values);
}
export async function readDocument(client: Pick<SupabaseClient, 'from'>, company: number, type: WorkspaceDocumentType): Promise<{ snapshot: DocumentSnapshot | null } | null> {
  try {
    const r = await client.from('workspace_documents').select(DOCUMENT_COLUMNS).eq('company_id', company).eq('document_type', type).maybeSingle();
    if (r.error || r.data === undefined) return null;
    if (r.data === null) return { snapshot: null };
    return r.data.company_id === company && r.data.document_type === type && validDocumentSnapshot(r.data) ? { snapshot: { ...documentValues(r.data), updated_at: r.data.updated_at } } : null;
  } catch { return null; }
}
export function reconcileDocument(intent: DocumentIntent, snapshot: DocumentSnapshot | null): 'saved' | 'unchanged' | 'conflict' {
  if (snapshot && sameDocumentValues(snapshot, intent.values)) return 'saved';
  if (snapshot === null && intent.expected === null || snapshot && intent.expected && snapshot.updated_at === intent.expected.updated_at && sameDocumentValues(snapshot, intent.expected)) return 'unchanged';
  return 'conflict';
}
// INSERT never overwrites a concurrent insert; UPDATE compares the full-precision server version.
export async function saveDocument(client: Pick<SupabaseClient, 'from'>, intent: DocumentIntent): Promise<{ result: 'saved'; snapshot: DocumentSnapshot } | { result: 'conflict' | 'unavailable' }> {
  if (!validDocumentIntent(intent, intent.actorId, intent.companyId, intent.documentType)) return { result: 'unavailable' };
  try {
    const payload = { company_id: intent.companyId, document_type: intent.documentType, ...documentValues(intent.values) };
    const table = client.from('workspace_documents');
    let q = intent.expected === null ? table.insert(payload) : table.update(documentValues(intent.values)).eq('company_id', intent.companyId).eq('document_type', intent.documentType).eq('updated_at', intent.expected.updated_at);
    if (intent.expected) {
      q = q.eq('status', intent.expected.status);
      for (const field of ['period_start', 'period_end', 'document_date'] as const) {
        q = intent.expected[field] === null ? q.is(field, null) : q.eq(field, intent.expected[field]);
      }
    }
    const r = await q.select(DOCUMENT_COLUMNS);
    if (r.error) return { result: r.error.code === '23505' ? 'conflict' : 'unavailable' };
    if (!Array.isArray(r.data)) return { result: 'unavailable' };
    if (r.data.length === 0) return { result: 'conflict' };
    const row = r.data[0];
    return r.data.length === 1 && row.company_id === intent.companyId && row.document_type === intent.documentType && validDocumentSnapshot(row) && sameDocumentValues(row, intent.values)
      ? { result: 'saved', snapshot: { ...documentValues(row), updated_at: row.updated_at } } : { result: 'unavailable' };
  } catch { return { result: 'unavailable' }; }
}
