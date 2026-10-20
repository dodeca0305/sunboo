import type { RoadmapYear } from './roadmap';
import type { CompanyState } from './state';
import type { CompanyProfile } from './companyProfile';
import type { WorkspaceProcedureStatusMap } from './workspaceProcedureStatus';
import type { WorkspaceDocumentStatusMap, WorkspaceDocumentType } from './workspaceDocumentStatus';
// 拡張子を明示する（workspaceTaxPaymentPlan.ts・workspaceNotifications.tsと同じ既存パターン）。
// これにより本ファイルをnode --testで直接importしてテストできる。
import { nearestOccurrencePerProcedure, daysUntil, formatDueDate, statusOf } from './workspaceAdvice.ts';

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
  // 【追加】会社ホーム「今日やること」の遷移ボタン生成に使う（省略可、既存呼び出し元に影響しない）。
  // 手続き起因のactionはprocedureId（+既存のdueDate）からRoadmapへの深いリンクを組み立てる。
  // 売上・資金繰り等、手続きに紐づかないactionはactionHrefを直接持つ（workspaceGrowthActions.ts）。
  // 両方null/undefinedの場合は汎用リンク（/roadmap）にフォールバックする。
  procedureId?: number | null;
  actionHref?: string | null;
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
export const ACTION_MAX_ITEMS = 8;
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
          procedureId: item.procedure.id,
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
        procedureId: item.procedure.id,
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

  actions.sort(compareDecisionActions);
  actions.splice(ACTION_MAX_ITEMS);
  const summary = summarizeDecisionActions(actions);

  return { actions, watchItems, completed, summary };
}

// ── 共有ユーティリティ（手続き・書類・売上・資金繰りを共通の優先順位で扱うための拡張）────────
// 設計: docs/DEVELOPMENT_HANDOFF.md。会社ホーム「今日のポイント」「意思決定」に売上・資金繰りの
// アクション（workspaceGrowthActions.ts経由でWorkspaceDecisionAction形に変換済み）を統合する際、
// 本Engine（手続き）の判定ロジックは一切変更せず、ソート・件数サマリーだけを共有する。
// 新しい判断ロジックではなく、上のgenerateWorkspaceDecisions内部で元々使っていたものを
// そのまま抽出した（重複させない）。

const priorityRank: Record<DecisionPriority, number> = { high: 0, medium: 1, low: 2 };

// 優先度→実際の期限の近さの順でソートする。dueDateが無い項目（入力案内等、期限の無いもの）に
// 架空の期限を付けず、同優先度内では常に最後方へ回す（'9999-99-99'は表示に出さないソート専用の
// センチネル）。
export function compareDecisionActions(a: WorkspaceDecisionAction, b: WorkspaceDecisionAction): number {
  const rankDiff = priorityRank[a.priority] - priorityRank[b.priority];
  if (rankDiff !== 0) return rankDiff;
  return (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99');
}

export function summarizeDecisionActions(actions: WorkspaceDecisionAction[]): string {
  const highCount = actions.filter((a) => a.priority === 'high').length;
  return highCount > 0
    ? `優先度の高い対応が${highCount}件あります。至急ご確認ください。`
    : actions.length > 0
      ? `対応が必要な項目が${actions.length}件あります。`
      : '現時点で急ぎの意思決定は必要ありません。';
}

// 手続き起因のactions（generateWorkspaceDecisionsの出力）と、売上・資金繰り等の他ドメイン起因の
// actionsを同じ優先順位ルールで合流させる。呼び出し元（page.tsx）が、合流後の配列をそのまま
// 「意思決定」の表示・件数サマリーに使うことで、表示件数とsummaryの不整合（二重計上）を防ぐ。
export function mergeDecisionActions(
  base: WorkspaceDecisionAction[],
  extra: WorkspaceDecisionAction[],
  maxItems: number = ACTION_MAX_ITEMS,
): WorkspaceDecisionAction[] {
  return [...base, ...extra].sort(compareDecisionActions).slice(0, maxItems);
}

// 「今日やること」向けに、合流済みactionsから最優先の階層だけを取り出す。
// 既存のselectTodayActionItems（advice.warnings優先・無ければadvice.priority）と同じ
// 「上位階層が1件もなければ次の階層」という考え方を、high/medium/lowの3階層へ一般化したもの。
export function selectUrgentDecisionActions(actions: WorkspaceDecisionAction[]): WorkspaceDecisionAction[] {
  const high = actions.filter((a) => a.priority === 'high');
  if (high.length > 0) return high;
  return actions.filter((a) => a.priority === 'medium');
}
