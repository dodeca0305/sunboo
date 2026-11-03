import type { BrowserSupabaseClient } from './supabase/browser';
type Client = Pick<BrowserSupabaseClient, 'auth'>;
function definiteRejection(error: {
    status?: number;
}) { return typeof error.status === 'number' && error.status >= 400 && error.status < 500 && error.status !== 408; }
export const recoveryKey = (id: string) => `sunboo:password-recovery:${id}`;
export const recoveryPendingKey = (id: string) => `sunboo:password-recovery-pending:${id}`;
export async function requestPasswordRecovery(client: Client, email: string, origin: string): Promise<'sent' | 'rejected' | 'unknown'> {
    if (!email.trim() || !email.includes('@'))
        return 'rejected';
    try {
        const r = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: new URL('/admin/reset-password', origin).href });
        return r.error ? (definiteRejection(r.error) ? 'rejected' : 'unknown') : 'sent';
    }
    catch {
        return 'unknown';
    }
}
export async function updateRecoveredPassword(client: Client, id: string, password: string): Promise<'saved' | 'rejected' | 'unknown'> {
    if (password.length < 12)
        return 'rejected';
    try {
        const user = await client.auth.getUser();
        if (user.error || user.data.user?.id !== id)
            return 'rejected';
        const r = await client.auth.updateUser({ password });
        return r.error ? (definiteRejection(r.error) ? 'rejected' : 'unknown') : r.data.user?.id === id ? 'saved' : 'unknown';
    }
    catch {
        return 'unknown';
    }
}
