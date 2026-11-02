import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  loadOfficeEditor,
  readOffice,
  officeTextFields,
  officeConfiguration,
  reconcileOfficeSave,
  validOfficeIntent,
  validOfficeSnapshot,
  canonical,
  type OfficeSnapshot,
} from './adminOfficeData.ts';
const snapshot: OfficeSnapshot = {
  office: {
    id: 1,
    organization_id: 1,
    name: 'office',
    official_url_status: 'unchecked',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...Object.fromEntries(officeTextFields.map((k) => [k, null])),
  },
  organization: { id: 1, name: 'org', organization_type_id: 1 },
  jurisdictions: [],
};
const defaults: Record<string, unknown> = {
  organization_offices: {
    ...snapshot.office,
    organizations: snapshot.organization,
  },
  jurisdictions: [],
  municipalities: [
    { id: 1, code: '001', name: 'city', prefectures: { name: 'pref' } },
  ],
  organization_types: [{ id: 1, code: 'test', name: 'type' }],
};
function client(
  overrides: Record<string, unknown> = {},
  failure?: string,
  throws = false,
) {
  return {
    from(table: string) {
      const b = {
        select() {
          return b;
        },
        eq() {
          return b;
        },
        order() {
          return b;
        },
        range() {
          return b;
        },
        maybeSingle() {
          return b;
        },
        then(
          resolve: (v: unknown) => unknown,
          reject: (e: unknown) => unknown,
        ) {
          return Promise.resolve()
            .then(() => {
              if (table === failure && throws) throw Error('transport');
              return {
                data: { ...defaults, ...overrides }[table],
                error: table === failure ? { message: 'failure' } : null,
              };
            })
            .then(resolve, reject);
        },
      };
      return b;
    },
  } as unknown as SupabaseClient;
}
for (const table of Object.keys(defaults))
  for (const mode of ['error', 'throw', 'null', 'malformed'])
    test(table + ' ' + mode + ' blocks', async () => {
      const c = client(
        mode === 'null'
          ? { [table]: null }
          : mode === 'malformed'
            ? { [table]: [{}] }
            : {},
        ['error', 'throw'].includes(mode) ? table : undefined,
        mode === 'throw',
      );
      const r = await loadOfficeEditor(c, 1);
      assert.equal(
        r.status,
        table === 'organization_offices' && mode === 'null'
          ? 'missing'
          : 'unavailable',
      );
    });
test('valid empty regions editable', async () => {
  assert.equal((await loadOfficeEditor(client(), 1)).status, 'loaded');
});
test('new empty options are successful reads', async () => {
  const r = await loadOfficeEditor(
    client({ municipalities: [], organization_types: [] }),
    null,
  );
  assert.equal(r.status, 'loaded');
});
test('missing configured option blocks instead of dropping it', async () => {
  assert.equal(
    (await loadOfficeEditor(client({ organization_types: [] }), 1)).status,
    'unavailable',
  );
});
test('missing joins and wrong office IDs blocked', async () => {
  assert.equal(
    (
      await readOffice(
        client({
          organization_offices: { ...snapshot.office, organizations: null },
        }),
        1,
      )
    ).status,
    'unavailable',
  );
  assert.equal(
    validOfficeSnapshot({
      ...snapshot,
      jurisdictions: [
        {
          id: 1,
          municipality_id: 1,
          organization_type_id: 1,
          organization_office_id: 2,
        },
      ],
    }),
    false,
  );
});
const intent = {
  version: 1 as const,
  id: 1,
  configuration: officeConfiguration(snapshot),
};
test('only exact entire saved contents confirm', async () => {
  assert.equal(await reconcileOfficeSave(client(), intent), 'saved');
  assert.equal(
    await reconcileOfficeSave(
      client({
        organization_offices: {
          ...snapshot.office,
          name: 'other',
          organizations: snapshot.organization,
        },
      }),
      intent,
    ),
    'different',
  );
  assert.equal(
    await reconcileOfficeSave(client({}, 'jurisdictions'), intent),
    'unavailable',
  );
  assert.equal(
    await reconcileOfficeSave(client({ organization_offices: null }), intent),
    'different',
  );
});
test('persisted intents validated', () => {
  assert.ok(validOfficeIntent(intent));
  assert.ok(!validOfficeIntent({ version: 1 }));
  assert.equal(canonical({ a: 1, b: 2 }), canonical({ b: 2, a: 1 }));
});

for (const failSecond of [false, true]) {
  test(`municipality pagination: second page ${failSecond ? 'failure blocks' : 'is included'}`, async () => {
    const base = client();
    let calls = 0;
    const paged = {
      from(table: string) {
        if (table !== 'municipalities') return base.from(table);
        const chain = {
          select() { return chain; },
          order() { return chain; },
          range(offset: number) {
            calls++;
            return Promise.resolve(offset === 0
              ? { data: Array.from({length: 1000}, (_, i) => ({id:i+1,code:String(i+1),name:'synthetic',prefectures:{name:'pref'}})), error:null }
              : failSecond ? {data:null,error:{message:'synthetic page failure'}}
              : {data:[{id:1001,code:'1001',name:'last',prefectures:{name:'pref'}}],error:null});
          },
        };
        return chain;
      },
    } as unknown as SupabaseClient;
    const result = await loadOfficeEditor(paged, null);
    assert.equal(result.status, failSecond ? 'unavailable' : 'loaded');
    if(result.status === 'loaded') assert.equal(result.municipalities.length,1001);
    assert.equal(calls,2);
  });
}
