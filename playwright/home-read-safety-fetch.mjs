// Local only. Synthetic authentication and business queries; no production requests.
import './roadmap-tax-load-failure-fetch.mjs';
import { readFileSync, appendFileSync } from 'node:fs';
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
    u.pathname.startsWith('/rest/v1/')
  ) {
    const c = JSON.parse(
        readFileSync(process.env.ROADMAP_TAX_CONTROL_FILE, 'utf8'),
      ),
      table = u.pathname.split('/').at(-1),
      single =
        (init?.headers instanceof Headers
          ? init.headers.get('accept')
          : init?.headers?.accept) ??
        (input instanceof Request ? input.headers.get('accept') : '');
    if (table === 'admin_users' && u.origin === 'https://synthetic-home.supabase.co') return Response.json([{email:c.user.email}]);
    if (table === 'get_shared_workspace_view' && method === 'POST') {
      appendFileSync(
        process.env.ROADMAP_TAX_CONTROL_FILE + '.shared',
        'read-only-rpc\n',
      );
      return Response.json(
        c.share ?? {
          company: c.data.workspace_companies[0],
          profile: c.data.workspace_company_profiles[0] ?? null,
          shared_sections: ['company', 'profile', 'roadmap', 'tax_returns'],
          tax_returns: c.data.workspace_tax_return_profiles ?? [],
          statuses: [],
        },
      );
    }
    if (!['GET', 'HEAD'].includes(method)) return fallback(input, init);
    if (Object.hasOwn(c.data, table)) {
      if (c.failTable === table) {
        if (c.failure === 'throw') throw Error('Synthetic read exception');
        if (c.failure === 'null') return Response.json(null);
        if (c.failure === 'malformed') return Response.json([{}]);
        return Response.json(
          { message: 'Synthetic read failure' },
          { status: 400 },
        );
      }
      let rows = c.data[table];
      // The same municipalities table is used by profile and diagnosis with different projections.
      if (String(single).includes('vnd.pgrst.object+json'))
        return Response.json(rows[0] ?? null);
      return Response.json(rows);
    }
  }
  if(u.origin === 'https://synthetic-home.supabase.co' && u.pathname === '/auth/v1/user') {
    const c=JSON.parse(readFileSync(process.env.ROADMAP_TAX_CONTROL_FILE,'utf8'));
    return Response.json(c.user);
  }
  if(u.hostname.endsWith('.supabase.co') && u.origin !== process.env.NEXT_PUBLIC_SUPABASE_URL) throw Error('Non-fixture Supabase access blocked');
  return fallback(input, init);
};
