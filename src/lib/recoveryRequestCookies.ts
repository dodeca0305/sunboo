import type { CookieOptions } from '@supabase/ssr';
type Cookie = { name: string; value: string };
type CookieWrite = Cookie & { options: CookieOptions };

// Stage only PKCE cookies in memory. SDK cleanup after a rejected resend must
// not remove the live verifier for an earlier email. Never copy session writes.
export function bufferRecoveryVerifier(read: () => Cookie[], write: (cookies: CookieWrite[]) => void, verifierName: string) {
    const belongs = (name: string) => name === verifierName || (name.startsWith(verifierName + '.') && /^\d+$/.test(name.slice(verifierName.length + 1)));
    const signature = (cookies: Cookie[]) => JSON.stringify(cookies.filter(c => belongs(c.name)).sort((a, b) => a.name.localeCompare(b.name)));
    const original = signature(read());
    const jar = new Map(read().map(c => [c.name, c.value]));
    let candidate: CookieWrite[] | null = null;
    return {
        cookies: {
            getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
            setAll: (changes: CookieWrite[]) => {
                for (const c of changes) {
                    if (c.value && c.options.maxAge !== 0) jar.set(c.name, c.value);
                    else jar.delete(c.name);
                }
                const verifier = changes.filter(c => belongs(c.name));
                if (verifier.some(c => c.value && c.options.maxAge !== 0)) candidate = verifier;
            },
        },
        commit: () => {
            if (!candidate || signature(read()) !== original) throw new Error('Recovery confirmation state changed');
            // Retain the generated candidate on an unknown response, even if the
            // SDK subsequently removed its staged verifier in its catch path.
            write(candidate);
            for (const c of candidate) {
                const actual = read().find(v => v.name === c.name)?.value;
                if (c.value && c.options.maxAge !== 0 ? actual !== c.value : !!actual) throw new Error('Recovery cookie unavailable');
            }
        },
    };
}
