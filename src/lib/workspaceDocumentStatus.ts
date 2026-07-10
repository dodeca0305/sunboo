// ── Company Workspace — 書類ステータス（Sprint 26）───────────────────
// workspace_documents（本Sprintで新規作成）用の型。書類の種類は今回固定5種のみとし、
// 別テーブルは作らずここで列挙する（workspace_procedure_statuses・
// WORKSPACE_PROCEDURE_STATUSESと同じ設計判断。種類を増やす場合はCHECK制約
// （supabase/migration_workspace_documents.sql）とこのファイルの両方を更新する）。
//
// ファイルアップロードは本Sprintではスコープ外。状態（メタデータ）のみを管理する。

export type WorkspaceDocumentType =
  | 'articles_of_incorporation'
  | 'certificate_of_registered_matters'
  | 'corporate_tax_return'
  | 'consumption_tax_return'
  | 'withholding_tax_payment_slip';

export const WORKSPACE_DOCUMENT_TYPE_LABEL: Record<WorkspaceDocumentType, string> = {
  articles_of_incorporation: '定款',
  certificate_of_registered_matters: '登記簿謄本',
  corporate_tax_return: '法人税申告書',
  consumption_tax_return: '消費税申告書',
  withholding_tax_payment_slip: '源泉所得税納付書',
};

export const WORKSPACE_DOCUMENT_TYPES: WorkspaceDocumentType[] = [
  'articles_of_incorporation',
  'certificate_of_registered_matters',
  'corporate_tax_return',
  'consumption_tax_return',
  'withholding_tax_payment_slip',
];

export type WorkspaceDocumentStatus = 'not_registered' | 'registered' | 'needs_update';

export const WORKSPACE_DOCUMENT_STATUS_LABEL: Record<WorkspaceDocumentStatus, string> = {
  not_registered: '未登録',
  registered: '登録済み',
  needs_update: '要更新',
};

export const WORKSPACE_DOCUMENT_STATUSES: WorkspaceDocumentStatus[] = [
  'not_registered', 'registered', 'needs_update',
];

export type WorkspaceDocumentStatusMap = Partial<Record<WorkspaceDocumentType, WorkspaceDocumentStatus>>;
