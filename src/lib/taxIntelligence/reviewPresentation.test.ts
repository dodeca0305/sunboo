import test from 'node:test';
import assert from 'node:assert/strict';
import type { WorkspaceTaxReviewItem } from './reviewCases';
import { groupReviewItems, reviewNextAction, reviewSection } from './reviewPresentation.ts';

function item(caseId: number, values: Partial<WorkspaceTaxReviewItem> = {}): WorkspaceTaxReviewItem {
  return { caseId, caseStatus: 'open', resultStatus: 'review', severity: 'warning', ...values } as WorkspaceTaxReviewItem;
}

test('reading order separates important review, unknown, next, resolved and dismissed without mutating results', () => {
  const rows = [item(1), item(2, { resultStatus: 'unknown', severity: 'info' }), item(3, { severity: 'critical' }), item(4, { caseStatus: 'dismissed' }), item(5, { caseStatus: 'resolved' })];
  const before = structuredClone(rows);
  assert.deepEqual(groupReviewItems(rows).map(s => [s.id, s.items.map(r => r.caseId)]), [
    ['priority', [3]], ['unknown', [2]], ['next', [1]], ['resolved', [5]], ['dismissed', [4]],
  ]);
  assert.deepEqual(rows, before);
});

test('all unknown severities require information, never become completed or low priority', () => {
  for (const severity of ['info', 'warning', 'error', 'critical'] as const) {
    const row = item(1, { resultStatus: 'unknown', severity });
    assert.equal(reviewSection(row), 'unknown');
    assert.match(reviewNextAction(row), /足りない情報/);
  }
});

test('closed records stay distinct from new action and dismissed never means completed', () => {
  assert.equal(reviewSection(item(1, { caseStatus: 'resolved', resultStatus: 'unknown' })), 'resolved');
  assert.equal(reviewSection(item(2, { caseStatus: 'dismissed', severity: 'critical' })), 'dismissed');
});

test('each record appears once, keeps server order within each section, empty results produce no sections', () => {
  const rows = [item(8), item(6), item(4, { severity: 'error' })];
  assert.deepEqual(groupReviewItems(rows).flatMap(g => g.items.map(r => r.caseId)), [4, 8, 6]);
  assert.deepEqual(groupReviewItems([]), []);
});
