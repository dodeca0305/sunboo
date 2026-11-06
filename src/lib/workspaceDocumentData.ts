import type { SupabaseClient } from './supabase';
import { DOCUMENT_COLUMNS, documentValues, validDocumentSnapshot, type DocumentSnapshotMap } from './workspaceDocumentTiming.ts';
import {
  WORKSPACE_DOCUMENT_TYPES, WORKSPACE_DOCUMENT_STATUSES,
  type WorkspaceDocumentType, type WorkspaceDocumentStatus, type WorkspaceDocumentStatusMap,
} from './workspaceDocumentStatus.ts';
import {
  WORKSPACE_REQUIRED_DOCUMENT_STATUSES,
  type WorkspaceRequiredDocumentStatus, type WorkspaceRequiredDocumentStatusMap,
} from './workspaceRequiredDocumentStatus.ts';

// 編集画面専用。片方の失敗でも未取得の状態を「未登録」として更新させない。
export async function loadWorkspaceDocumentsForEditing(
  client: Pick<SupabaseClient, 'from'>,
  companyId: number,
): Promise<{
  statusMap: WorkspaceDocumentStatusMap;
  snapshots: DocumentSnapshotMap;
  requiredDocumentStatusMap: WorkspaceRequiredDocumentStatusMap;
} | null> {
  try {
    const [documents, required] = await Promise.all([
      client.from('workspace_documents').select(DOCUMENT_COLUMNS).eq('company_id', companyId),
      client.from('workspace_required_document_statuses').select('document_name, status').eq('company_id', companyId),
    ]);
    if (documents.error || required.error || !Array.isArray(documents.data) || !Array.isArray(required.data)) return null;
    if (documents.data.some(row => !row || !WORKSPACE_DOCUMENT_TYPES.includes(row.document_type)
      || !WORKSPACE_DOCUMENT_STATUSES.includes(row.status) || row.company_id !== companyId || !validDocumentSnapshot(row))) return null;
    if (required.data.some(row => !row || typeof row.document_name !== 'string' || !row.document_name.trim()
      || !WORKSPACE_REQUIRED_DOCUMENT_STATUSES.includes(row.status))) return null;
    if (new Set(documents.data.map(row => row.document_type)).size !== documents.data.length) return null;
    return {
      snapshots: Object.fromEntries(documents.data.map(row => [row.document_type, { ...documentValues(row), updated_at: row.updated_at }])),
      statusMap: Object.fromEntries(documents.data.map(row => [row.document_type as WorkspaceDocumentType, row.status as WorkspaceDocumentStatus])),
      requiredDocumentStatusMap: Object.fromEntries(required.data.map(row => [row.document_name, row.status as WorkspaceRequiredDocumentStatus])),
    };
  } catch {
    return null;
  }
}
