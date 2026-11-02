import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWorkspaceDocumentsForEditing } from './workspaceDocumentData.ts';

const existing = {
  workspace_documents: { data: [
    { document_type: 'articles_of_incorporation', status: 'registered' },
    { document_type: 'corporate_tax_return', status: 'needs_update' },
  ], error: null },
  workspace_required_document_statuses: { data: [
    { document_name: '合成必要書類', status: 'ready' },
    { document_name: '準備中の書類', status: 'in_progress' },
  ], error: null },
};
type Response = { data?: unknown; error?: unknown };
function fake(overrides: Record<string, Response | Error> = {}) {
  const calls: unknown[][] = [];
  const client = { from(table: keyof typeof existing) {
    calls.push(['from', table]);
    return { select(columns: string) {
      calls.push(['select', table, columns]);
      return { async eq(column: string, value: number) {
        calls.push(['eq', table, column, value]);
        const response = overrides[table] ?? existing[table];
        if (response instanceof Error) throw response;
        return response;
      } };
    } };
  } } as unknown as Parameters<typeof loadWorkspaceDocumentsForEditing>[0];
  return { client, calls };
}

test('登録済み・要更新・準備済み・準備中を保持し、両取得を対象会社で絞り込む', async () => {
  const { client, calls } = fake();
  assert.deepEqual(await loadWorkspaceDocumentsForEditing(client, 23), {
    statusMap: { articles_of_incorporation: 'registered', corporate_tax_return: 'needs_update' },
    requiredDocumentStatusMap: { 合成必要書類: 'ready', 準備中の書類: 'in_progress' },
  });
  for (const table of Object.keys(existing)) {
    assert.ok(calls.some(c => JSON.stringify(c) === JSON.stringify(['eq', table, 'company_id', 23])));
  }
  assert.equal(calls.filter(c => c[0] === 'from').length, 2);
});

test('正常な0行だけは未登録として入力できる', async () => {
  assert.deepEqual(await loadWorkspaceDocumentsForEditing(fake({
    workspace_documents: { data: [], error: null },
    workspace_required_document_statuses: { data: [], error: null },
  }).client, 23), { statusMap: {}, requiredDocumentStatusMap: {} });
});

for (const table of Object.keys(existing)) {
  for (const [name, response] of Object.entries({
    error: { data: null, error: { message: 'failed' } },
    partialError: { ...existing[table as keyof typeof existing], error: { message: 'failed' } },
    null: { data: null, error: null },
    undefined: { error: null },
    object: { data: {}, error: null },
    throw: new Error('network error'),
  })) test(`${table}: ${name}では部分的な編集も許可しない`, async () => {
    assert.equal(await loadWorkspaceDocumentsForEditing(fake({ [table]: response }).client, 23), null);
  });
}

for (const [table, rows] of [
  ['workspace_documents', [null, {}, { document_type: 'unknown', status: 'registered' },
    { document_type: 'articles_of_incorporation', status: null }, { document_type: 'articles_of_incorporation', status: 'unknown' }]],
  ['workspace_required_document_statuses', [null, {}, { document_name: null, status: 'ready' },
    { document_name: ' ', status: 'ready' }, { document_name: '合成書類', status: 'unknown' }]],
] as const) {
  rows.forEach((row, index) => test(`${table}: 不正行${index + 1}を未登録に変換しない`, async () => {
    assert.equal(await loadWorkspaceDocumentsForEditing(fake({ [table]: { data: [...existing[table].data, row], error: null } }).client, 23), null);
  }));
}

test('片方だけ正常未登録の場合も、もう片方の登録状態を維持する', async () => {
  const result = await loadWorkspaceDocumentsForEditing(fake({ workspace_documents: { data: [], error: null } }).client, 23);
  assert.deepEqual(result?.statusMap, {});
  assert.deepEqual(result?.requiredDocumentStatusMap, { 合成必要書類: 'ready', 準備中の書類: 'in_progress' });
});
