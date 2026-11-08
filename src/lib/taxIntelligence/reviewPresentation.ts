import type { WorkspaceTaxReviewItem } from './reviewCases';

// This is a reading order, not a tax assessment or a deadline calculation.
export const REVIEW_SECTIONS = [
  { id: 'priority', title: '先に確認すること', tone: 'text-red-800' },
  { id: 'unknown', title: 'まず情報を確認すること', tone: 'text-amber-800' },
  { id: 'next', title: '次にすること', tone: 'text-neutral-700' },
  { id: 'resolved', title: '対応済み', tone: 'text-neutral-700' },
  { id: 'dismissed', title: '対象外として記録したこと', tone: 'text-neutral-700' },
] as const;

export function reviewSection(item: WorkspaceTaxReviewItem): typeof REVIEW_SECTIONS[number]['id'] {
  if (item.caseStatus === 'resolved') return 'resolved';
  if (item.caseStatus === 'dismissed') return 'dismissed';
  // Unknown is never presented as low priority or as a successful check.
  if (item.resultStatus === 'unknown') return 'unknown';
  if (item.severity === 'critical' || item.severity === 'error') return 'priority';
  return 'next';
}

export function reviewNextAction(item: WorkspaceTaxReviewItem): string {
  return item.resultStatus === 'unknown'
    ? '足りない情報や確認事項を、担当者・税理士と確認する'
    : '確認内容を担当者・税理士に相談し、必要な対応を決める';
}

export function groupReviewItems(items: WorkspaceTaxReviewItem[]) {
  return REVIEW_SECTIONS.map((section) => ({
    ...section,
    items: items.filter((item) => reviewSection(item) === section.id),
  })).filter((section) => section.items.length > 0);
}
