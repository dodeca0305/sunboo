// Local synthetic data only; never forward business writes or RPCs.
import { readFileSync, appendFileSync } from 'node:fs';
const fallback = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const u = new URL(
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url,
  );
  const method = (
    init?.method ?? (input instanceof Request ? input.method : 'GET')
  ).toUpperCase();
  if (
    u.origin === process.env.NEXT_PUBLIC_SUPABASE_URL &&
    u.pathname.startsWith('/rest/v1/')
  ) {
    const file = process.env.PLANNING_CONTROL_FILE,
      c = JSON.parse(readFileSync(file, 'utf8')),
      table = u.pathname.split('/').at(-1);
    if (!['GET', 'HEAD'].includes(method)) {
      appendFileSync(file + '.writes', 'blocked\n');
      throw Error('Business writes forbidden');
    }
    if (table === 'admin_users') return fallback(input, init);
    if (c.failTable === table) {
      if (c.failure === 'throw') throw Error('Synthetic read exception');
      if (c.failure === 'null') return Response.json(null);
      if (c.failure === 'malformed') return Response.json([{}]);
      return Response.json(
        { message: 'Synthetic read failure' },
        { status: 400 },
      );
    }
    let rows = c.data[table] ?? [];
    for (const [k, v] of u.searchParams) {
      if (v.startsWith('eq.'))
        rows = rows.filter((r) => String(r[k]) === v.slice(3));
      if (v.startsWith('in.(')) {
        const values = v.slice(4, -1).split(',');
        rows = rows.filter((r) => values.includes(String(r[k])));
      }
    }
    const offset = Number(u.searchParams.get('offset') ?? 0),
      limit = Number(u.searchParams.get('limit') ?? 1000);
    rows = rows.slice(offset, offset + limit);
    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    return Response.json(
      headers.get('accept')?.includes('vnd.pgrst.object+json')
        ? (rows[0] ?? null)
        : rows,
    );
  }
  return fallback(input, init);
};
