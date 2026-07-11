import type { WorkspaceDecisions, DecisionPriority } from './workspaceDecisions';
import type { WorkspaceAdvice } from './workspaceAdvice';
import { workspaceProcedureOccurrenceKey, type WorkspaceProcedureStatusMap } from './workspaceProcedureStatus';
import {
  WORKSPACE_DOCUMENT_TYPES, WORKSPACE_DOCUMENT_TYPE_LABEL, type WorkspaceDocumentStatusMap,
} from './workspaceDocumentStatus';

// ── Workspace Notification Center — MVP（Sprint 37 Phase37.1）─────────────
// 設計: docs/NOTIFICATION_ENGINE_DESIGN.md（Sprint36、設計レビュー承認済み）。
// 承認済み方針の通り、本Engineは新しい判断ロジックを一切持たない。Decision Engine
// （generateWorkspaceDecisions）・AI Adviser（generateWorkspaceAdvice）が既に確定させた
// 判断結果を、通知形式（WorkspaceNotification）へ変換するだけのルーティング層とする。
// 期限までの日数計算・優先度スコアリングは一切行わない（既存Engineの出力をそのまま転記する）。
//
// 【カテゴリの対応関係】（docs/NOTIFICATION_ENGINE_DESIGN.md 3節の表に対応）
// - deadline: Decision.actions のうち reason に「保留」を含まないもの。severity は
//   Decision.priority をそのまま写像する（Sprint36で承認済みの方針）
// - hold: Decision.actions のうち reason に「保留」を含むもの（保留解除を促す提案）
// - closing: Decision.watchItems のうち title が「決算に向けた準備」のもの
// - information: Decision.watchItems の残り（例: 消費税の課税判定の確定）＋
//   Advice.opportunities（「直近の手続きに遅れはありません」という定型の安心メッセージは
//   通知する必要が無いため除外する）
// - document: workspace_documents のステータスが needs_update の書類。既存の
//   loadWorkspaceDocumentStatuses（src/lib/workspaceLoader.ts）が「要更新」件数バッジの
//   判定に使っているのと同じ基準（status === 'needs_update'）をそのまま再利用する
//   （Decision.watchItemsの文言一致だけに頼ると、手続きに対応しない書類（定款・登記簿謄本）が
//   一度も通知対象にならないため、Document Statusを直接の入力として使う）
//
// 【重複防止】workspaceProcedureOccurrenceKey（procedure_id + occurrence_key）を、
// 手続きに紐づく候補（Advice由来）のキーとしてそのまま再利用する。Decision.actions/
// watchItemsはprocedureIdを公開していないため（Engine側の型・ロジックは変更しない制約のため）、
// その場合は title + dueDate を出現の代替識別子として使う。いずれの場合も
// 「category + 識別子」を最終的なidとして1つのMapに集約することで重複を1件にまとめる。
//
// 【保存しない】DBテーブル追加なし・既読管理なし・送信ログなし。呼ばれるたびに
// 渡されたDecisions/Advice/Status Mapから都度計算するだけの純粋関数。

export type WorkspaceNotificationSeverity = DecisionPriority; // 'high' | 'medium' | 'low'
export type WorkspaceNotificationCategory = 'deadline' | 'hold' | 'document' | 'closing' | 'information';

export type WorkspaceNotification = {
  id: string;
  severity: WorkspaceNotificationSeverity;
  category: WorkspaceNotificationCategory;
  title: string;
  message: string;
  occurrenceKey?: string;
  href?: string;
};

const DEFAULT_MAX_ITEMS = 5;
const CLOSING_WATCH_TITLE = '決算に向けた準備';
const HOLD_REASON_KEYWORD = '保留';
const NO_DELAY_OPPORTUNITY_TITLE = '直近の手続きに遅れはありません';
const DOCUMENT_NEEDS_UPDATE_MESSAGE = 'の内容が古くなっている可能性があります。最新の内容に更新してください。';

const SEVERITY_RANK: Record<WorkspaceNotificationSeverity, number> = { high: 0, medium: 1, low: 2 };

// 手続き・出現回に紐づかない候補（Decision由来）は title + dueDate を代替の識別子にする。
// 新しい採番ロジックではなく、既存の出力フィールドをそのまま組み合わせるだけ。
function candidateKey(
  category: WorkspaceNotificationCategory,
  occurrenceKey: string | undefined,
  title: string,
  dueDate: string | null,
): string {
  return occurrenceKey ? `${category}:${occurrenceKey}` : `${category}:title:${title}:${dueDate ?? 'none'}`;
}

function fromDecisionActions(decisions: WorkspaceDecisions): WorkspaceNotification[] {
  return decisions.actions.map((action) => {
    const category: WorkspaceNotificationCategory = action.reason.includes(HOLD_REASON_KEYWORD) ? 'hold' : 'deadline';
    return {
      id: candidateKey(category, undefined, action.title, action.dueDate),
      severity: action.priority,
      category,
      title: action.title,
      message: action.reason,
    };
  });
}

function fromDecisionWatchItems(decisions: WorkspaceDecisions): WorkspaceNotification[] {
  return decisions.watchItems.map((item) => {
    const category: WorkspaceNotificationCategory = item.title === CLOSING_WATCH_TITLE ? 'closing' : 'information';
    return {
      id: candidateKey(category, undefined, item.title, item.dueDate),
      severity: 'low',
      category,
      title: item.title,
      message: item.reason,
    };
  });
}

// Advice.warningsのうち「保留のまま」（workspaceAdvice.tsの既存文言）を含むものだけを対象にする。
// 期限超過・接近そのものはDecision.actionsが既に deadline カテゴリとして扱っているため、
// ここではAdviceにしか無い「保留」シグナルのみを拾う（同じ日数計算をここで再実装しない）。
function fromAdviceWarnings(advice: WorkspaceAdvice): WorkspaceNotification[] {
  return advice.warnings
    .filter((item) => item.detail.includes('保留のまま'))
    .map((item) => {
      const occurrenceKey =
        item.procedureId != null && item.dueDate ? workspaceProcedureOccurrenceKey(item.procedureId, item.dueDate) : undefined;
      return {
        id: candidateKey('hold', occurrenceKey, item.title, item.dueDate),
        severity: 'medium' as WorkspaceNotificationSeverity,
        category: 'hold' as WorkspaceNotificationCategory,
        title: item.title,
        message: item.detail,
        occurrenceKey,
      };
    });
}

// 「直近の手続きに遅れはありません」という定型の安心メッセージは通知の対象にしない
// （対応が必要な項目ではないため）。それ以外のopportunities（情報不足の案内）を information として拾う。
function fromAdviceOpportunities(advice: WorkspaceAdvice): WorkspaceNotification[] {
  return advice.opportunities
    .filter((item) => item.title !== NO_DELAY_OPPORTUNITY_TITLE)
    .map((item) => {
      const occurrenceKey =
        item.procedureId != null && item.dueDate ? workspaceProcedureOccurrenceKey(item.procedureId, item.dueDate) : undefined;
      return {
        id: candidateKey('information', occurrenceKey, item.title, item.dueDate),
        severity: 'low' as WorkspaceNotificationSeverity,
        category: 'information' as WorkspaceNotificationCategory,
        title: item.title,
        message: item.detail,
        occurrenceKey,
      };
    });
}

// workspace_documentsのステータスが needs_update の書類を通知候補にする。
// 「要更新」という判定基準自体はloadWorkspaceDocumentStatuses（src/lib/workspaceLoader.ts）が
// 既に使っている基準の再利用であり、本Engineが新しく判定を追加するものではない。
function fromDocumentStatus(documentStatusMap: WorkspaceDocumentStatusMap): WorkspaceNotification[] {
  return WORKSPACE_DOCUMENT_TYPES.filter((type) => documentStatusMap[type] === 'needs_update').map((type) => ({
    id: candidateKey('document', undefined, type, null),
    severity: 'medium' as WorkspaceNotificationSeverity,
    category: 'document' as WorkspaceNotificationCategory,
    title: WORKSPACE_DOCUMENT_TYPE_LABEL[type],
    message: `${WORKSPACE_DOCUMENT_TYPE_LABEL[type]}${DOCUMENT_NEEDS_UPDATE_MESSAGE}`,
  }));
}

function hrefFor(companyId: number, category: WorkspaceNotificationCategory, hasOccurrenceLink: boolean): string {
  const base = `/admin/workspaces/${companyId}`;
  if (category === 'document') return `${base}/documents`;
  if (category === 'information') return hasOccurrenceLink ? `${base}/roadmap` : `${base}/profile`;
  return `${base}/roadmap`; // deadline / hold / closing
}

// Decisions/Advice/Procedure Status/Document Statusから、重要度順（high→low）に並んだ
// 通知候補を都度計算する。保存は行わない（呼び出しの都度この関数を実行する）。
export function buildWorkspaceNotifications(
  companyId: number,
  decisions: WorkspaceDecisions,
  advice: WorkspaceAdvice,
  procedureStatusMap: WorkspaceProcedureStatusMap,
  documentStatusMap: WorkspaceDocumentStatusMap,
  maxItems = DEFAULT_MAX_ITEMS,
): WorkspaceNotification[] {
  const candidates = [
    ...fromDecisionActions(decisions),
    ...fromDecisionWatchItems(decisions),
    ...fromAdviceWarnings(advice),
    ...fromAdviceOpportunities(advice),
    ...fromDocumentStatus(documentStatusMap),
  ];

  // 重複防止（同じ手続き・同じ出現回・同じ通知種別を1件にまとめる）と、既に完了済みの出現を除外する
  // 保険的なチェック（Decision/Adviceは内部で既にdone除外済みのため、通常はここで弾かれることはない）。
  const deduped = new Map<string, WorkspaceNotification>();
  for (const candidate of candidates) {
    if (candidate.occurrenceKey && procedureStatusMap[candidate.occurrenceKey] === 'done') continue;
    if (!deduped.has(candidate.id)) deduped.set(candidate.id, candidate);
  }

  const sorted = Array.from(deduped.values()).sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  return sorted.slice(0, maxItems).map((n) => ({
    ...n,
    href: hrefFor(companyId, n.category, n.occurrenceKey !== undefined),
  }));
}
