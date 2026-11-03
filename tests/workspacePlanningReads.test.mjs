import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadPlanningSources,
  loadPlanningDerived,
} from '../src/lib/workspacePlanningData.ts';
import { createPlanningReadGuard } from '../src/lib/workspacePlanningReadGuard.ts';
import { fixture, initial } from './fixtures/taxExecutionInputs.mjs';
const company = initial.workspace_companies[0];
for (const table of [
  'workspace_company_profiles',
  'prefectures',
  'municipalities',
  'workspace_tax_return_profiles',
  'workspace_procedure_statuses',
])
  for (const mode of ['error', 'throw', 'malformed', 'null'])
    test(`planning source ${table} ${mode}`, async () => {
      const f = fixture({ failTable: table, mode });
      const s = await loadPlanningSources(f.client, company);
      const key =
        table === 'workspace_tax_return_profiles'
          ? 'taxReturns'
          : table === 'workspace_procedure_statuses'
            ? 'statuses'
            : 'profile';
      assert.equal(
        s[key].status,
        table === 'workspace_company_profiles' && mode === 'null'
          ? 'loaded'
          : 'unavailable',
      );
      if (key !== 'taxReturns') assert.equal(s.taxReturns.status, 'loaded');
      if (key !== 'statuses') assert.equal(s.statuses.status, 'loaded');
      assert.equal(f.calls.length, 0);
    });
for (const table of [
  'rules',
  'procedures',
  'jurisdictions',
  'procedure_submission_rules',
  'submission_jurisdictions',
  'submission_offices',
  'office_sources',
])
  for (const mode of ['error', 'throw', 'null', 'malformed'])
    test(`planning engine ${table} ${mode}: swallowed errors do not become empty plan`, async () => {
      const f = fixture({ failTable: table, mode });
      const s = await loadPlanningSources(f.client, company);
      const result = await loadPlanningDerived(
        f.client,
        company.id,
        s,
        async (c) => {
          try {
            await c.from(table).select('*');
          } catch {}
          return [];
        },
      );
      assert.equal(result.status, 'unavailable');
      assert.equal(f.calls.length, 0);
    });
test('normal missing inputs and empty rules remain successful; original client unaffected', async () => {
  const f = fixture();
  f.data.workspace_company_profiles = [];
  f.data.workspace_tax_return_profiles = [];
  f.data.rules = [];
  const s = await loadPlanningSources(f.client, company);
  assert.equal(s.profile.status, 'loaded');
  assert.equal(s.taxReturns.status, 'loaded');
  const result = await loadPlanningDerived(
    f.client,
    company.id,
    s,
    async (c) => {
      await c.from('rules').select('*');
      return [];
    },
  );
  assert.deepEqual(result, { status: 'loaded', value: [] });
  assert.equal(f.calls.length, 0);
  assert.deepEqual((await f.client.from('rules').select('*')).data, []);
});
test('profile failure prevents building; statuses failure does not erase independently computable schedules', async () => {
  const failed = fixture({ failTable: 'workspace_company_profiles' });
  const s = await loadPlanningSources(failed.client, company);
  let called = 0;
  await loadPlanningDerived(failed.client, company.id, s, async () => {
    called++;
    return [];
  });
  assert.equal(called, 0);
  const partial = fixture({ failTable: 'workspace_procedure_statuses' });
  const ps = await loadPlanningSources(partial.client, company);
  assert.equal(ps.statuses.status, 'unavailable');
  assert.deepEqual(
    await loadPlanningDerived(partial.client, company.id, ps, async () => [
      'known schedule',
    ]),
    { status: 'loaded', value: ['known schedule'] },
  );
});
test('missing joins, malformed conditions/actions and missing requested offices stop derived output', async () => {
  for (const [table, row, selection] of [
    [
      'rules',
      {
        id: 1,
        name: 'test',
        priority: 1,
        is_active: true,
        rule_conditions: [{}],
        rule_actions: [],
      },
      '*',
    ],
    [
      'rules',
      {
        id: 1,
        name: 'test',
        priority: 1,
        is_active: true,
        rule_conditions: [],
        rule_actions: [
          {
            action_type: 'add_procedure',
            procedure_id: null,
            payload: null,
            sort_order: 0,
          },
        ],
      },
      '*',
    ],
    [
      'jurisdictions',
      { organization_types: { code: 'tax' }, organization_offices: null },
      'organization_types(code),organization_offices(*)',
    ],
    [
      'procedure_submission_rules',
      { id: 1, procedure_id: 65, office_category: 'tax', conditions: null },
      '*',
    ],
  ]) {
    const data = structuredClone(initial);
    data[table] = [row];
    const g = createPlanningReadGuard(fixture({ data }).client);
    await assert.rejects(
      Promise.resolve(g.client.from(table).select(selection)),
    );
    assert.equal(g.failed(), true);
  }
  const g = createPlanningReadGuard(fixture().client);
  await assert.rejects(
    Promise.resolve(
      g.client.from('submission_offices').select('*').in('id', [4]),
    ),
  );
  assert.equal(g.failed(), true);
});
test('guard blocks RPC and business writes', async () => {
  const g = createPlanningReadGuard(fixture().client);
  assert.throws(() => g.client.rpc('anything'));
  assert.equal(g.failed(), true);
});

test('numeric deadline data is validated without recalculating dates', async () => {
  const data = structuredClone(initial);
  data.procedures = [
    {
      id: 1,
      code: 'synthetic',
      name: 'synthetic',
      category: 'tax',
      timing_type: 'fixed_date',
      timing_data: { month: '12', day: 31 },
      requires_employees: false,
      requires_officer_term: false,
      official_links: [],
      procedure_documents: [],
    },
  ];
  const guard = createPlanningReadGuard(fixture({ data }).client);
  await assert.rejects(
    Promise.resolve(guard.client.from('procedures').select('*')),
  );
  assert.equal(guard.failed(), true);
});
test('large unpaged reads are held instead of trusting a possible truncated list', async () => {
  const data = structuredClone(initial);
  data.rules = Array.from({ length: 1000 }, (_, i) => ({
    id: i + 1,
    name: 'synthetic',
    priority: 1,
    is_active: true,
    rule_conditions: [],
    rule_actions: [],
  }));
  const guard = createPlanningReadGuard(fixture({ data }).client);
  await assert.rejects(Promise.resolve(guard.client.from('rules').select('*')));
  assert.equal(guard.failed(), true);
});

test('synchronous query construction errors cannot be swallowed into a valid plan', () => {
  const guard = createPlanningReadGuard({
    from() {
      throw Error('synthetic query exception');
    },
  });
  assert.throws(() => guard.client.from('rules'));
  assert.equal(guard.failed(), true);
});
