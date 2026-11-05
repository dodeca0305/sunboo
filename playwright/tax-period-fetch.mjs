// Isolated synthetic auth and business fixtures; never fall through to Supabase.
import { readFileSync } from 'node:fs';
const original = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const u = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (u.origin === 'https://synthetic-period.supabase.co') {
    const f = JSON.parse(readFileSync(process.env.TAX_PERIOD_FIXTURE, 'utf8'));
    if (u.pathname === '/auth/v1/user') return Response.json(f.user);
    const table = u.pathname.split('/').at(-1);
    if (table === 'admin_users') return Response.json([{ email: f.user.email }]);
    if (u.pathname.startsWith('/rest/v1/') && Object.hasOwn(f.data, table)) {
      if (f.failTable === table) {
        if (f.failure === 'throw') throw Error('Synthetic read exception');
        if (f.failure === 'null') return Response.json(null);
        if (f.failure === 'malformed') return Response.json([{}]);
        return Response.json({message:'Synthetic read failure'}, {status:500});
      }
      const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      if (!['GET', 'HEAD'].includes(method)) throw Error('Server-side writes forbidden');
      return Response.json(f.data[table]);
    }
    throw Error('Unsupported synthetic tax-period request');
  }
  if (u.hostname.endsWith('.supabase.co')) throw Error('Non-fixture Supabase access blocked');
  return original(input, init);
};
