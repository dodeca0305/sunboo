export function selectTodayActionItems<T>(
  advice: { warnings: T[]; priority: T[] },
): T[] {
  return advice.warnings.length > 0 ? advice.warnings : advice.priority;
}
