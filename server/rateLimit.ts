// In-memory failed sign-in counter per email. One server process, so a Map is enough; a restart only clears it.
// Not per IP: nothing in front of the dev server sets a trustworthy client address.

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

const globalForLimits = globalThis as unknown as { loginFailures?: Map<string, { count: number; since: number }> };
const failures = globalForLimits.loginFailures ??= new Map();

const live = (key: string) => {
    const entry = failures.get(key);
    if (entry && Date.now() - entry.since > WINDOW_MS) failures.delete(key);
    return failures.get(key);
};

export const isLimited = (key: string) => (live(key)?.count ?? 0) >= MAX_FAILURES;

export function recordFailure(key: string) {
    const entry = live(key);
    failures.set(key, { count: (entry?.count ?? 0) + 1, since: entry?.since ?? Date.now() });
}

export const clearFailures = (key: string) => failures.delete(key);
