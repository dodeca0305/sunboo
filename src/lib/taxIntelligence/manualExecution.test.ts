import test from 'node:test';
import assert from 'node:assert/strict';
import { executeManualTaxControl } from './manualExecution.ts';

const input = { companyId: 17, taxControlId: 2, asOfDate: '2026-10-30' };
for (const role of ['owner', 'member', 'viewer', null, 'lookup_error']) {
  test(`手動評価: ${role ?? '非メンバー'}の会社権限を保存前に検証`, async () => {
    const filters: Array<[string, unknown]> = [];
    const query = {
      select() { return this; },
      eq(key: string, value: unknown) { filters.push([key, value]); return this; },
      async maybeSingle() { return {
        data: role ? { role } : null,
        error: role === 'lookup_error' ? { message: 'failed' } : null,
      }; },
    };
    const client = { from(table: string) { assert.equal(table, 'workspace_members'); return query; } };
    let calls = 0;
    const execute = async (_client: unknown, received: typeof input) => {
      calls++;
      assert.deepEqual(received, input);
      return { controlResultId: 42, reviewCaseId: null, evaluation: {} };
    };
    const run = () => executeManualTaxControl(client as never, 'admin@example.test', input, execute as never);
    if (role === 'owner' || role === 'member') {
      assert.equal((await run()).controlResultId, 42);
      assert.equal(calls, 1);
    } else {
      await assert.rejects(run, /権限がありません/);
      assert.equal(calls, 0);
    }
    assert.deepEqual(filters, [['company_id', 17], ['email', 'admin@example.test']]);
  });
}
