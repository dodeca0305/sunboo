import type { RoadmapYear } from './roadmap';
import type { CompanyState } from './state';
import type { CompanyProfile } from './companyProfile';
import type { WorkspaceProcedureStatusMap } from './workspaceProcedureStatus';
import type { WorkspaceDocumentStatusMap, WorkspaceDocumentType } from './workspaceDocumentStatus';
import { nearestOccurrencePerProcedure, daysUntil, formatDueDate, statusOf } from './workspaceAdvice';

// ── Workspace Decision Engine — ルールベースMVP（Sprint 27）─────────────
// Decisions = f( CompanyProfile, State, Annual Roadmap, Procedure Status, Document Status )。
// 既存Engineの出力を読むだけで、新たな期限計算・DBアクセスは一切行わない純粋関数。LLMは呼ばない。
//
// 役割はgenerateWorkspaceAdvice（Sprint24.2）と明確に分ける（Sprint27レビューで指摘・整理）。
// - AI Adviser（generateWorkspaceAdvice）＝状況説明。「何が起きているか」を事実として並べる
//   （あとN日／情報不足　等、記述的な文体）。
// - Decision（本ファイル）＝行動提案。「今何をすべきか」を命令形で提案する。手続きと書類の
//   突き合わせ、決算月からの逆算、Stateの確からしさに基づくリスク注記など、Advice単体では
//   出てこない複数入力の横断判断を優先し、Adviceと同一文言・同一メッセージは作らない
//   （例: state.stage.confidence==='incomplete'の「基本情報の入力」はAdvice.opportunitiesが
//   既に担うため、本Engineでは重複させず、影響を受ける個別アクションの理由文に注記するに留める）。
//
// Dashboardの既存「AI参謀」を置き換えるのではなく、「意思決定」として別セクションに追加する。

export type DecisionPriority = 'high' | 'medium' | 'low';

export type WorkspaceDecisionAction = {
  priority: DecisionPriority;
  title: string;
  reason: string;
  dueDate: string | null;
};

export type WorkspaceDecisionWatchItem = {
  title: string;
  reason: string;
  dueDate: string | null;
};

export type WorkspaceDecisionCompleted = {
  title: string;
  reason: string;
};

export type WorkspaceDecisions = {
  actions: WorkspaceDecisionAction[];
  watchItems: WorkspaceDecisionWatchItem[];
  completed: WorkspaceDecisionCompleted[];
  summary: string;
};

const URGENT_WINDOW_DAYS = 3;
const ACTION_WINDOW_DAYS = 30;
const WATCH_WINDOW_DAYS = 90;
const ACTION_MAX_ITEMS = 8;
const FISCAL_YEAR_END_WATCH_MONTHS = 2;

// 手続き名から、対応する書類種別を推定する（procedures.codeは本Engineの入力に含まれないため、
// ScheduleProcedure.nameのキーワード一致で判定する。手続き名は既存Procedure Masterの表記に
// 依存するため、名称が変わった場合はここも見直す）。
function matchingDocumentType(procedureName: string): WorkspaceDocumentType | null {
  if (procedureName.includes('法人税')) return 'corporate_tax_return';
  if (procedureName.includes('消費税')) return 'consumption_tax_return';
  if (procedureName.includes('源泉所得税')) return 'withholding_tax_payment_slip';
  return null;
}

function monthsUntilFiscalYearEnd(fiscalMonth: number | null, today: Date): number | null {
  if (fiscalMonth === null) return null;
  const currentMonth = today.getMonth() + 1;
  const diff = fiscalMonth - currentMonth;
  return diff < 0 ? diff + 12 : diff;
}

export function generateWorkspaceDecisions(
  profile: CompanyProfile,
  state: CompanyState,
  roadmapYears: RoadmapYear[],
  procedureStatusMap: WorkspaceProcedureStatusMap,
  documentStatusMap: WorkspaceDocumentStatusMap,
  today: Date = new Date(),
): WorkspaceDecisions {
  const actions: WorkspaceDecisionAction[] = [];
  const watchItems: WorkspaceDecisionWatchItem[] = [];
  const completed: WorkspaceDecisionCompleted[] = [];

  for (const item of nearestOccurrencePerProcedure(roadmapYears)) {
    const status = statusOf(item, procedureStatusMap);

    if (status === 'done') {
      completed.push({ title: item.procedure.name, reason: '対応済みとして記録されています。' });
      continue;
    }

    const diff = daysUntil(item.dueDate, today);
    const documentType = matchingDocumentType(item.procedure.name);
    const documentStatus = documentType ? (documentStatusMap[documentType] ?? 'not_registered') : null;
    const documentIssue = documentStatus === 'not_registered' || documentStatus === 'needs_update';
    const documentNote = documentIssue ? '書類の準備も合わせて進めてください。' : '';

    if (diff <= URGENT_WINDOW_DAYS || status === 'on_hold') {
      if (diff <= WATCH_WINDOW_DAYS) {
        const directive =
          status === 'on_hold'
            ? `保留を解除し、対応方針を決定してください（期限: ${formatDueDate(item.dueDate)}）。`
            : diff < 0
              ? `期限を過ぎています。至急対応してください（期限: ${formatDueDate(item.dueDate)}）。`
              : diff === 0
                ? '本日中に対応してください。'
                : `あと${diff}日以内に対応してください（期限: ${formatDueDate(item.dueDate)}）。`;
        actions.push({
          priority: 'high',
          title: item.procedure.name,
          reason: documentIssue ? `${directive}${documentNote}` : directive,
          dueDate: item.dueDate,
        });
      }
    } else if (diff <= ACTION_WINDOW_DAYS) {
      actions.push({
        priority: documentIssue ? 'high' : 'medium',
        title: item.procedure.name,
        reason: documentIssue
          ? `書類が未整備のため、通常より早めに着手してください（期限: ${formatDueDate(item.dueDate)}、あと${diff}日）。`
          : `早めに着手することをおすすめします（期限: ${formatDueDate(item.dueDate)}、あと${diff}日）。`,
        dueDate: item.dueDate,
      });
    } else if (diff <= WATCH_WINDOW_DAYS && documentIssue) {
      watchItems.push({
        title: item.procedure.name,
        reason: `期限（${formatDueDate(item.dueDate)}）はまだ先ですが、関連書類の準備を今のうちに進めておくと安心です。`,
        dueDate: item.dueDate,
      });
    }
  }

  // Stateの確からしさ自体はAdvice.opportunitiesが「情報不足」として既に伝えているため、
  // ここでは同じ事実を繰り返さず、確からしさが意思決定に及ぼすリスクとして書類判断に絞って注記する。
  if (state.consumptionTaxStatus.confidence !== 'confirmed' && state.consumptionTaxStatus.value === 'taxable') {
    watchItems.push({
      title: '消費税の課税判定の確定',
      reason: '現在は推定に基づく課税事業者判定です。確定した場合と異なると、消費税申告書の準備方針を見直す必要があります。',
      dueDate: null,
    });
  }

  const fiscalMonthsAway = monthsUntilFiscalYearEnd(profile.fiscalMonth, today);
  if (fiscalMonthsAway !== null && fiscalMonthsAway <= FISCAL_YEAR_END_WATCH_MONTHS) {
    const isFirstTerm = state.stage.value === 'first_term';
    watchItems.push({
      title: '決算に向けた準備',
      reason: fiscalMonthsAway === 0
        ? '今月が決算月です。決算書類・申告の準備状況を確認してください。'
        : isFirstTerm
          ? `初めての決算まであと${fiscalMonthsAway}ヶ月です。税理士への相談を含め、早めに準備を始めることをおすすめします。`
          : `決算まであと${fiscalMonthsAway}ヶ月です。決算書類・申告の準備を始める時期です。`,
      dueDate: null,
    });
  }

  const priorityRank: Record<DecisionPriority, number> = { high: 0, medium: 1, low: 2 };
  actions.sort((a, b) => {
    const rankDiff = priorityRank[a.priority] - priorityRank[b.priority];
    if (rankDiff !== 0) return rankDiff;
    return (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99');
  });
  actions.splice(ACTION_MAX_ITEMS);

  const highCount = actions.filter((a) => a.priority === 'high').length;
  const summary =
    highCount > 0
      ? `優先度の高い対応が${highCount}件あります。至急ご確認ください。`
      : actions.length > 0
        ? `対応が必要な項目が${actions.length}件あります。`
        : '現時点で急ぎの意思決定は必要ありません。';

  return { actions, watchItems, completed, summary };
}
