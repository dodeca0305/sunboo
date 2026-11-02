// Local fault injection only: authentication is real; all business reads are synthetic.
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
    if (Object.hasOwn(c.data, table)) {
      if (c.failTable === table) {
        if (c.failure === 'throw') throw Error('Synthetic transport failure');
        if (c.failure === 'null') return Response.json(null);
        if (c.failure === 'malformed') return Response.json([{}]);
        return Response.json(
          { message: 'Synthetic read failure' },
          { status: 400 },
        );
      }
      return Response.json(c.data[table]);
    }
  }
  return fallback(input, init);
};
