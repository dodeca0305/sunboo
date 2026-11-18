import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_MUNICIPALITY_STATE,
  isMunicipalitySelectable,
  loadMunicipalities,
  loadPrefectures,
  loadSampleMunicipalities,
  municipalityReducer,
  type GeographyQuery,
  type MunicipalityState,
} from './startGeography.ts';

const ok = (data: unknown) => ({ data, error: null });
const fail = () => ({ data: null, error: { message: 'synthetic' } });

function fakeQuery(over: Partial<GeographyQuery> = {}): GeographyQuery {
  return {
    listPrefectures: async () => ok([{ code: '13', name: '合成都' }]),
    findPrefecture: async () => ok({ id: 7 }),
    listMunicipalities: async () => ok([{ code: '13001', name: '合成区' }]),
    ...over,
  };
}

test('市区町村: 取得成功は一覧、0件の成功は空、都道府県なしの成功(null)は未登録', async () => {
  assert.deepEqual(await loadMunicipalities(fakeQuery(), '13'), {
    kind: 'loaded',
    items: [{ code: '13001', name: '合成区' }],
    source: 'live',
  });
  assert.deepEqual(await loadMunicipalities(fakeQuery({ listMunicipalities: async () => ok([]) }), '13'), {
    kind: 'empty',
    source: 'live',
  });
  assert.deepEqual(await loadMunicipalities(fakeQuery({ findPrefecture: async () => ok(null) }), '13'), {
    kind: 'unregistered',
  });
});

test('市区町村: エラー・null応答・不正形式・reject・throwは未登録/空にせずerror', async () => {
  const cases: Partial<GeographyQuery>[] = [
    { findPrefecture: async () => fail() },
    { findPrefecture: async () => null },
    { findPrefecture: async () => undefined },
    { findPrefecture: async () => ({ data: null }) }, // errorキー欠落
    { findPrefecture: async () => ok({ id: 'x' }) },
    { findPrefecture: async () => ok({ id: 0 }) },
    { findPrefecture: async () => ok({ id: -5 }) },
    { findPrefecture: async () => ok({ id: 1.5 }) },
    { findPrefecture: async () => ok({ id: Number.NaN }) },
    { findPrefecture: async () => ok([{ id: 7 }]) },
    { findPrefecture: async () => Promise.reject(new Error('net')) },
    {
      findPrefecture: () => {
        throw new Error('sync');
      },
    },
    { listMunicipalities: async () => fail() },
    { listMunicipalities: async () => ok(null) },
    { listMunicipalities: async () => ok({ code: '13001' }) },
    { listMunicipalities: async () => null },
    { listMunicipalities: async () => Promise.reject(new Error('net')) },
  ];
  for (const over of cases) {
    const outcome = await loadMunicipalities(fakeQuery(over), '13');
    assert.equal(outcome.kind, 'error', JSON.stringify(Object.keys(over)));
  }
});

test('市区町村: コード重複・都道府県不一致・形式不正・名前欠落は黙って受け入れない', async () => {
  const bad: unknown[] = [
    [
      { code: '13001', name: 'A' },
      { code: '13001', name: 'B' },
    ],
    [{ code: '27100', name: '他県' }],
    [{ code: 'abc', name: 'X' }],
    [{ code: '13001', name: '  ' }],
    [{ code: 13001, name: 'X' }],
    [null],
  ];
  for (const rows of bad) {
    const outcome = await loadMunicipalities(fakeQuery({ listMunicipalities: async () => ok(rows) }), '13');
    assert.equal(outcome.kind, 'error');
  }
});

test('都道府県一覧: 成功/空/失敗/重複を区別する', async () => {
  assert.equal((await loadPrefectures(fakeQuery())).kind, 'loaded');
  assert.equal((await loadPrefectures(fakeQuery({ listPrefectures: async () => ok([]) }))).kind, 'empty');
  assert.equal((await loadPrefectures(fakeQuery({ listPrefectures: async () => fail() }))).kind, 'error');
  assert.equal((await loadPrefectures(fakeQuery({ listPrefectures: async () => ok(null) }))).kind, 'error');
  const dup = [
    { code: '13', name: 'A' },
    { code: '13', name: 'B' },
  ];
  assert.equal((await loadPrefectures(fakeQuery({ listPrefectures: async () => ok(dup) }))).kind, 'error');
});

test('サンプル地域はsourceがsampleとして区別される', () => {
  const samples = { '13': [{ code: '13113', name: '渋谷区' }] };
  assert.deepEqual(loadSampleMunicipalities(samples, '13'), {
    kind: 'loaded',
    items: [{ code: '13113', name: '渋谷区' }],
    source: 'sample',
  });
  assert.deepEqual(loadSampleMunicipalities(samples, '01'), { kind: 'empty', source: 'sample' });
});

test('reducer: 古い都道府県の応答は新しい選択を上書きしない', async () => {
  // 13 -> 27 と素早く切り替え、13 の応答が後から返る
  let resolveA!: (v: unknown) => void;
  const slowA = new Promise<unknown>((r) => (resolveA = r));
  const queryA = fakeQuery({ findPrefecture: () => slowA as Promise<unknown> });
  const queryB = fakeQuery({ listMunicipalities: async () => ok([{ code: '27100', name: '大阪' }]) });

  let state: MunicipalityState = INITIAL_MUNICIPALITY_STATE;
  state = municipalityReducer(state, { type: 'start', prefCode: '13', requestId: 1 });
  const pendingA = loadMunicipalities(queryA, '13');
  state = municipalityReducer(state, { type: 'start', prefCode: '27', requestId: 2 });
  const outcomeB = await loadMunicipalities(queryB, '27');
  state = municipalityReducer(state, { type: 'finish', prefCode: '27', requestId: 2, outcome: outcomeB });
  assert.equal(state.status, 'loaded');

  resolveA(ok({ id: 7 }));
  const outcomeA = await pendingA;
  const after = municipalityReducer(state, { type: 'finish', prefCode: '13', requestId: 1, outcome: outcomeA });
  assert.equal(after, state);
  assert.equal(after.status === 'loaded' && after.prefCode, '27');

  // 同じ都道府県への再試行でも古い requestId は無効
  const retry = municipalityReducer(after, { type: 'start', prefCode: '27', requestId: 3 });
  const stale = municipalityReducer(retry, { type: 'finish', prefCode: '27', requestId: 2, outcome: outcomeB });
  assert.equal(stale.status, 'loading');
});

test('reducer: 失敗から再試行で回復でき、読み込み状態は失敗でも解除される', async () => {
  let state: MunicipalityState = municipalityReducer(INITIAL_MUNICIPALITY_STATE, {
    type: 'start',
    prefCode: '13',
    requestId: 1,
  });
  const failed = await loadMunicipalities(fakeQuery({ listMunicipalities: async () => fail() }), '13');
  state = municipalityReducer(state, { type: 'finish', prefCode: '13', requestId: 1, outcome: failed });
  assert.equal(state.status, 'error'); // 未対応/空にならない
  state = municipalityReducer(state, { type: 'start', prefCode: '13', requestId: 2 });
  assert.equal(state.status, 'loading');
  state = municipalityReducer(state, {
    type: 'finish',
    prefCode: '13',
    requestId: 2,
    outcome: await loadMunicipalities(fakeQuery(), '13'),
  });
  assert.equal(state.status, 'loaded');
  assert.equal(municipalityReducer(state, { type: 'reset' }).status, 'idle');
});

test('送信可否: 現在の都道府県の読み込み済み一覧に含まれる選択だけ許可', () => {
  const loaded: MunicipalityState = {
    status: 'loaded',
    prefCode: '13',
    requestId: 1,
    items: [{ code: '13001', name: 'A' }],
    source: 'live',
  };
  assert.equal(isMunicipalitySelectable(loaded, '13', '13001'), true);
  assert.equal(isMunicipalitySelectable(loaded, '13', ''), false);
  assert.equal(isMunicipalitySelectable(loaded, '13', '27100'), false); // 旧選択
  assert.equal(isMunicipalitySelectable(loaded, '27', '13001'), false); // 都道府県切替後
  for (const status of ['idle', 'loading', 'error', 'empty', 'unregistered'] as const) {
    const state = { status, prefCode: '13', requestId: 1, source: 'live', reason: 'x' } as MunicipalityState;
    assert.equal(isMunicipalitySelectable(state, '13', '13001'), false, status);
  }
});
