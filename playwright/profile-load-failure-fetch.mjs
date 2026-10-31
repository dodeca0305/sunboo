// ローカルE2E専用。認証・会社確認以外は架空データを返し、DB書き込みを禁止する。
import { readFileSync, appendFileSync } from 'node:fs';
const file = process.env.PROFILE_FAILURE_CONTROL_FILE;
if (!file) throw new Error('Profile test control file required');
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.origin === process.env.NEXT_PUBLIC_SUPABASE_URL && url.pathname.startsWith('/rest/v1/')) {
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (!['GET', 'HEAD'].includes(method)) { appendFileSync(file + '.mutations', 'blocked\n'); throw new Error('DB writes forbidden'); }
    const c = JSON.parse(readFileSync(file, 'utf8'));
    const table = url.pathname.split('/').at(-1);
    const target = (table === 'workspace_company_profiles' && url.searchParams.get('company_id') === `eq.${c.companyId}`)
      || (table === 'prefectures' && url.searchParams.get('code') === 'eq.13')
      || (table === 'municipalities' && url.searchParams.get('code') === 'eq.131130');
    if (target) {
      if (table === c.failTable) return Response.json({ message: 'Injected read failure' }, { status: 400 });
      return Response.json(c.rows[table]);
    }
  }
  return originalFetch(input, init);
};
