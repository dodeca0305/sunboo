import type { SupabaseClient } from './supabase';
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
  requiredDocumentStatusMap: WorkspaceRequiredDocumentStatusMap;
} | null> {
  try {
    const [documents, required] = await Promise.all([
      client.from('workspace_documents').select('document_type, status').eq('company_id', companyId),
      client.from('workspace_required_document_statuses').select('document_name, status').eq('company_id', companyId),
    ]);
    if (documents.error || required.error || !Array.isArray(documents.data) || !Array.isArray(required.data)) return null;
    if (documents.data.some(row => !row || !WORKSPACE_DOCUMENT_TYPES.includes(row.document_type)
      || !WORKSPACE_DOCUMENT_STATUSES.includes(row.status))) return null;
    if (required.data.some(row => !row || typeof row.document_name !== 'string' || !row.document_name.trim()
      || !WORKSPACE_REQUIRED_DOCUMENT_STATUSES.includes(row.status))) return null;
    return {
      statusMap: Object.fromEntries(documents.data.map(row => [row.document_type as WorkspaceDocumentType, row.status as WorkspaceDocumentStatus])),
      requiredDocumentStatusMap: Object.fromEntries(required.data.map(row => [row.document_name, row.status as WorkspaceRequiredDocumentStatus])),
    };
  } catch {
    return null;
  }
}
