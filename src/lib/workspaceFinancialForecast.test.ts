import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyForecastValues, type ForecastInputs, type ForecastValues } from './financialForecast.ts';
import {
  forecastIntentOwned, forecastSaveKey, readForecast, releaseForecastIntent, readForecasts, reconcileForecast, saveForecast, validForecastIntent, validForecastSnapshot, type ForecastIntent,
} from './workspaceFinancialForecast.ts';

const key = { fiscal_start: '2026-04-01', fiscal_end: '2027-03-31', scenario_name: '標準' };
const values: ForecastValues = { ...emptyForecastValues(), is_fictional: true, sales: 12000000, tax_expense: 0 };
const snap = { ...key, ...values, version: 3, updated_at: '2026-11-18T01:02:03.123456+00:00' };
const intent: ForecastIntent = { version: 1, id: '11111111-1111-4111-8111-111111111111', actorId: 'actor-a', companyId: 23, key, expected: snap, values: { ...values, sales: 13000000 } };
const row = (o: object = {}) => ({ company_id: 23, ...snap, ...o });

function chain(response: unknown, throws = false) {
  const calls: unknown[][] = [];
  const c: unknown = new Proxy({}, { get(_t, name) {
    if (name === 'then') return (res: (v: unknown) => void, rej: (e: unknown) => void) => (throws ? rej(new Error('network')) : res(response));
    return (...a: unknown[]) => { calls.push([name, ...a]); return c; };
  } });
  return { calls, client: { from: (t: string) => { calls.push(['from', t]); return c; }, rpc: (n: string, a: unknown) => { calls.push(['rpc', n, a]); return c; } } as never };
}

test('list: empty is loaded-empty only; every failure shape is unavailable, never empty', async () => {
  assert.deepEqual(await readForecasts(chain({ data: [], error: null }).client, 23), { status: 'loaded', snapshots: [] });
  const ok = await readForecasts(chain({ data: [row()], error: null }).client, 23);
  assert.equal(ok.status, 'loaded');
  for (const resp of [{ data: null, error: { code: 'XX' } }, { data: [], error: { code: 'XX' } }, { data: null, error: null }, { data: {}, error: null },
    { data: [row({ company_id: 24 })], error: null }, { data: [row({ sales: -1 })], error: null }, { data: [row({ version: 0 })], error: null },
    { data: [row(), row()], error: null }, { data: [row({ fiscal_end: '2027-02-30' })], error: null }, { data: [row({ updated_at: 'x' })], error: null }, { data: [null], error: null }]) {
    assert.deepEqual(await readForecasts(chain(resp).client, 23), { status: 'unavailable' }, JSON.stringify(resp).slice(0, 60));
  }
  assert.deepEqual(await readForecasts(chain(null, true).client, 23), { status: 'unavailable' });
  assert.deepEqual(await readForecasts(null, 23), { status: 'unavailable' });
  assert.deepEqual(await readForecasts(chain({ data: [], error: null }).client, 0), { status: 'unavailable' });
});
test('list preserves explicit zero versus null', async () => {
  const r = await readForecasts(chain({ data: [row()], error: null }).client, 23);
  assert.ok(r.status === 'loaded');
  assert.equal(r.snapshots[0].tax_expense, 0);
  assert.equal(r.snapshots[0].cogs, null);
});
test('single read distinguishes missing from failure and checks the key', async () => {
  assert.deepEqual(await readForecast(chain({ data: null, error: null }).client, 23, key), { snapshot: null });
  assert.equal(await readForecast(chain({ data: undefined, error: null }).client, 23, key), null);
  assert.equal(await readForecast(chain({ data: null, error: { code: 'x' } }).client, 23, key), null);
  assert.equal(await readForecast(chain({ data: row({ scenario_name: '別' }), error: null }).client, 23, key), null);
  assert.equal(await readForecast(chain(null, true).client, 23, key), null);
  assert.equal((await readForecast(chain({ data: row(), error: null }).client, 23, key))?.snapshot?.version, 3);
});
test('intent and browser keys isolate actor, company, period and scenario', () => {
  assert.ok(validForecastIntent(intent, 'actor-a', 23));
  assert.equal(validForecastIntent(intent, 'actor-b', 23), false);
  assert.equal(validForecastIntent(intent, 'actor-a', 24), false);
  assert.equal(validForecastIntent({ ...intent, expected: { ...snap, scenario_name: '別' } }, 'actor-a', 23), false);
  assert.equal(validForecastIntent({ ...intent, values: { ...values, sales: -1 } }, 'actor-a', 23), false);
  const keys = [forecastSaveKey('a', 23, key), forecastSaveKey('b', 23, key), forecastSaveKey('a', 24, key),
    forecastSaveKey('a', 23, { ...key, scenario_name: 'x' }), forecastSaveKey('a', 23, { ...key, fiscal_end: '2027-02-28' })];
  assert.equal(new Set(keys).size, keys.length);
});
test('save sends expected version/values and accepts only an exact acknowledgement', async () => {
  const ack = { result_status: 'saved', snapshot: row({ ...intent.values, version: 4 }) };
  const f = chain({ data: ack, error: null });
  const r = await saveForecast(f.client, intent);
  assert.equal(r.result, 'saved');
  const call = f.calls.find(c => c[0] === 'rpc')!;
  assert.equal(call[1], 'save_workspace_financial_forecast');
  const args = call[2] as Record<string, unknown>;
  assert.equal(args.p_company_id, 23);
  assert.deepEqual((args.p_expected as { version: number }).version, 3);
  assert.equal((args.p_values as ForecastInputs).sales, 13000000);
  const create = chain({ data: ack, error: null });
  await saveForecast(create.client, { ...intent, expected: null });
  assert.equal((create.calls.find(c => c[0] === 'rpc')![2] as Record<string, unknown>).p_expected, null);
});
for (const [name, resp, throws, want] of [
  ['stale version', { data: null, error: { code: '40001' } }, false, 'conflict'],
  ['denied', { data: null, error: { code: '42501' } }, false, 'denied'],
  ['validation', { data: null, error: { code: '22023' } }, false, 'unavailable'],
  ['null data', { data: null, error: null }, false, 'unavailable'],
  ['not saved status', { data: { result_status: 'noop', snapshot: row({ ...intent.values, version: 4 }) }, error: null }, false, 'unavailable'],
  ['values mismatch', { data: { result_status: 'saved', snapshot: row({ version: 4 }) }, error: null }, false, 'unavailable'],
  ['wrong company', { data: { result_status: 'saved', snapshot: row({ ...intent.values, version: 4, company_id: 24 }) }, error: null }, false, 'unavailable'],
  ['wrong scenario', { data: { result_status: 'saved', snapshot: row({ ...intent.values, version: 4, scenario_name: 'x' }) }, error: null }, false, 'unavailable'],
  ['older version', { data: { result_status: 'saved', snapshot: row({ ...intent.values, version: 2 }) }, error: null }, false, 'unavailable'],
  ['invalid snapshot', { data: { result_status: 'saved', snapshot: { ...row(), updated_at: 'x' } }, error: null }, false, 'unavailable'],
  ['partial error', { data: { result_status: 'saved', snapshot: row({ ...intent.values, version: 4 }) }, error: { code: 'XX000' } }, false, 'unavailable'],
  ['network', null, true, 'unavailable'],
] as const) test('save ' + name + ' is never reported as saved', async () => assert.equal((await saveForecast(chain(resp, throws).client, intent)).result, want));
test('reconcile: response loss, uncommitted loss, concurrent change and first-create race', () => {
  assert.equal(reconcileForecast(intent, { ...snap, ...intent.values, version: 4 }), 'saved');
  assert.equal(reconcileForecast(intent, snap), 'unchanged');
  assert.equal(reconcileForecast(intent, { ...snap, version: 4, sales: 1 }), 'conflict');
  assert.equal(reconcileForecast(intent, { ...snap, sales: 1 }), 'conflict');
  assert.equal(reconcileForecast(intent, null), 'conflict');
  const create = { ...intent, expected: null };
  assert.equal(reconcileForecast(create, null), 'unchanged');
  assert.equal(reconcileForecast(create, snap), 'conflict');
  assert.equal(reconcileForecast(create, { ...snap, ...create.values }), 'saved');
});
test('changed values need a strictly newer version; only a true no-op may keep the same version; older is rejected', async () => {
  const same = { data: { result_status: 'saved', snapshot: row({ ...intent.values, version: 3 }) }, error: null };
  assert.equal((await saveForecast(chain(same).client, intent)).result, 'unavailable', 'same-version ack for changed payload');
  assert.equal((await saveForecast(chain({ data: { result_status: 'saved', snapshot: row({ ...intent.values, version: 4 }) }, error: null }).client, intent)).result, 'saved');
  assert.equal((await saveForecast(chain({ data: { result_status: 'saved', snapshot: row({ ...intent.values, version: 9 }) }, error: null }).client, intent)).result, 'saved', 'newer concurrent identical commit');
  const noop = { ...intent, values: { ...values } };
  assert.equal((await saveForecast(chain({ data: { result_status: 'saved', snapshot: row({ version: 3 }) }, error: null }).client, noop)).result, 'saved');
  assert.equal((await saveForecast(chain({ data: { result_status: 'saved', snapshot: row({ version: 2 }) }, error: null }).client, noop)).result, 'unavailable');
  const stale = { ...snap, ...intent.values, version: 3 };
  assert.equal(reconcileForecast(intent, stale), 'conflict', 'stale same-version desired payload');
  assert.equal(reconcileForecast(intent, { ...stale, version: 2 }), 'conflict');
  assert.equal(reconcileForecast(intent, { ...stale, version: 4 }), 'saved');
  assert.equal(reconcileForecast(noop, snap), 'saved');
  assert.equal(reconcileForecast(noop, { ...snap, version: 2 }), 'conflict');
});
test('snapshot validator', () => {
  assert.ok(validForecastSnapshot(snap));
  assert.equal(validForecastSnapshot({ ...snap, version: 1.5 }), false);
});

function fakeStorage(init: Record<string, string>, opts: { removeThrows?: boolean; removeNoop?: boolean; getThrows?: boolean } = {}) {
  const m = new Map(Object.entries(init));
  return { m, getItem: (k: string) => { if (opts.getThrows) throw new Error('blocked'); return m.get(k) ?? null; },
    removeItem: (k: string) => { if (opts.removeThrows) throw new Error('blocked'); if (!opts.removeNoop) m.delete(k); } };
}
test('releasing a pending record is confirmed only for the exact owner; changed, failed and foreign records stay', () => {
  const k = forecastSaveKey('actor-a', 23, key);
  const own = fakeStorage({ [k]: JSON.stringify(intent) });
  assert.equal(forecastIntentOwned(own, 'actor-a', 23, intent), true);
  assert.equal(releaseForecastIntent(own, 'actor-a', 23, intent), 'released');
  assert.equal(own.m.size, 0);
  const other = { ...intent, id: '22222222-2222-4222-8222-222222222222' };
  const changed = fakeStorage({ [k]: JSON.stringify(other) });
  assert.equal(forecastIntentOwned(changed, 'actor-a', 23, intent), false);
  assert.equal(releaseForecastIntent(changed, 'actor-a', 23, intent), 'changed');
  assert.ok(changed.m.has(k), 'another request is never cleared');
  assert.equal(releaseForecastIntent(fakeStorage({}), 'actor-a', 23, intent), 'changed');
  const throwing = fakeStorage({ [k]: JSON.stringify(intent) }, { removeThrows: true });
  assert.equal(releaseForecastIntent(throwing, 'actor-a', 23, intent), 'failed');
  assert.ok(throwing.m.has(k));
  assert.equal(releaseForecastIntent(fakeStorage({ [k]: JSON.stringify(intent) }, { removeNoop: true }), 'actor-a', 23, intent), 'failed');
  assert.equal(releaseForecastIntent(fakeStorage({ [k]: JSON.stringify(intent) }, { getThrows: true }), 'actor-a', 23, intent), 'failed');
  assert.equal(releaseForecastIntent(fakeStorage({ [k]: 'not json' }), 'actor-a', 23, intent), 'failed');
  assert.equal(forecastIntentOwned(fakeStorage({ [forecastSaveKey('actor-b', 23, key)]: JSON.stringify(intent) }), 'actor-a', 23, intent), false);
});
