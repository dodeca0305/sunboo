import test from 'node:test';
import assert from 'node:assert/strict';
import { issueWorkspaceShareLink, loadWorkspaceShareLinks, parseShareLinkRequest, pendingShareLinkKey, type ShareLinkRequest, type ShareLinkRow } from './workspaceShareLinks.ts';

const request: ShareLinkRequest = { company_id: 23, token: 'a'.repeat(64), created_by: 'test@example.invalid', expires_at: '2026-11-30T03:00:00Z' };
const row: ShareLinkRow = { id: 1, token: request.token, expires_at: request.expires_at, shared_sections: ['company', 'profile', 'roadmap'], revoked_at: null, last_accessed_at: null, created_at: '2026-10-31T03:00:00Z' };
function fake() {
  const state = { rows: [] as ShareLinkRow[], inserts: [] as unknown[], failure: '' };
  const filters: unknown[][] = [];
  const client = { from(table: string) {
    assert.equal(table, 'workspace_share_links');
    const eq: [string, unknown][] = [];
    let payload: Record<string, unknown> | null = null;
    const query = {
      select() { return query; },
      order() { return query; },
      eq(key: string, value: unknown) { eq.push([key, value]); filters.push([key, value]); return query; },
      insert(value: Record<string, unknown>) { payload = value; return query; },
      async maybeSingle() {
        if (state.failure === 'lookup') return { data: null, error: { message: 'lookup failed' } };
        assert.deepEqual(eq, [['company_id', 23], ['token', request.token]]);
        return { data: state.rows.find(r => r.token === request.token) ?? null, error: null };
      },
      async single() {
        state.inserts.push(payload);
        if (state.failure === 'before-commit') { state.failure = ''; throw new Error('No response'); }
        if (state.failure === 'late-commit') { state.rows.push({ ...row }); state.failure = ''; }
        if (state.rows.some(r => r.token === payload?.token)) return { data: null, error: { code: '23505' } };
        state.rows.push({ ...row });
        if (state.failure === 'after-commit') { state.failure = ''; return { data: null, error: { message: 'Response lost' } }; }
        return { data: { ...row }, error: null };
      },
      then(resolve: (value: unknown) => unknown, reject: (value: unknown) => unknown) {
        if (state.failure === 'throw') return Promise.reject(new Error('Network failed')).then(resolve, reject);
        return Promise.resolve({ data: state.failure === 'null' ? null : state.rows, error: state.failure === 'error' ? { message: 'read failed' } : null }).then(resolve, reject);
      },
    };
    return query;
  } } as unknown as Parameters<typeof loadWorkspaceShareLinks>[0];
  return { client, state, filters };
}

test('取得成功の0件とerror/null/通信例外を区別し、会社IDで絞る', async () => {
  const { client, state, filters } = fake();
  assert.deepEqual(await loadWorkspaceShareLinks(client, 23), []);
  assert.ok(filters.some(([key, value]) => key === 'company_id' && value === 23));
  for (const failure of ['error', 'null', 'throw']) {
    state.failure = failure;
    assert.equal(await loadWorkspaceShareLinks(client, 23), null);
  }
});

test('DB確定後に応答が失われても、確認・再試行は既存の同じ1件を返す', async () => {
  const { client, state } = fake();
  state.failure = 'after-commit';
  assert.equal(await issueWorkspaceShareLink(client, request), null);
  assert.deepEqual(await issueWorkspaceShareLink(client, request), row);
  assert.equal(state.rows.length, 1);
  assert.equal(state.inserts.length, 1);
});

test('確定前の通信例外は同じ識別子・期限・発行者で再試行する', async () => {
  const { client, state } = fake();
  state.failure = 'before-commit';
  assert.equal(await issueWorkspaceShareLink(client, request), null);
  assert.deepEqual(await issueWorkspaceShareLink(client, request), row);
  assert.equal(state.rows.length, 1);
  assert.deepEqual(state.inserts[0], state.inserts[1]);
  assert.deepEqual(state.inserts[1], { ...request, shared_sections: ['company', 'profile', 'roadmap'] });
});

test('先行要求の確定が照会とINSERTの間に遅れても、一意制約の後は既存行を照会する', async () => {
  const { client, state } = fake();
  state.failure = 'late-commit';
  assert.equal(await issueWorkspaceShareLink(client, request), null);
  assert.deepEqual(await issueWorkspaceShareLink(client, request), row);
  assert.equal(state.rows.length, 1);
  assert.equal(state.inserts.length, 1);
});

test('結果の照会自体に失敗したらINSERTしない', async () => {
  const { client, state } = fake();
  state.failure = 'lookup';
  assert.equal(await issueWorkspaceShareLink(client, request), null);
  assert.equal(state.inserts.length, 0);
});

test('すでに失効した同じ要求を再確認しても復活・上書きしない', async () => {
  const { client, state } = fake();
  state.rows.push({ ...row, revoked_at: '2026-10-31T04:00:00Z' });
  assert.ok((await issueWorkspaceShareLink(client, request))?.revoked_at);
  assert.equal(state.inserts.length, 0);
});

test('再読み込み用の要求を復元し、会社違い・壊れた保存値を捨てて新規発行しない', () => {
  assert.equal(parseShareLinkRequest(null, 23), null);
  assert.deepEqual(parseShareLinkRequest(JSON.stringify(request), 23), request);
  assert.notEqual(pendingShareLinkKey(23), pendingShareLinkKey(24));
  for (const raw of ['broken', 'null', JSON.stringify({ ...request, company_id: 24 }), JSON.stringify({ ...request, token: 'bad' }), JSON.stringify({ ...request, expires_at: 'bad' })]) {
    assert.throws(() => parseShareLinkRequest(raw, 23));
  }
});
