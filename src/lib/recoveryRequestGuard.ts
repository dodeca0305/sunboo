import type { BrowserSupabaseClient } from './supabase/browser';
export const RECOVERY_REQUEST_KEY = 'sunboo:password-recovery-request:v1';
export const RECOVERY_REQUEST_LOCK = 'sunboo:password-recovery-request';
export type RecoveryAttempt = {
    id: string;
    outcome: 'sending' | 'sent' | 'unknown' | 'rejected' | 'rate_limited';
    attemptedAt: number;
    notBefore: number;
};
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type RecoveryRequestResult = RecoveryAttempt['outcome'] | 'blocked' | 'unavailable';
type Dependencies = {
    storage: Storage;
    exclusive: (work: () => Promise<RecoveryRequestResult>) => Promise<RecoveryRequestResult>;
    prepare: () => { client: Pick<BrowserSupabaseClient, 'auth'>; commit: () => void };
    now: () => number;
    id: () => string;
};
export function parseRecoveryAttempt(raw: string | null): RecoveryAttempt | null {
    if (raw === null) return null;
    const value = JSON.parse(raw);
    if (!value || typeof value.id !== 'string' || !value.id ||
        !['sending', 'sent', 'unknown', 'rejected', 'rate_limited'].includes(value.outcome) ||
        !Number.isSafeInteger(value.attemptedAt) || !Number.isSafeInteger(value.notBefore) ||
        value.attemptedAt < 0 || value.notBefore < value.attemptedAt) throw new Error('Recovery request record unavailable');
    return value;
}

// Web Lock serializes tabs; durable non-secret intent stops reload/crash retries.
// Time passing only permits a deliberate resend, never starts another request.
export async function requestRecoverySafely(deps: Dependencies, input: { email: string; origin: string; resend: boolean }): Promise<RecoveryRequestResult> {
    if (!input.email.trim() || !input.email.includes('@')) return 'rejected';
    try {
        return await deps.exclusive(async () => {
            const previous = parseRecoveryAttempt(deps.storage.getItem(RECOVERY_REQUEST_KEY));
            const now = deps.now();
            if (previous && (!input.resend || now < previous.notBefore)) return 'blocked';
            const attempt: RecoveryAttempt = { id: deps.id(), outcome: 'sending', attemptedAt: now, notBefore: now + 60_000 };
            const save = () => {
                const raw = JSON.stringify(attempt);
                deps.storage.setItem(RECOVERY_REQUEST_KEY, raw);
                if (deps.storage.getItem(RECOVERY_REQUEST_KEY) !== raw) throw new Error('Recovery request record not retained');
            };
            save(); // Before any SDK verifier generation or network operation.
            let prepared: ReturnType<Dependencies['prepare']>;
            try { prepared = deps.prepare(); }
            catch { attempt.outcome = 'rejected'; save(); return 'unavailable'; }
            let result: 'sent' | 'unknown' | 'rejected' | 'rate_limited' = 'unknown';
            try {
                const { error } = await prepared.client.auth.resetPasswordForEmail(input.email.trim(), { redirectTo: new URL('/admin/reset-password', input.origin).href });
                if (!error) result = 'sent';
                else if (error.status === 429) result = 'rate_limited';
                else if (typeof error.status === 'number' && error.status >= 400 && error.status < 500 && error.status !== 408) result = 'rejected';
            } catch { /* A delivery may have occurred; no automatic resend. */ }
            if (result === 'sent' || result === 'unknown') {
                try { prepared.commit(); } catch { result = 'unknown'; }
            }
            // A definite rejection leaves the original live cookies untouched.
            attempt.outcome = result;
            if (result === 'rate_limited') attempt.notBefore = now + 3_600_000;
            save();
            return result;
        });
    } catch { return 'unavailable'; }
}
export function clearRecoveryRequest(storage: Storage, expectedId: string | undefined) {
    // Browser caller must hold RECOVERY_REQUEST_LOCK for compare/remove.
    if (expectedId && parseRecoveryAttempt(storage.getItem(RECOVERY_REQUEST_KEY))?.id === expectedId) storage.removeItem(RECOVERY_REQUEST_KEY);
}
