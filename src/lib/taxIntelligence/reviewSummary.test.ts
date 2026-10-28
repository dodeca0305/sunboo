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

// serverMaxRows: PostgRESTのmax-rows相当。range指定の有無にかかわらずこれ以上は返さない。
function fakeSupabase(tables: Record<string, Reply>, serverMaxRows = Infinity) {
  return {
    from(name: string) {
      const b: Record<string, unknown> = {};
      let rangeFrom = 0;
      let rangeTo = Infinity;
      const chain = () => b;
      b.select = chain;
      b.eq = chain;
      b.in = chain;
      b.order = chain;
      b.range = (from: number, to: number) => {
        rangeFrom = from;
        rangeTo = to;
        return b;
      };
      b.then = (resolve: (v: unknown) => unknown) => {
        const reply = tables[name];
        if (!Array.isArray(reply.data)) return resolve(reply);
        const rows = reply.data.slice(rangeFrom, rangeTo + 1).slice(0, serverMaxRows);
        return resolve({ data: rows, error: reply.error });
      };
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

test('結果取得失敗ならcontrolEvaluationはnull（0件扱いにしない）', async () => {
  const supabase = fakeSupabase({
    workspace_tax_review_cases: { data: [], error: null },
    tax_controls: { data: [{ id: 1 }], error: null },
    workspace_tax_control_results: { data: null, error: { message: 'boom' } },
  });
  const s = await loadWorkspaceTaxReviewSummary(supabase, 1);
  assert.equal(s.controlEvaluation, null);
});

test('Control母集団が返却上限を超えても全件を数える', async () => {
  const controls = Array.from({ length: 7 }, (_, i) => ({ id: i + 1 }));
  const supabase = fakeSupabase(
    {
      workspace_tax_review_cases: { data: [], error: null },
      tax_controls: { data: controls, error: null },
      workspace_tax_control_results: { data: [], error: null },
    },
    3,
  );
  const s = await loadWorkspaceTaxReviewSummary(supabase, 1, 3);
  assert.equal(s.controlEvaluation?.approvedEnabledControlCount, 7);
  assert.equal(s.controlEvaluation?.unevaluatedCount, 7);
});

test('結果が返却上限を超えても最新結果を採用する（過去passに引きずられない）', async () => {
  // 最新順（降順）に並んだ履歴: 先頭に最新review、後続ページに古いpassが続く
  const history: SummaryResultRow[] = [];
  let id = 1000;
  for (let day = 28; day >= 1; day--) {
    history.push(
      result({
        id: id--,
        tax_control_id: 1,
        status: day === 28 ? 'review' : 'pass',
        as_of_date: `2026-09-${String(day).padStart(2, '0')}`,
      }),
    );
  }
  history.push(result({ id: 5, tax_control_id: 2, status: 'pass', as_of_date: '2026-01-01' }));
  const supabase = fakeSupabase(
    {
      workspace_tax_review_cases: { data: [], error: null },
      tax_controls: { data: [{ id: 1 }, { id: 2 }], error: null },
      workspace_tax_control_results: { data: history, error: null },
    },
    5,
  );
  const s = await loadWorkspaceTaxReviewSummary(supabase, 1, 5);
  assert.equal(s.controlEvaluation?.evaluatedCount, 2);
  assert.equal(s.controlEvaluation?.reviewCount, 1);
  assert.equal(s.controlEvaluation?.passCount, 1);
  assert.equal(s.controlEvaluation?.unevaluatedCount, 0);
});
