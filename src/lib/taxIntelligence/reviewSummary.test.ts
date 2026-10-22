import test from 'node:test';
import assert from 'node:assert/strict';

import {
  loadWorkspaceTaxReviewSummary,
  summarizeControlEvaluation,
  type SummaryResultRow,
} from './reviewSummary.ts';

function result(over: Partial<SummaryResultRow> & { id: number; tax_control_id: number }): SummaryResultRow {
  return {
    applicable: true,
    status: 'pass',
    as_of_date: '2026-10-01',
    evaluated_at: '2026-10-01T00:00:00Z',
    ...over,
  };
}

test('承認済み有効Controlが0件なら評価対象なし（対象外Controlの結果は数えない）', () => {
  const s = summarizeControlEvaluation([], [result({ id: 1, tax_control_id: 9 })]);
  assert.equal(s.approvedEnabledControlCount, 0);
  assert.equal(s.evaluatedCount, 0);
  assert.equal(s.passCount, 0);
});

test('結果の無いControlは未評価として残る', () => {
  const s = summarizeControlEvaluation([{ id: 1 }, { id: 2 }], [result({ id: 10, tax_control_id: 1 })]);
  assert.equal(s.approvedEnabledControlCount, 2);
  assert.equal(s.evaluatedCount, 1);
  assert.equal(s.unevaluatedCount, 1);
});

test('履歴は最新1件のみ数える', () => {
  const s = summarizeControlEvaluation(
    [{ id: 1 }],
    [
      result({ id: 10, tax_control_id: 1, status: 'review', as_of_date: '2026-09-01' }),
      result({ id: 11, tax_control_id: 1, status: 'pass', as_of_date: '2026-10-01' }),
      result({ id: 12, tax_control_id: 1, status: 'unknown', as_of_date: '2026-10-01', evaluated_at: '2026-10-02T00:00:00Z' }),
    ],
  );
  assert.equal(s.evaluatedCount, 1);
  assert.equal(s.unknownCount, 1);
  assert.equal(s.reviewCount, 0);
  assert.equal(s.passCount, 0);
  assert.equal(s.latestEvaluatedAt, '2026-10-02T00:00:00Z');
});

test('applicable=falseは対象外として数える', () => {
  const s = summarizeControlEvaluation(
    [{ id: 1 }],
    [result({ id: 1, tax_control_id: 1, applicable: false, status: null })],
  );
  assert.equal(s.notApplicableCount, 1);
  assert.equal(s.passCount, 0);
});

type Reply = { data: unknown; error: { message: string } | null };

function fakeSupabase(tables: Record<string, Reply>) {
  return {
    from(name: string) {
      const b: Record<string, unknown> = {};
      const chain = () => b;
      b.select = chain;
      b.eq = chain;
      b.in = chain;
      b.order = chain;
      b.then = (resolve: (v: unknown) => unknown) => resolve(tables[name]);
      return b;
    },
  } as never;
}

test('レビュー取得失敗でもControl評価状況は返り、openReviewCountはnull', async () => {
  const supabase = fakeSupabase({
    workspace_tax_review_cases: { data: null, error: { message: 'denied' } },
    tax_controls: { data: [{ id: 1 }], error: null },
    workspace_tax_control_results: { data: [], error: null },
  });
  const s = await loadWorkspaceTaxReviewSummary(supabase, 1);
  assert.equal(s.openReviewCount, null);
  assert.equal(s.controlEvaluation?.unevaluatedCount, 1);
});

test('Control取得失敗でもopenReviewCountは返り、controlEvaluationはnull', async () => {
  const supabase = fakeSupabase({
    workspace_tax_review_cases: { data: [], error: null },
    tax_controls: { data: null, error: { message: 'denied' } },
  });
  const s = await loadWorkspaceTaxReviewSummary(supabase, 1);
  assert.equal(s.openReviewCount, 0);
  assert.equal(s.controlEvaluation, null);
});
