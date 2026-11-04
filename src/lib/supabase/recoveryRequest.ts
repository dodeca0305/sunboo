import { createBrowserClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr';
import { bufferRecoveryVerifier } from '../recoveryRequestCookies';

// Isolated send-only client. The existing browser client handles callbacks.
export function createRecoveryRequestClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Recovery service unavailable');
    const read = () => parseCookieHeader(document.cookie).map(c => ({ name: c.name, value: c.value ?? '' }));
    const buffer = bufferRecoveryVerifier(read, cookies => {
        for (const c of cookies) document.cookie = serializeCookieHeader(c.name, c.value, c.options);
    }, `sb-${new URL(url).hostname.split('.')[0]}-auth-token-code-verifier`);
    const client = createBrowserClient(url, key, {
        isSingleton: false, cookies: buffer.cookies,
        auth: { autoRefreshToken: false, detectSessionInUrl: false },
        global: { fetch: async (input, init) => {
            const target = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
            if (target.origin === new URL(url).origin && target.pathname === '/auth/v1/recover') buffer.commit();
            return fetch(input, init);
        } },
    });
    return { client, commit: buffer.commit, rollback: buffer.rollback };
}
