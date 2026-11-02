import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from './supabase';
import {
  loadTaxReturnEditor,
  loadTaxReturnRowsForEditing,
  saveTaxReturn,
  reconcileTaxReturnIntent,
  validTaxReturnIntent,
  validTaxReturnPayload,
  validTaxReturnRow,
  taxReturnPayload,
  type TaxReturnSaveIntent,
} from './workspaceTaxReturnData.ts';
import type { WorkspaceTaxReturnProfileRow } from './workspaceTaxReturnProfile';
const payload = {
  fiscal_year: '2025年度',
  fiscal_year_start_date: null,
  fiscal_year_end_date: '2025-03-31',
  filed_date: null,
  capital_at_filing: null,
  taxable_sales_amount: null,
  consumption_tax_status: 'taxable',
  taxation_method: 'principle',
  invoice_registration_status: 'registered',
  corporate_tax_amount: {
    precision: 'exact' as const,
    exactValue: 0,
    rangeBucketId: null,
  },
  consumption_tax_amount: {
    precision: 'range' as const,
    exactValue: null,
    rangeBucketId: '48_400',
  },
  corporate_tax_interim_filing_actual: 'none',
  consumption_tax_interim_frequency_actual: '1',
  financial_statement_published: true,
  withholding_tax_cycle_actual: 'monthly',
  employee_count_at_fiscal_year_end: 7,
};
const row: WorkspaceTaxReturnProfileRow = {
  ...payload,
  id: 1,
  company_id: 23,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};
const defaults: Record<string, unknown> = {
  workspace_companies: {
    id: 23,
    name: 'synthetic',
    corporate_type: 'kabushiki',
    fiscal_month: 3,
    prefecture_code: '13',
    municipality_code: '131130',
  },
  workspace_company_profiles: {
    company_id: 23,
    employee_count: 7,
    consumption_tax_status: 'taxable',
    invoice_registration_status: 'registered',
  },
  prefectures: { name: 'pref' },
  municipalities: { name: 'city' },
  workspace_tax_return_profiles: [row],
};
function client(
  overrides: Record<string, unknown> = {},
  fail?: string,
  throws = false,
  response: unknown = row,
) {
  const calls: unknown[][] = [];
  return {
    calls,
    client: {
      from(table: string) {
        let write = false;
        const b = {
          select() {
            return b;
          },
          order() {
            return b;
          },
          range() {
            return b;
          },
          eq(k: string, v: unknown) {
            calls.push([table, 'eq', k, v]);
            return b;
          },
          insert(v: unknown) {
            write = true;
            calls.push([table, 'insert', v]);
            return b;
          },
          update(v: unknown) {
            write = true;
            calls.push([table, 'update', v]);
            return b;
          },
          delete() {
            write = true;
            calls.push([table, 'delete']);
            return b;
          },
          single() {
            return Promise.resolve().then(() => finish());
          },
          maybeSingle() {
            return Promise.resolve().then(() => finish());
          },
          then(
            resolve: (r: unknown) => unknown,
            reject: (e: unknown) => unknown,
          ) {
            return Promise.resolve()
              .then(() => finish())
              .then(resolve, reject);
          },
        };
        function finish() {
          if (table === fail && throws)
            throw Error('synthetic transport failure');
          return {
            data: write ? response : { ...defaults, ...overrides }[table],
            error:
              table === fail ? { code: '23505', message: 'synthetic' } : null,
          };
        }
        return b;
      },
    } as unknown as SupabaseClient,
  };
}
for (const table of Object.keys(defaults))
  for (const failure of ['error', 'throw'])
    test(`${table} ${failure} is unavailable`, async () => {
      assert.equal(
        (
          await loadTaxReturnEditor(
            client({}, table, failure === 'throw').client,
            23,
          )
        ).status,
        'unavailable',
      );
    });
for (const data of [
  null,
  {},
  [{}],
  [{ ...row, company_id: 24 }],
  [row, row],
  [
    {
      ...row,
      taxable_sales_amount: {
        precision: 'exact',
        exactValue: '0',
        rangeBucketId: null,
      },
    },
  ],
  [{ ...row, corporate_tax_amount: undefined }],
  [
    {
      ...row,
      corporate_tax_amount: {
        precision: 'exact',
        exactValue: -1,
        rangeBucketId: null,
      },
    },
  ],
])
  test(
    'invalid result never becomes empty: ' + JSON.stringify(data),
    async () => {
      assert.equal(
        await loadTaxReturnRowsForEditing(
          client({ workspace_tax_return_profiles: data }).client,
          23,
        ),
        null,
      );
    },
  );
test('normal empty and normal unregistered profile editable', async () => {
  const r = await loadTaxReturnEditor(
    client({
      workspace_tax_return_profiles: [],
      workspace_company_profiles: null,
    }).client,
    23,
  );
  assert.equal(r.status, 'loaded');
  if (r.status === 'loaded') {
    assert.deepEqual(r.rows, []);
    assert.equal(r.companyProfile.employeeCount, 0);
  }
});
test('real zero, unknown amounts and range remain distinct', async () => {
  const r = await loadTaxReturnRowsForEditing(client().client, 23);
  assert.deepEqual(r, [row]);
  assert.equal(r![0].taxable_sales_amount, null);
  assert.equal(r![0].corporate_tax_amount?.exactValue, 0);
  assert.equal(r![0].consumption_tax_amount?.rangeBucketId, '48_400');
});
for (const employee_count of [null, undefined, -1, '7'])
  test(
    'invalid profile employee count blocks display conditions: ' +
      employee_count,
    async () => {
      assert.equal(
        (
          await loadTaxReturnEditor(
            client({
              workspace_company_profiles: {
                ...(defaults.workspace_company_profiles as object),
                employee_count,
              },
            }).client,
            23,
          )
        ).status,
        'unavailable',
      );
    },
  );
test('normal missing company is distinguished from failure', async () => {
  assert.equal(
    (
      await loadTaxReturnEditor(
        client({ workspace_companies: null }).client,
        23,
      )
    ).status,
    'missing',
  );
});
const create: TaxReturnSaveIntent = {
  version: 1,
  companyId: 23,
  id: null,
  kind: 'save',
  payload,
};
const edit: TaxReturnSaveIntent = { ...create, id: 1 };
const remove: TaxReturnSaveIntent = {
  version: 1,
  companyId: 23,
  id: 1,
  kind: 'delete',
};
for (const intent of [create, edit, remove])
  test(
    'confirmed mutation filters and response ' + intent.kind + intent.id,
    async () => {
      const c = client();
      assert.deepEqual(
        await saveTaxReturn(c.client, intent, row.updated_at),
        row,
      );
      if (intent.id !== null) {
        assert.ok(
          c.calls.some(
            (c) => c[1] === 'eq' && c[2] === 'company_id' && c[3] === 23,
          ),
        );
        assert.ok(
          c.calls.some(
            (c) =>
              c[1] === 'eq' && c[2] === 'updated_at' && c[3] === row.updated_at,
          ),
        );
      }
    },
  );
for (const failure of [
  'error',
  'throw',
  'null',
  'wrong-company',
  'wrong-id',
  'wrong-payload',
])
  test('unconfirmed mutation returns null ' + failure, async () => {
    const response =
      failure === 'null'
        ? null
        : failure === 'wrong-company'
          ? { ...row, company_id: 24 }
          : failure === 'wrong-id'
            ? { ...row, id: 2 }
            : failure === 'wrong-payload'
              ? { ...row, corporate_tax_amount: null }
              : row;
    const c = client(
      {},
      ['error', 'throw'].includes(failure)
        ? 'workspace_tax_return_profiles'
        : undefined,
      failure === 'throw',
      response,
    );
    assert.equal(await saveTaxReturn(c.client, edit, row.updated_at), null);
  });
test('missing baseline never sends an update or delete', async () => {
  for (const intent of [edit, remove]) {
    const c = client();
    assert.equal(await saveTaxReturn(c.client, intent), null);
    assert.equal(c.calls.length, 0);
  }
});
test('lost responses reconcile only matching contents, no mutation', () => {
  assert.equal(reconcileTaxReturnIntent([row], create), 'saved');
  assert.equal(
    reconcileTaxReturnIntent([row], {
      ...create,
      payload: { ...payload, capital_at_filing: 0 },
    }),
    'different',
  );
  assert.equal(reconcileTaxReturnIntent([], create), 'different');
  assert.equal(reconcileTaxReturnIntent([], remove), 'saved');
  assert.equal(reconcileTaxReturnIntent([row], remove), 'different');
});
test('intent validation and payload round trip preserve null/zero', () => {
  assert.ok(validTaxReturnIntent(create, 23));
  assert.ok(!validTaxReturnIntent(create, 24));
  assert.ok(!validTaxReturnIntent({}, 23));
  assert.ok(
    !validTaxReturnPayload({ ...payload, fiscal_year_end_date: '2025-02-30' }),
  );
  assert.ok(validTaxReturnRow(row, 23));
  assert.deepEqual(taxReturnPayload(row), payload);
});
