import type { WorkspaceTaxReviewItem } from './reviewCases';

// This is a reading order, not a tax assessment or a deadline calculation.
export const REVIEW_SECTIONS = [
  { id: 'priority', title: '先に確認すること', tone: 'border-red-200 bg-red-50 text-red-900' },
  { id: 'unknown', title: 'まず情報を確認すること', tone: 'border-amber-200 bg-amber-50 text-amber-950' },
  { id: 'next', title: '次にすること', tone: 'border-blue-200 bg-blue-50 text-blue-950' },
  { id: 'resolved', title: '対応済み', tone: 'border-emerald-200 bg-emerald-50 text-emerald-950' },
  { id: 'dismissed', title: '対象外として記録したこと', tone: 'border-gray-200 bg-gray-50 text-gray-800' },
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
