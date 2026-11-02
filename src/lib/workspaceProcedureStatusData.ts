import type { SupabaseClient } from './supabase';
import {
  WORKSPACE_PROCEDURE_STATUSES, workspaceProcedureOccurrenceKey,
  type WorkspaceProcedureStatus, type WorkspaceProcedureStatusMap,
} from './workspaceProcedureStatus.ts';

type Client = Pick<SupabaseClient, 'from'>;
export type ProcedureStatusSaveIntent = {
  version: 1;
  companyId: number;
  procedureId: number;
  dueDate: string;
  procedureName: string;
  status: WorkspaceProcedureStatus;
  previousStatus: WorkspaceProcedureStatus;
};
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
export function isProcedureStatusSaveIntent(value: unknown, companyId: number): value is ProcedureStatusSaveIntent {
  if (!value || typeof value !== 'object') return false;
  const v = value as ProcedureStatusSaveIntent;
  return v.version === 1 && v.companyId === companyId && positive(v.companyId) && positive(v.procedureId)
    && typeof v.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.dueDate)
    && typeof v.procedureName === 'string' && v.procedureName.trim().length > 0
    && WORKSPACE_PROCEDURE_STATUSES.includes(v.status) && WORKSPACE_PROCEDURE_STATUSES.includes(v.previousStatus);
}
export function procedureStatusSaveKey(companyId: number): string {
  return `sunboo:workspace:${companyId}:pending-procedure-status`;
}
// 編集専用。nullは取得不可、空Mapは正常な未登録。共用の読み取り側は変更しない。
export async function loadWorkspaceProcedureStatusesForEditing(client: Client, companyId: number): Promise<WorkspaceProcedureStatusMap | null> {
  try {
    const { data, error } = await client.from('workspace_procedure_statuses')
      .select('company_id, procedure_id, occurrence_key, status').eq('company_id', companyId);
    if (error || !Array.isArray(data)) return null;
    const map: WorkspaceProcedureStatusMap = {};
    for (const row of data) {
      if (!row || row.company_id !== companyId || !positive(row.procedure_id)
        || typeof row.occurrence_key !== 'string' || !row.occurrence_key.trim()
        || !WORKSPACE_PROCEDURE_STATUSES.includes(row.status)) return null;
      const key = workspaceProcedureOccurrenceKey(row.procedure_id, row.occurrence_key);
      if (Object.hasOwn(map, key)) return null;
      map[key] = row.status;
    }
    return map;
  } catch { return null; }
}
// 成功HTTPだけでなく、保存先と返却された状態まで確認する。結果不明は呼び出し側で再取得する。
export async function saveWorkspaceProcedureStatus(client: Client, intent: ProcedureStatusSaveIntent): Promise<boolean> {
  try {
    const { data, error } = await client.from('workspace_procedure_statuses').upsert({
      company_id: intent.companyId, procedure_id: intent.procedureId, occurrence_key: intent.dueDate, status: intent.status,
    }, { onConflict: 'company_id,procedure_id,occurrence_key' })
      .select('company_id, procedure_id, occurrence_key, status').single();
    return !error && !!data && data.company_id === intent.companyId && data.procedure_id === intent.procedureId
      && data.occurrence_key === intent.dueDate && data.status === intent.status;
  } catch { return false; }
}
export async function reconcileWorkspaceProcedureStatus(client: Client, intent: ProcedureStatusSaveIntent): Promise<
  { status: 'unavailable' } | { status: 'saved' | 'different'; map: WorkspaceProcedureStatusMap }
> {
  const map = await loadWorkspaceProcedureStatusesForEditing(client, intent.companyId);
  if (map === null) return { status: 'unavailable' };
  const key = workspaceProcedureOccurrenceKey(intent.procedureId, intent.dueDate);
  return { status: Object.hasOwn(map, key) && map[key] === intent.status ? 'saved' : 'different', map };
}

export function subscribeProcedureStatusSave(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener('sunboo:procedure-status-save', callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener('sunboo:procedure-status-save', callback);
  };
}
export function notifyProcedureStatusSave() { window.dispatchEvent(new Event('sunboo:procedure-status-save')); }
