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

type Row = Record<string, unknown>;
type Reply = { data: Row[] | null; error: { message: string } | null };
type Call = {
  table: string;
  eq: Array<[string, unknown]>;
  in: Array<[string, unknown[]]>;
  order: Array<[string, boolean]>;
  range: Array<[number, number]>;
};

function cmp(a: unknown, b: unknown): number {
  const x = a as string | number;
  const y = b as string | number;
  return x < y ? -1 : x > y ? 1 : 0;
}

// eq/in/order/rangeを実際に適用し、発行されたクエリ条件を記録するfake。
// serverMaxRows: PostgRESTのmax-rows相当（range指定の有無にかかわらずこれ以上は返さない）。
function fakeSupabase(tables: Record<string, Reply>, serverMaxRows = Infinity) {
  const calls: Call[] = [];
  const client = {
    from(name: string) {
      const call: Call = { table: name, eq: [], in: [], order: [], range: [] };
      calls.push(call);
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.eq = (col: string, val: unknown) => {
        call.eq.push([col, val]);
        return b;
      };
      b.in = (col: string, vals: unknown[]) => {
        call.in.push([col, vals]);
        return b;
      };
      b.order = (col: string, opts?: { ascending?: boolean }) => {
        call.order.push([col, opts?.ascending !== false]);
        return b;
      };
      b.range = (from: number, to: number) => {
        call.range.push([from, to]);
        return b;
      };
      b.then = (resolve: (v: unknown) => unknown) => {
        const reply = tables[name];
        if (!Array.isArray(reply.data)) return resolve(reply);
        const rows = reply.data
          .filter((row) => call.eq.every(([c, v]) => row[c] === v) && call.in.every(([c, vs]) => vs.includes(row[c])))
          .sort((x, y) => {
            for (const [c, asc] of call.order) {
              const d = cmp(x[c], y[c]);
              if (d !== 0) return asc ? d : -d;
            }
            return 0;
          });
        const [from, to] = call.range[call.range.length - 1] ?? [0, Infinity];
        return resolve({ data: rows.slice(from, to + 1).slice(0, serverMaxRows), error: reply.error });
      };
      return b;
    },
  };
  return { supabase: client as never, calls };
}

const noReviews: Reply = { data: [], error: null };

test('レビュー取得失敗でもControl評価状況は返り、openReviewCountはnull', async () => {
  const { supabase } = fakeSupabase({
    workspace_tax_review_cases: { data: null, error: { message: 'denied' } },
    tax_controls: { data: [{ id: 1, status: 'approved', is_enabled: true }], error: null },
    workspace_tax_control_results: { data: [], error: null },
  });
  const s = await loadWorkspaceTaxReviewSummary(supabase, 1);
  assert.equal(s.openReviewCount, null);
  assert.equal(s.controlEvaluation?.unevaluatedCount, 1);
});

test('Control取得失敗でもopenReviewCountは返り、controlEvaluationはnull', async () => {
  const { supabase } = fakeSupabase({
    workspace_tax_review_cases: noReviews,
    tax_controls: { data: null, error: { message: 'denied' } },
    workspace_tax_control_results: { data: [], error: null },
  });
  const s = await loadWorkspaceTaxReviewSummary(supabase, 1);
  assert.equal(s.openReviewCount, 0);
  assert.equal(s.controlEvaluation, null);
});

test('結果取得失敗ならcontrolEvaluationはnull（0件扱いにしない）', async () => {
  const { supabase } = fakeSupabase({
    workspace_tax_review_cases: noReviews,
    tax_controls: { data: [{ id: 1, status: 'approved', is_enabled: true }], error: null },
    workspace_tax_control_results: { data: null, error: { message: 'boom' } },
  });
  const s = await loadWorkspaceTaxReviewSummary(supabase, 1);
  assert.equal(s.controlEvaluation, null);
});

test('pageSizeが不正（0・負・小数・NaN・Infinity）なら問い合わせずcontrolEvaluationはnull', async () => {
  for (const bad of [0, -1, 1.5, NaN, Infinity]) {
    const { supabase, calls } = fakeSupabase({
      workspace_tax_review_cases: noReviews,
      tax_controls: { data: [{ id: 1, status: 'approved', is_enabled: true }], error: null },
      workspace_tax_control_results: { data: [], error: null },
    });
    const s = await loadWorkspaceTaxReviewSummary(supabase, 1, bad);
    assert.equal(s.controlEvaluation, null, `pageSize=${bad}`);
    assert.equal(calls.filter((c) => c.table === 'tax_controls').length, 0, `pageSize=${bad}`);
  }
});

// 要求サイズ(pageSize)とサーバー上限(serverMax)の大小を変えても取りこぼさない。
// 特に 要求5 > 上限3 は、offsetを要求幅で進めると4,5件目を飛ばす回帰ケース。
// 実取得件数 min(要求, 上限, 残件数) だけoffsetが進む想定のrange列。untilEmptyなら空ページまで読む。
function expectedRanges(total: number, pageSize: number, serverMax: number, untilEmpty: boolean): Array<Array<[number, number]>> {
  const out: Array<Array<[number, number]>> = [];
  let from = 0;
  while (from < total) {
    out.push([[from, from + pageSize - 1]]);
    from += Math.min(pageSize, serverMax, total - from);
  }
  if (untilEmpty) out.push([[from, from + pageSize - 1]]);
  return out;
}

const PAGE_CASES: Array<{ pageSize: number; serverMax: number }> = [
  { pageSize: 5, serverMax: 3 },
  { pageSize: 3, serverMax: 3 },
  { pageSize: 2, serverMax: 3 },
  { pageSize: 1, serverMax: 3 },
];

for (const { pageSize, serverMax } of PAGE_CASES) {
  const label = `要求${pageSize}/上限${serverMax}`;

  test(`Control母集団: ${label}でも全件を数える`, async () => {
    // 順不同・対象外（draft / 無効）混在で投入しても、条件とid昇順で読まれることを確認する
    const controls: Row[] = [7, 3, 1, 6, 2, 5, 4].map((id) => ({ id, status: 'approved', is_enabled: true }));
    controls.push({ id: 99, status: 'draft', is_enabled: true }, { id: 98, status: 'approved', is_enabled: false });
    const { supabase, calls } = fakeSupabase(
      {
        workspace_tax_review_cases: noReviews,
        tax_controls: { data: controls, error: null },
        workspace_tax_control_results: { data: [], error: null },
      },
      serverMax,
    );
    const s = await loadWorkspaceTaxReviewSummary(supabase, 1, pageSize);
    assert.equal(s.controlEvaluation?.approvedEnabledControlCount, 7);
    assert.equal(s.controlEvaluation?.unevaluatedCount, 7);

    const cs = calls.filter((c) => c.table === 'tax_controls');
    for (const c of cs) {
      assert.deepEqual(c.eq, [['status', 'approved'], ['is_enabled', true]]);
      assert.deepEqual(c.order, [['id', true]]);
    }
    // offsetは実際に取得できた件数ぶんだけ進む（要求幅では進まない）
    // 7件を読み切るまで進み、最後は空ページで終了する（例: 要求5/上限3 → 開始0,3,6,7）
    assert.deepEqual(cs.map((c) => c.range), expectedRanges(7, pageSize, serverMax, true));
  });

  test(`結果: ${label}でも最新を採用し会社を分離する`, async () => {
    const rows: Row[] = [];
    let id = 1;
    // Control1: 28日分の履歴（最新日のみreview、他はpass）。Control2: 古いpassのみ。
    for (let day = 1; day <= 28; day++) {
      rows.push({
        ...result({
          id: id++,
          tax_control_id: 1,
          status: day === 28 ? 'review' : 'pass',
          as_of_date: `2026-09-${String(day).padStart(2, '0')}`,
        }),
        company_id: 1,
      });
    }
    rows.push({ ...result({ id: id++, tax_control_id: 2, status: 'pass', as_of_date: '2026-01-01' }), company_id: 1 });
    // 他会社の新しい結果・対象外Controlの結果が混ざっても数えない
    rows.push({ ...result({ id: id++, tax_control_id: 2, status: 'review', as_of_date: '2026-10-20' }), company_id: 2 });
    rows.push({ ...result({ id: id++, tax_control_id: 3, status: 'review', as_of_date: '2026-10-20' }), company_id: 1 });

    const { supabase, calls } = fakeSupabase(
      {
        workspace_tax_review_cases: noReviews,
        tax_controls: {
          data: [1, 2].map((cid) => ({ id: cid, status: 'approved', is_enabled: true })),
          error: null,
        },
        workspace_tax_control_results: { data: rows, error: null },
      },
      serverMax,
    );
    const s = await loadWorkspaceTaxReviewSummary(supabase, 1, pageSize);
    assert.equal(s.controlEvaluation?.evaluatedCount, 2);
    assert.equal(s.controlEvaluation?.reviewCount, 1);
    assert.equal(s.controlEvaluation?.passCount, 1);
    assert.equal(s.controlEvaluation?.unevaluatedCount, 0);

    const rs = calls.filter((c) => c.table === 'workspace_tax_control_results');
    assert.ok(rs.length > 1, '複数ページにまたがる');
    for (const c of rs) {
      assert.deepEqual(c.eq, [['company_id', 1]]);
      assert.deepEqual(c.in, [['tax_control_id', [1, 2]]]);
      assert.deepEqual(c.order, [['as_of_date', false], ['evaluated_at', false], ['id', false]]);
    }
    // 該当は会社1・対象Controlの29件。最古のControl2の結果を含むページで打ち切るため空ページは読まない
    assert.deepEqual(rs.map((c) => c.range), expectedRanges(29, pageSize, serverMax, false));
  });
}
