// End-to-end checks for email/password auth against the :3002 dev server. Throwaway accounts only, cleaned up at the end.
import { encode } from 'next-auth/jwt';
const { authOptions } = await import('../../server/authOptions.ts');
const { query, pool } = await import('../../server/db.ts');

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
const SECRET = process.env.NEXTAUTH_SECRET!;
const GH_EMAIL = 'claude-e2e@e2e.invalid', INVITE_EMAIL = `claude-e2e2-${Date.now()}@e2e.invalid`, ADMIN_EMAIL = 'claude-e2e-admin@e2e.invalid';
let failed = 0;
const check = (label: string, ok: boolean, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`); if (!ok) failed++; };

const cleanup = async () => {
    await query(`delete from user_activity where user_email like 'claude-e2e%@e2e.invalid'`);
    await query(`delete from app_users where email like 'claude-e2e%@e2e.invalid'`);
};

// --- HTTP helpers with a tiny cookie jar
const jar = () => {
    const cookies = new Map<string, string>();
    const take = (res: Response) => res.headers.getSetCookie().forEach(c => { const [kv] = c.split(';'); const i = kv.indexOf('='); cookies.set(kv.slice(0, i), kv.slice(i + 1)); });
    const header = () => [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    const fetchJ = async (path: string, init: RequestInit = {}) => {
        const res = await fetch(BASE + path, { ...init, redirect: 'manual', headers: { ...(init.headers || {}), cookie: header() } });
        take(res);
        return res;
    };
    return { cookies, fetchJ, set: (k: string, v: string) => cookies.set(k, v) };
};
const json = async (res: Response) => res.json().catch(() => null);
const sessionFrom = async (token: object) => { const j = jar(); j.set('next-auth.session-token', await encode({ token, secret: SECRET })); return j; };

async function passwordSignIn(email: string, password: string) {
    const j = jar();
    const { csrfToken } = await json(await j.fetchJ('/api/auth/csrf'));
    const res = await j.fetchJ('/api/auth/callback/credentials', {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ csrfToken, email, password, json: 'true' }),
    });
    const location = res.headers.get('location') || (await json(res))?.url || '';
    return { j, ok: j.cookies.has('next-auth.session-token'), location };
}

// Runs the real GitHub callbacks the way NextAuth does after GitHub returns
async function githubSignIn(login: string, email: string, name: string) {
    const user = { id: login, email, name }, account = { provider: 'github', type: 'oauth', providerAccountId: '1' }, profile = { login };
    const allowed = await authOptions.callbacks!.signIn!({ user, account, profile } as never);
    if (allowed !== true) return { allowed, token: null };
    const token = await authOptions.callbacks!.jwt!({ token: { name, email }, user, account, profile, trigger: 'signIn' } as never);
    return { allowed, token };
}

try {
    await cleanup();
    const [{ id: qid }] = await query<{ id: string }>('select id from questions limit 1');

    // 1. Unknown GitHub user is refused; a session from before accounts existed is sent to sign in
    check('GitHub user with no account is refused', (await githubSignIn('claude-e2e-gh', GH_EMAIL, 'E2E Gh')).allowed === false);
    const legacy = await sessionFrom({ name: 'Superallyman', email: 'x@e2e.invalid' });
    const legacyRes = await legacy.fetchJ('/');
    check('Pre-accounts session is redirected to /signin', legacyRes.status === 307 && legacyRes.headers.get('location')!.includes('/signin?callbackUrl=%2F'), legacyRes.headers.get('location') || '');
    check('Pre-accounts session gets 401 from the API', (await legacy.fetchJ('/api/account/password')).status === 401);

    // 2. A GitHub user with history (as backfilled from user_activity) signs in with GitHub
    await query(`insert into app_users (email, name) values ($1, 'claude-e2e')`, [GH_EMAIL]);
    for (let i = 0; i < 3; i++) await query(`insert into user_activity (question_id, is_correct, user_email, submitted_answer) values ($1, $2, $3, '{A}')`, [qid, i % 2 === 0, GH_EMAIL]);
    const gh = await githubSignIn('Claude-E2E-GH', GH_EMAIL, 'E2E Gh');
    check('GitHub sign-in claims the account by email', gh.allowed === true && !!gh.token?.uid);
    const [linked] = await query<{ github_login: string; name: string }>('select github_login, name from app_users where email = $1', [GH_EMAIL]);
    check('GitHub login recorded lower-case, name taken from GitHub', linked.github_login === 'claude-e2e-gh' && linked.name === 'E2E Gh', JSON.stringify(linked));
    const ghSession = await sessionFrom(gh.token!);
    const ghHistory = await json(await ghSession.fetchJ('/api/activity/history?limit=50'));
    check('GitHub session sees its 3 attempts', Array.isArray(ghHistory) && ghHistory.length === 3, JSON.stringify(ghHistory)?.slice(0, 120));
    check('Signed-in GitHub user can open /', (await ghSession.fetchJ('/')).status === 200);
    check('Non-admin is bounced from /admin/users', (await ghSession.fetchJ('/admin/users')).status === 307);
    check('Non-admin gets 403 from the admin API', (await ghSession.fetchJ('/api/admin/users')).status === 403);
    const sameEmailOtherLogin = await githubSignIn('someone-else', GH_EMAIL, 'Impostor');
    check('A second GitHub login with the same email is refused', sameEmailOtherLogin.allowed === false);

    // 3. Migration: the GitHub user adds a password on /account, then signs in with email + password
    const info = await json(await ghSession.fetchJ('/api/account/password'));
    check('Account page shows GitHub only', info?.hasPassword === false && info?.githubLogin === 'claude-e2e-gh', JSON.stringify(info));
    const short = await ghSession.fetchJ('/api/account/password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ newPassword: 'short' }) });
    check('Too-short password rejected', short.status === 400);
    const setPw = await ghSession.fetchJ('/api/account/password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ newPassword: 'correct horse battery' }) });
    check('GitHub user sets a password without a current one', setPw.status === 200);
    const pw = await passwordSignIn(GH_EMAIL.toUpperCase(), 'correct horse battery');
    check('Email + password sign-in works (email case-insensitive)', pw.ok, pw.location);
    const pwHistory = await json(await pw.j.fetchJ('/api/activity/history?limit=50'));
    check('Password session sees the same 3 attempts', Array.isArray(pwHistory) && pwHistory.length === 3 && pwHistory.every((r: { id: string }) => ghHistory.some((g: { id: string }) => g.id === r.id)));
    const sess = await json(await pw.j.fetchJ('/api/auth/session'));
    check('Session carries uid and name, no forced change', sess?.user?.uid === gh.token!.uid && sess?.user?.name === 'E2E Gh' && !sess?.user?.mustChangePassword, JSON.stringify(sess?.user));
    check('GitHub sign-in still works after adding a password', (await githubSignIn('claude-e2e-gh', GH_EMAIL, 'E2E Gh')).allowed === true);
    const change = await pw.j.fetchJ('/api/account/password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ currentPassword: 'wrong', newPassword: 'another long password' }) });
    check('Changing an existing password needs the current one', change.status === 400);

    // 4. Admin invites someone; they sign in with the temporary password and are made to choose their own
    const [adminRow] = await query<{ id: string }>(`insert into app_users (email, name, is_admin) values ($1, 'E2E Admin', true) returning id`, [ADMIN_EMAIL]);
    const admin = await sessionFrom({ name: 'E2E Admin', email: ADMIN_EMAIL, uid: adminRow.id, isAdmin: true, method: 'github' });
    check('Admin can open /admin/users', (await admin.fetchJ('/admin/users')).status === 200);
    const list = await json(await admin.fetchJ('/api/admin/users'));
    check('Admin list includes the migrated user with both methods', list?.users?.some((u: { email: string; has_password: boolean; github_login: string; attempts: number }) => u.email === GH_EMAIL && u.has_password && u.github_login && u.attempts === 3));
    const invite = await json(await admin.fetchJ('/api/admin/users', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: ' ' + INVITE_EMAIL.toUpperCase() + ' ', name: 'E2E Invitee' }) }));
    check('Invite returns a temporary password', invite?.email === INVITE_EMAIL && /^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/.test(invite?.tempPassword), JSON.stringify(invite));
    const dup = await admin.fetchJ('/api/admin/users', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: INVITE_EMAIL }) });
    check('Inviting the same email twice is refused', dup.status === 409);
    const inv = await passwordSignIn(INVITE_EMAIL, invite.tempPassword);
    check('Invitee signs in with the temporary password', inv.ok);
    const forced = await inv.j.fetchJ('/history');
    check('Temporary password forces /account', forced.status === 307 && forced.headers.get('location')!.endsWith('/account'), forced.headers.get('location') || '');
    check('/account itself is reachable', (await inv.j.fetchJ('/account')).status === 200);
    const own = await inv.j.fetchJ('/api/account/password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ currentPassword: invite.tempPassword, newPassword: 'invitee own password' }) });
    check('Invitee replaces the temporary password', own.status === 200);
    // What useSession().update() does: POST to the session endpoint, which re-runs jwt with trigger "update"
    const { csrfToken } = await json(await inv.j.fetchJ('/api/auth/csrf'));
    await inv.j.fetchJ('/api/auth/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ csrfToken, data: {} }) });
    check('After update() the redirect is gone', (await inv.j.fetchJ('/history')).status === 200);
    check('Old temporary password no longer works', !(await passwordSignIn(INVITE_EMAIL, invite.tempPassword)).ok);

    // 5. Disable, re-enable, self-protection
    const invId = list && (await query<{ id: string }>('select id from app_users where email = $1', [INVITE_EMAIL]))[0].id;
    await admin.fetchJ(`/api/admin/users/${invId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'disable' }) });
    check('Disabled user is cut off from the API at once', (await inv.j.fetchJ('/api/account/password')).status === 403);
    check('Disabled user cannot sign in', !(await passwordSignIn(INVITE_EMAIL, 'invitee own password')).ok);
    await admin.fetchJ(`/api/admin/users/${invId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'enable' }) });
    check('Re-enabled user can sign in', (await passwordSignIn(INVITE_EMAIL, 'invitee own password')).ok);
    const self = await admin.fetchJ(`/api/admin/users/${adminRow.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'disable' }) });
    check('Admin cannot disable themselves', self.status === 400);

    // 5b. Admin and leaderboard switches reach a signed-in user without a new sign-in
    const ghId = gh.token!.uid;
    const patch = (id: string, body: object) => admin.fetchJ(`/api/admin/users/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    check('Leaderboard on by default', (await ghSession.fetchJ('/api/leaderboard')).status === 200);
    check('Admin turns leaderboard off', (await patch(ghId, { action: 'set-leaderboard', value: false })).status === 200);
    check('Leaderboard API refuses at once', (await ghSession.fetchJ('/api/leaderboard')).status === 403);
    const refreshed = await json(await ghSession.fetchJ('/api/auth/session'));
    check('Session read picks up the change', refreshed?.user?.canSeeLeaderboard === false, JSON.stringify(refreshed?.user));
    const lb = await ghSession.fetchJ('/leaderboard');
    check('Leaderboard page redirects home', lb.status === 307 && new URL(lb.headers.get('location')!).pathname === '/', lb.headers.get('location') || '');
    await patch(ghId, { action: 'set-leaderboard', value: true });
    await ghSession.fetchJ('/api/auth/session');
    check('Turned back on', (await ghSession.fetchJ('/leaderboard')).status === 200);
    check('Bad switch value refused', (await patch(ghId, { action: 'set-admin', value: 'yes' })).status === 400);
    await patch(ghId, { action: 'set-admin', value: true });
    await ghSession.fetchJ('/api/auth/session');
    check('New admin reaches /admin/users without signing in again', (await ghSession.fetchJ('/admin/users')).status === 200);
    await patch(ghId, { action: 'set-admin', value: false });
    await ghSession.fetchJ('/api/auth/session');
    check('Removed admin is bounced again', (await ghSession.fetchJ('/admin/users')).status === 307);
    check('Admin cannot remove their own admin', (await patch(adminRow.id, { action: 'set-admin', value: false })).status === 400);
    await patch(ghId, { action: 'disable' });
    await ghSession.fetchJ('/api/auth/session');
    const kicked = await ghSession.fetchJ('/');
    check('Disabled user is signed out of pages on the next session read', kicked.status === 307 && kicked.headers.get('location')!.includes('/signin'), kicked.headers.get('location') || '');

    // 6. Rate limit: 5 wrong passwords, then even the right one is refused
    for (let i = 0; i < 5; i++) await passwordSignIn(INVITE_EMAIL, 'nope nope nope');
    const limited = await passwordSignIn(INVITE_EMAIL, 'invitee own password');
    check('Locked after 5 failures', !limited.ok && decodeURIComponent(limited.location).includes('Too many attempts'), limited.location);
    check('Unknown email fails cleanly', !(await passwordSignIn('nobody-e2e@e2e.invalid', 'whatever whatever')).ok);
} finally {
    await cleanup();
    const [{ n }] = await query<{ n: number }>(`select count(*)::int as n from app_users where email like 'claude-e2e%@e2e.invalid'`);
    console.log(`cleanup: ${n} test accounts left`);
    await pool.end();
    console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
    process.exit(failed ? 1 : 0);
}
