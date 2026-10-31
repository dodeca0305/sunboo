// ローカルE2Eサーバー専用。アプリからimportせず、node --importで明示指定する。
import { appendFileSync, readFileSync } from 'node:fs';
const controlFile = process.env.GROWTH_FAILURE_CONTROL_FILE;
if (!controlFile) throw new Error('Growth E2E control file is required');
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.origin === process.env.NEXT_PUBLIC_SUPABASE_URL && url.pathname.startsWith('/rest/v1/')) {
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      appendFileSync(controlFile + '.mutations', 'blocked\n');
      throw new Error('DB writes are forbidden in this browser test');
    }
    const control = JSON.parse(readFileSync(controlFile, 'utf8'));
    if (url.searchParams.get('company_id') === `eq.${control.companyId}`) {
      const table = url.pathname.split('/').at(-1);
      if (table in control.rows) {
        if (table === control.failTable) return Response.json({ message: 'Injected E2E read failure' }, { status: 400 });
        return Response.json(control.rows[table]);
      }
    }
  }
  return originalFetch(input, init);
};
