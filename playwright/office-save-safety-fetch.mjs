// Local tests only. Existing fallback synthesizes all other DB reads and blocks writes.
import './roadmap-tax-load-failure-fetch.mjs';
import { readFileSync } from 'node:fs';
const fallback = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const u = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    ),
    method = (
      init?.method ?? (input instanceof Request ? input.method : 'GET')
    ).toUpperCase();
  if (
    u.origin === process.env.NEXT_PUBLIC_SUPABASE_URL &&
    u.pathname.startsWith('/rest/v1/') &&
    ['GET', 'HEAD'].includes(method)
  ) {
    const c = JSON.parse(
        readFileSync(process.env.ROADMAP_TAX_CONTROL_FILE, 'utf8'),
      ),
      table = u.pathname.split('/').at(-1);
    if (
      [
        'organization_offices',
        'jurisdictions',
        'municipalities',
        'organization_types',
      ].includes(table)
    ) {
      if (c.failTable === table) {
        if (c.failure === 'throw') throw Error('Synthetic exception');
        if (c.failure === 'null') return Response.json(null);
        if (c.failure === 'malformed') return Response.json([{}]);
        return Response.json({ message: 'Synthetic failure' }, { status: 400 });
      }
      let rows = c[table] ?? [];
      const key = table === 'jurisdictions' ? 'organization_office_id' : 'id',
        filter = u.searchParams.get(key);
      if (filter) rows = rows.filter((r) => String(r[key]) === filter.slice(3));
      return Response.json(rows);
    }
  }
  return fallback(input, init);
};
