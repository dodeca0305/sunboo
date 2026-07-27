type WorkspaceAdviceSummaryItem = {
  title: string;
  detail: string;
};

export function buildWorkspaceAdviceSummary(
  warnings: WorkspaceAdviceSummaryItem[],
  priority: WorkspaceAdviceSummaryItem[],
  priorityWindowDays = 30,
): string {
  const overdueWarnings = warnings.filter((warning) =>
    warning.detail.startsWith('期限超過'),
  );

  if (overdueWarnings.length === 1) {
    return `${overdueWarnings[0].title}が期限を過ぎています。必要書類と対応手順を確認し、今日中に着手してください。`;
  }

  if (overdueWarnings.length > 1) {
    return `${overdueWarnings[0].title}など${overdueWarnings.length}件が期限を過ぎています。優先順位を決め、今日中に最初の1件へ着手してください。`;
  }

  if (warnings.length > 0) {
    return `${warnings.length}件、期限が迫っている手続きがあります。`;
  }

  if (priority.length > 0) {
    return `直近${priorityWindowDays}日以内に${priority.length}件の手続きがあります。`;
  }

  return '直近の手続きに遅れはありません。';
}

export function selectTodayActionItems<T>(
  advice: { warnings: T[]; priority: T[] },
): T[] {
  return advice.warnings.length > 0 ? advice.warnings : advice.priority;
}
