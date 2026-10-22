import {
  calculateMonthlyCashFlow, calculateMonthlySalesProgress, monthEndDate, shouldGuideCashFlowInput,
  type MonthlySalesEntry,
} from './monthlySalesProgress.ts';
import type { WorkspaceNotification } from './workspaceNotifications';

// ── Workspace Growth Notifications（会社ホーム「重要アクション」拡張）─────────────
// 設計: docs/DEVELOPMENT_HANDOFF.md 3節。
//
// 会社ホームの既存「意思決定」（workspaceDecisions.ts）・「確認が必要なこと」
// （workspaceNotifications.ts）はいずれも手続き期限・書類ステータスのみを入力とし、
// 売上・資金繰りのデータを一切参照していない（調査済み）。本ファイルはその欠落分
// （売上未達・資金不足）だけを埋める薄い変換層で、計算ロジック自体
// （calculateMonthlySalesProgress・calculateMonthlyCashFlow、いずれもmonthlySalesProgress.ts、
// growth画面と共通）は一切変更せず再利用する。新しい閾値判断（通知を出すか・優先度）のみを持つ。
//
// 「納税期限」は既存のAnnual Roadmap経由でgenerateWorkspaceDecisions.actionsに既に現れているため
// （税務手続きの期限として）、本ファイルでは扱わない（重複させない）。
//
// workspaceAdvice.tsのformatDueDateは再利用せず、同じ内容をここに複製する（3行程度の軽微な重複）。
// workspaceAdvice.tsは内部でworkspaceProcedureStatus.tsを拡張子無しでimportしており、
// node --testのネイティブESM解決ではそちらまで解決できず失敗する（既知の制約、
// submissionDirectoryCutover/decision.tsの設計コメントと同種の問題）。本ファイルを
// node --testで直接実行可能にするため、依存を増やさない。
function formatDueDate(dueDate: string): string {
  const [, m, d] = dueDate.split('-');
  return `${Number(m)}月${Number(d)}日`;
}

const SALES_SHORTFALL_URGENT_DAYS = 7;

export type WorkspaceGrowthNotificationOptions = {
  today?: Date;
  // 【レビュー対応】workspace_tax_payment_plansの取得に失敗した場合、呼び出し元はこれをfalseにする。
  // 取得失敗を「今月の納税予定は0円」と同一視すると、資金不足を実際より少なく見せてしまう
  // （Unknown is better than Wrongの原則に反する）。falseの場合はcalculateMonthlyCashFlowを
  // 呼び出さず、金額を断定しない通知に切り替える。
  cashFlowDataAvailable?: boolean;
  // 【レビュー対応】workspace_monthly_sales自体の取得に失敗した場合、呼び出し元はこれをtrueにする。
  // entry===nullは「まだ一度も入力していない（通知を出す必要がない）」と「取得に失敗した
  // （何が起きているか分からない）」の両方で発生しうるが、後者を前者と同一視し通知0件のまま
  // 黙っていると「警告が無い＝問題なし」と誤って受け取られる（Unknown is better than Wrong）。
  // trueの場合、売上未達・資金不足の個別判定は行わず、取得できない旨の通知1件のみ返す。
  monthlyDataFetchFailed?: boolean;
  // 【レビュー対応】workspace_monthly_salesにこの月の行が無い（まだ一度も保存していない）場合、
  // 呼び出し元はこれをfalseにする。falseの場合、entryのcashBalance等は既定値0が入っているだけで
  // 「実際に0円」とは限らない。既知の納税予定（entry.linkedTaxPayments）があるのに未登録のまま
  // fundingGapを計算すると、本来不明なはずの不足額を断定表示してしまう
  // （Unknown is better than Wrong。growth画面のshouldGuideCashFlowInputと判定基準を共有する）。
  monthlyDataRegistered?: boolean;
};

const MONTHLY_DATA_FETCH_FAILED_NOTIFICATION: WorkspaceNotification = {
  id: 'sales:fetch-failed',
  severity: 'medium',
  category: 'sales',
  title: '今月の売上・資金繰り',
  message: '売上・資金繰りデータを取得できません。時間をおいて再度お試しください。',
  dueDate: null, // 取得失敗の時点では実際の状況が分からないため、期限を持たせない
};

export function buildWorkspaceGrowthNotifications(
  entry: MonthlySalesEntry | null,
  options: WorkspaceGrowthNotificationOptions = {},
): WorkspaceNotification[] {
  const {
    today = new Date(), cashFlowDataAvailable = true, monthlyDataFetchFailed = false, monthlyDataRegistered = true,
  } = options;

  if (monthlyDataFetchFailed) return [MONTHLY_DATA_FETCH_FAILED_NOTIFICATION];
  if (!entry) return [];

  const notifications: WorkspaceNotification[] = [];

  const salesProgress = calculateMonthlySalesProgress(entry, today);
  if (salesProgress.shortfall > 0) {
    // 売上目標の対象期間は「今月1日〜月末」という会社自身が設定した枠であり、月末は
    // 会計上確定したカレンダー境界（手続き期限のような外部制約ではない）。資金対策の
    // 「確定期限」として扱うcash側（後述）とは性質が異なるため、ここでは期限表現を維持する。
    const dueDateLabel = formatDueDate(monthEndDate(entry.yearMonth));
    notifications.push({
      id: `sales:shortfall:${entry.yearMonth}`,
      severity: salesProgress.daysRemaining <= SALES_SHORTFALL_URGENT_DAYS ? 'high' : 'medium',
      category: 'sales',
      title: '今月の売上目標',
      message: salesProgress.daysRemaining > 0
        ? `目標に対して¥${salesProgress.shortfall.toLocaleString('ja-JP')}不足しています（期限: ${dueDateLabel}まであと${salesProgress.daysRemaining}日、1日あたり¥${salesProgress.requiredRevenuePerDay.toLocaleString('ja-JP')}の売上が必要です）。`
        : `目標に対して¥${salesProgress.shortfall.toLocaleString('ja-JP')}不足したまま今月が終了しました。`,
      // 今月の売上目標期間の終わり（会社自身が設定した会計上の境界）。意思決定・今日のポイントの
      // 共通優先順位（compareDecisionActions）で、実際の期限として使う。
      dueDate: monthEndDate(entry.yearMonth),
    });
  }

  if (shouldGuideCashFlowInput(monthlyDataRegistered, entry.linkedTaxPayments)) {
    // 【レビュー対応】月次データ未登録＋既知の納税予定あり。cashBalance等の未入力項目を
    // 実際に0円と断定したfundingGapを表示せず、growth画面と同じ案内文言で入力を促す。
    notifications.push({
      id: `cash:guidance:${entry.yearMonth}`,
      severity: 'medium',
      category: 'cash',
      title: '今月の資金繰り',
      message: `納税予定¥${entry.linkedTaxPayments.toLocaleString('ja-JP')}あり。預金残高・入出金予定を入力して資金繰りを確認してください。`,
      // 入力案内であり、資金不足が確定した情報ではない。架空の期限を付けない（要件5）。
      dueDate: null,
    });
  } else if (!cashFlowDataAvailable) {
    // 【レビュー対応】納税予定の取得に失敗し、入力された金額の一部が不明な状態。
    // fundingGapを計算すると「本来より少ない不足額」を断定表示してしまう恐れがあるため、
    // 金額を出さずデータ未確認である旨のみ伝える。
    notifications.push({
      id: `cash:unknown:${entry.yearMonth}`,
      severity: 'medium',
      category: 'cash',
      title: '今月の資金繰り',
      message: '資金繰りデータを確認できません。入出金の予定日を確認してください。',
      // データを確認できていない時点では、確定した期限を示せない（要件5）。
      dueDate: null,
    });
  } else {
    const cashFlow = calculateMonthlyCashFlow(entry);
    if (cashFlow.fundingGap > 0) {
      // 【レビュー対応】月末は資金繰りの「確定期限」ではない（入出金予定日はユーザーの見込み入力に
      // 依存し、実際の入出金タイミングはずれうる）。「までに対策が必要」という断定表現を避け、
      // 月次の見込みから算出した不足額であることを明示し、入出金予定日の確認を促す表現にする。
      // ただし意思決定・今日のポイントの並び順に使うdueDateには、月末という実在するカレンダー
      // 境界をそのまま使う（架空の期限ではない。本文の表現と並び順の根拠は別の関心事）。
      notifications.push({
        id: `cash:shortage:${entry.yearMonth}`,
        severity: 'high',
        category: 'cash',
        title: '今月の資金繰り',
        message: `入力された月次見込みでは月末残高が¥${cashFlow.fundingGap.toLocaleString('ja-JP')}不足する見込みです。入出金の予定日を確認して資金対策を検討してください。`,
        dueDate: monthEndDate(entry.yearMonth),
      });
    }
  }

  return notifications;
}
