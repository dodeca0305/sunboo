import type { WorkspaceDecisionAction } from './workspaceDecisions';
import type { WorkspaceNotification } from './workspaceNotifications';

// ── Workspace Growth Actions（会社ホーム「今日のポイント」「意思決定」統合）──────────
// 設計: docs/DEVELOPMENT_HANDOFF.md。
//
// buildWorkspaceGrowthNotifications（workspaceGrowthNotifications.ts、変更しない）が既に
// 判定済みの売上・資金繰り通知を、workspaceDecisions.tsのWorkspaceDecisionAction形へ
// 機械的に変換するだけの純粋関数。新しい判断ロジック（通知を出すか・優先度・文言）は
// 一切持たない（severity→priority、message→reasonをそのまま転記するのみ）。
//
// actionHrefは該当月の売上目標画面（/growth?date=YYYY-MM-DD）を指す。基準日（ホームが取得済みの
// 日本時間の今日）が対象月内の実在日ならその日、未指定/不正/別月なら従来どおり月初（-01）。WorkspaceGrowthView.tsxの
// 既存の?dateクエリ処理（PR#131の日付指定遷移と同じ仕組み）がそのまま対象月のドラフトを開く
// ため、新しい遷移ロジックを追加する必要はない。
// 基準日（日本時間の今日など）が対象月内の実在する日付ならその日、そうでなければ
// 従来どおり対象月の1日を返す純粋関数（現在時刻は読まない）。
function growthTargetDate(yearMonth: string, referenceDay?: string | null): string {
  const fallback = `${yearMonth}-01`;
  if (!referenceDay) return fallback;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(referenceDay);
  if (!m || `${m[1]}-${m[2]}` !== yearMonth) return fallback;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) {
    return fallback;
  }
  return referenceDay;
}

export function growthNotificationToDecisionAction(
  notification: WorkspaceNotification,
  companyId: number,
  yearMonth: string,
  referenceDay?: string | null,
): WorkspaceDecisionAction {
  return {
    priority: notification.severity,
    title: notification.title,
    reason: notification.message,
    // 通知側が明示的にnullを設定した場合（入力案内・取得失敗等）は、架空の期限を補わずnullのまま
    // 引き継ぐ（dueDateが未設定=undefinedの場合もnull扱いにする）。
    dueDate: notification.dueDate ?? null,
    procedureId: null,
    actionHref: `/admin/workspaces/${companyId}/growth?date=${growthTargetDate(yearMonth, referenceDay)}`,
  };
}

// 複数の通知をまとめて変換する（呼び出し元の記述を簡潔にするだけの補助）。
export function growthNotificationsToDecisionActions(
  notifications: WorkspaceNotification[],
  companyId: number,
  yearMonth: string,
  referenceDay?: string | null,
): WorkspaceDecisionAction[] {
  return notifications.map((n) =>
    growthNotificationToDecisionAction(n, companyId, yearMonth, referenceDay),
  );
}
