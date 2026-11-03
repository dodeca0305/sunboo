// 認証以外のDB通信は既存の合成fixtureで完結。実DBへの書き込みは遮断する。
import './roadmap-tax-load-failure-fetch.mjs';
import { readFileSync } from 'node:fs';
const file = process.env.ROADMAP_TAX_CONTROL_FILE;
const syntheticFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (url.origin === process.env.NEXT_PUBLIC_SUPABASE_URL && url.pathname.startsWith('/rest/v1/') && ['GET', 'HEAD'].includes(method)) {
    const c = JSON.parse(readFileSync(file, 'utf8'));
    const table = url.pathname.split('/').at(-1);
    if (['workspace_documents', 'workspace_required_document_statuses'].includes(table)) {
      if (table === c.failTable) {
        if (c.failure === 'throw') throw new Error('Synthetic read exception');
        if (c.failure === 'null') return Response.json(null);
        return Response.json({ message: 'Synthetic read failure' }, { status: 400 });
      }
      return Response.json(c[table]);
    }
    if (table === 'procedures') {
      const response = await syntheticFetch(input, init);
      const rows = await response.json();
      return Response.json(rows.map(row => ({ ...row, procedure_documents: [{ name: '合成必要書類', form_number: null, notes: null, is_required: true, item_type: 'document', sort_order: 0 }] })));
    }
  }
  return syntheticFetch(input, init);
};
