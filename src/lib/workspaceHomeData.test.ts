import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from './supabase';
import {
  loadWorkspaceHomeSources,
  loadWorkspaceHomeDerived,
  loadWorkspaceCompanyForRead,
  HOME_MONTHLY_COLUMNS,
} from './workspaceHomeData.ts';
import { createWorkspaceReadGuard } from './workspaceReadGuard.ts';
const company = {
  id: 23,
  name: 'synthetic',
  corporate_type: 'kabushiki',
  fiscal_month: 3,
  prefecture_code: '13',
  municipality_code: '131130',
};
const profile = {
  company_id: 23,
  employee_count: 7,
  capital: 5000000,
  established_date: '2020-04-01',
  stage: 'second_term_or_later',
  consumption_tax_status: 'taxable',
  invoice_registration_status: 'registered',
  taxation_method: 'principle',
  corporate_tax_interim_filing: 'has',
  consumption_tax_interim_frequency: '3',
  withholding_tax_cycle: 'monthly',
  local_tax_collection_method: 'special_collection',
  resident_tax_payment_cycle: 'monthly',
  next_officer_change_date: null,
  address: null,
  e_tax_enabled: true,
  e_ltax_enabled: true,
  advisors: {
    taxAccountant: true,
    laborConsultant: false,
    judicialScrivener: false,
    administrativeScrivener: false,
  },
};
const monthly = {
  ...Object.fromEntries(HOME_MONTHLY_COLUMNS.split(',').map((k) => [k, 0])),
  year_month: '2026-11-01',
  action_goal: 'synthetic',
  revenue_model: 'sales_funnel',
  target_revenue: 1000000,
  actual_revenue: 0,
};
const defaults: Record<string, unknown> = {
  workspace_companies: company,
  workspace_company_profiles: profile,
  prefectures: { id: 13, name: 'pref' },
  municipalities: { id: 1, name: 'city' },
  workspace_tax_return_profiles: [],
  workspace_procedure_statuses: [],
  workspace_documents: [],
  workspace_daily_sales_activities: {
    activity_date: '2026-11-02',
    target_units: 10,
    actual_units: 0,
    action_plan: 'known',
    outcome_review: null,
  },
  workspace_monthly_sales: monthly,
  workspace_tax_payment_plans: [],
  procedures: [],
  rules: [],
  jurisdictions: [],
};
function fake(
  overrides: Record<string, unknown> = {},
  failure?: string,
  throws = false,
) {
  const reads: string[] = [];
  const client = {
    from(table: string) {
      let single = false;
      const q = {
        select() {
          return q;
        },
        eq() {
          return q;
        },
        gte() {
          return q;
        },
        lte() {
          return q;
        },
        order() {
          return q;
        },
        range() {
          return q;
        },
        in() {
          return q;
        },
        single() {
          single = true;
          return q;
        },
        maybeSingle() {
          single = true;
          return q;
        },
        then(
          resolve: (v: unknown) => unknown,
          reject: (v: unknown) => unknown,
        ) {
          return Promise.resolve()
            .then(() => {
              reads.push(table);
              if (failure === table && throws) throw Error('synthetic');
              const value = { ...defaults, ...overrides }[table];
              return {
                data:
                  value ??
                  (Object.hasOwn(overrides, table)
                    ? value
                    : single
                      ? null
                      : []),
                error: failure === table ? { message: 'synthetic' } : null,
              };
            })
            .then(resolve, reject);
        },
      };
      return q;
    },
  } as unknown as SupabaseClient;
  return { client, reads };
}
const target: Record<string, string> = {
  workspace_company_profiles: 'companyProfile',
  prefectures: 'companyProfile',
  municipalities: 'companyProfile',
  workspace_tax_return_profiles: 'taxReturns',
  workspace_procedure_statuses: 'procedureStatuses',
  workspace_documents: 'documents',
  workspace_daily_sales_activities: 'daily',
  workspace_monthly_sales: 'monthly',
  workspace_tax_payment_plans: 'taxPlans',
};
for (const [table, key] of Object.entries(target))
  for (const mode of ['error', 'throw'])
    test(`${table} ${mode} preserves other reads`, async () => {
      const { client } = fake({}, table, mode === 'throw');
      const s = await loadWorkspaceHomeSources(client, company, '2026-11-02');
      assert.equal(s[key as keyof typeof s].status, 'unavailable');
      for (const [k, v] of Object.entries(s))
        if (k !== key) assert.equal(v.status, 'loaded', k);
      let calls = 0;
      const d = await loadWorkspaceHomeDerived(client, s, true, async () => {
        calls++;
        return 1;
      });
      assert.equal(calls, 0);
      assert.equal(d.status, 'unavailable');
    });
for (const table of [
  'workspace_tax_return_profiles',
  'workspace_procedure_statuses',
  'workspace_documents',
  'workspace_tax_payment_plans',
])
  test(table + ' null is unavailable', async () => {
    const s = await loadWorkspaceHomeSources(
      fake({ [table]: null }).client,
      company,
      '2026-11-02',
    );
    assert.equal(s[target[table] as keyof typeof s].status, 'unavailable');
  });
test('normal empty, zero and missing remain distinct', async () => {
  const s = await loadWorkspaceHomeSources(
    fake({
      workspace_company_profiles: null,
      workspace_daily_sales_activities: null,
      workspace_monthly_sales: null,
    }).client,
    company,
    '2026-11-02',
  );
  assert.equal(s.companyProfile.status, 'loaded');
  if (s.companyProfile.status === 'loaded')
    assert.equal(s.companyProfile.value.registered, false);
  assert.deepEqual(s.daily, { status: 'loaded', value: null });
  assert.deepEqual(s.monthly, { status: 'loaded', value: null });
  assert.deepEqual(s.taxPlans, { status: 'loaded', value: 0 });
  assert.deepEqual(s.documents, {
    status: 'loaded',
    value: { statusMap: {}, needsUpdateCount: 0 },
  });
});
for (const [table, data] of [
  ['workspace_company_profiles', { ...profile, employee_count: undefined }],
  ['workspace_monthly_sales', { ...monthly, actual_revenue: null }],
  [
    'workspace_daily_sales_activities',
    { activity_date: '2026-11-02', actual_units: 0 },
  ],
  ['workspace_documents', [{ document_type: 'wrong', status: 'registered' }]],
  [
    'workspace_tax_payment_plans',
    [{ procedure_id: 1, due_date: '2026-11-02', amount: null }],
  ],
] as const)
  test('malformed ' + table + ' never defaults to zero', async () => {
    const s = await loadWorkspaceHomeSources(
      fake({ [table]: data }).client,
      company,
      '2026-11-02',
    );
    assert.equal(s[target[table] as keyof typeof s].status, 'unavailable');
  });
test('company missing versus error', async () => {
  assert.equal(
    (
      await loadWorkspaceCompanyForRead(
        fake({ workspace_companies: null }).client,
        23,
      )
    ).status,
    'missing',
  );
  assert.equal(
    (
      await loadWorkspaceCompanyForRead(
        fake({}, 'workspace_companies').client,
        23,
      )
    ).status,
    'unavailable',
  );
});
test('engine swallowed query error cannot yield derived output', async () => {
  const f = fake({}, 'rules'),
    s = await loadWorkspaceHomeSources(f.client, company, '2026-11-02');
  const r = await loadWorkspaceHomeDerived(f.client, s, true, async (c) => {
    try {
      await c
        .from('rules')
        .select('id,rule_conditions(field),rule_actions(action_type)');
    } catch {}
    return { falseSuccess: 0 };
  });
  assert.equal(r.status, 'unavailable');
});
for (const data of [
  null,
  {},
  [{}],
  [{ id: 1, rule_conditions: null, rule_actions: [] }],
])
  test('guard rejects bad rule read ' + JSON.stringify(data), async () => {
    const g = createWorkspaceReadGuard(fake({ rules: data }).client);
    await assert.rejects(
      Promise.resolve(
        g.client
          .from('rules')
          .select('id,rule_conditions(field),rule_actions(action_type)'),
      ),
    );
    assert.ok(g.failed());
  });
test('guard empty rules are valid; legacy client not mutated', async () => {
  const f = fake({ rules: [] }),
    g = createWorkspaceReadGuard(f.client);
  await g.client
    .from('rules')
    .select('id,rule_conditions(field),rule_actions(action_type)');
  assert.ok(!g.failed());
  const bad = fake({}, 'rules');
  const guarded = createWorkspaceReadGuard(bad.client);
  const r = await bad.client.from('rules').select('*');
  assert.ok(r.error);
  assert.ok(!guarded.failed());
});
test('read guard forbids writes and captures transport errors', async () => {
  const g = createWorkspaceReadGuard(fake({}, 'rules', true).client);
  await assert.rejects(Promise.resolve(g.client.from('rules').select('*')));
  assert.ok(g.failed());
  assert.throws(() => g.client.from('rules').delete());
});

test('review fetch failure prevents overall priority but retains all healthy sources', async () => {
  const f = fake(),
    s = await loadWorkspaceHomeSources(f.client, company, '2026-11-02');
  let called = false;
  const r = await loadWorkspaceHomeDerived(f.client, s, false, async () => {
    called = true;
    return 0;
  });
  assert.equal(r.status, 'unavailable');
  assert.equal(called, false);
  assert.ok(Object.values(s).every((v) => v.status === 'loaded'));
});

for (const procedures of [null, {code:'DEPRECIABLE_ASSET_TAX_RETURN'}, {code:'SALARY_PAYMENT_REPORT'}]) {
  test(`ホームの未確認納付額を0円や部分合計にしない: ${JSON.stringify(procedures)}`, async () => {
    const {client} = fake({workspace_tax_payment_plans:[{procedure_id:66,due_date:'2026-11-30',amount:1000,procedures}]});
    const result = await loadWorkspaceHomeSources(client,company,'2026-11-02');
    assert.equal(result.taxPlans.status,'unavailable');
    assert.equal(result.companyProfile.status,'loaded');
  });
}
