import type { CookieOptions } from '@supabase/ssr';
type Cookie = { name: string; value: string };
type CookieWrite = Cookie & { options: CookieOptions };

// Stage only PKCE changes, publish before the recover request leaves the browser,
// and restore the original on a definite rejection. Never copy session writes.
export function bufferRecoveryVerifier(read: () => Cookie[], write: (cookies: CookieWrite[]) => void, verifierName: string) {
    const belongs = (name: string) => name === verifierName || (name.startsWith(verifierName + '.') && /^\d+$/.test(name.slice(verifierName.length + 1)));
    const signature = (cookies: Cookie[]) => JSON.stringify(cookies.filter(c => belongs(c.name)).sort((a, b) => a.name.localeCompare(b.name)));
    const originalCookies = read().filter(c => belongs(c.name));
    const original = signature(originalCookies);
    const jar = new Map(read().map(c => [c.name, c.value]));
    let candidate: CookieWrite[] | null = null;
    let published: string | null = null;
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
            if (published !== null) {
                if (signature(read()) !== published) throw new Error('Recovery confirmation state changed');
                return;
            }
            if (!candidate || signature(read()) !== original) throw new Error('Recovery confirmation state changed');
            // The fetch adapter calls this before the outgoing POST. A reload
            // cannot then lose the verifier of a possibly delivered email.
            try { write(candidate); } finally { published = signature(read()); }
            for (const c of candidate) {
                const actual = read().find(v => v.name === c.name)?.value;
                if (c.value && c.options.maxAge !== 0 ? actual !== c.value : !!actual) throw new Error('Recovery cookie unavailable');
            }
        },
        rollback: () => {
            if (published === null) return;
            if (signature(read()) !== published) throw new Error('Recovery confirmation state changed');
            const options = candidate?.find(c => c.value && c.options.maxAge !== 0)?.options;
            if (!options) throw new Error('Recovery cookie options unavailable');
            const restored = originalCookies.map(c => ({ ...c, options }));
            const removed = read().filter(c => belongs(c.name) && !originalCookies.some(old => old.name === c.name)).map(c => ({ name: c.name, value: '', options: { ...options, maxAge: 0 } }));
            write([...removed, ...restored]);
            if (signature(read()) !== original) throw new Error('Recovery cookie restoration unavailable');
            published = null;
        },
    };
}
