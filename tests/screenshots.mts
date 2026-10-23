// Screenshots of the new auth pages on :3002, signed in as throwaway accounts that are removed afterwards
import { encode } from 'next-auth/jwt';
import { chromium } from 'playwright';
const { query, pool } = await import('../server/db.ts');
const { hashPassword } = await import('../server/passwords.ts');

const OUT = process.env.SHOTS_DIR ?? 'tests/screenshots-out';
const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
const cleanup = () => query(`delete from app_users where email like 'claude-e2e%@e2e.invalid'`);

const browser = await chromium.launch({ args: ['--disable-gpu', '--no-sandbox'] });
try {
    await cleanup();
    const [admin] = await query<{ id: string }>(`insert into app_users (email, name, is_admin, github_login, last_login_at) values ('claude-e2e-admin@e2e.invalid', 'E2E Admin', true, 'claude-e2e-admin', now()) returning id`);
    const [gh] = await query<{ id: string }>(`insert into app_users (email, name, github_login) values ('claude-e2e@e2e.invalid', 'E2E GitHub User', 'claude-e2e-gh') returning id`);
    await query(`insert into app_users (email, name, password_hash, must_change_password) values ('claude-e2e2@e2e.invalid', 'E2E Invitee', $1, true)`, [await hashPassword('temp')]);

    const cookie = async (token: object) => ({ name: 'next-auth.session-token', value: await encode({ token, secret: process.env.NEXTAUTH_SECRET }), url: BASE });
    const shot = async (name: string, path: string, opts: { token?: object; mobile?: boolean; dark?: boolean; act?: (p: any) => Promise<void> } = {}) => {
        const ctx = await browser.newContext({ viewport: opts.mobile ? { width: 390, height: 844 } : { width: 1280, height: 860 }, colorScheme: opts.dark ? 'dark' : 'light' });
        if (opts.token) await ctx.addCookies([await cookie(opts.token)]);
        const page = await ctx.newPage();
        const errors: string[] = [];
        page.on('pageerror', (e: Error) => errors.push(e.message));
        await page.goto(BASE + path, { waitUntil: 'networkidle' });
        if (opts.act) { await page.waitForTimeout(1500); await opts.act(page); }
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
        console.log(name, page.url().replace(BASE, ''), errors.length ? 'ERRORS: ' + errors.join(' | ') : 'ok');
        await ctx.close();
    };

    const adminToken = { name: 'E2E Admin', email: 'claude-e2e-admin@e2e.invalid', uid: admin.id, isAdmin: true, method: 'github' };
    await shot('1-signin', '/signin');
    await shot('2-signin-error-mobile-dark', '/signin?error=AccessDenied', { mobile: true, dark: true });
    await shot('3-signin-wrong-password', '/signin', {
        act: async p => { await p.fill('#email', 'claude-e2e@e2e.invalid'); await p.fill('#password', 'wrong password'); await p.click('button[type=submit]'); await p.waitForSelector('text=Wrong email or password', { timeout: 15000 }); },
    });
    await shot('4-account-github-user', '/account', { token: { name: 'E2E GitHub User', email: 'claude-e2e@e2e.invalid', uid: gh.id, method: 'github' } });
    await shot('5-admin-users', '/admin/users', { token: adminToken });
    await shot('6-admin-invite-issued', '/admin/users', {
        token: adminToken,
        act: async p => { await p.fill('#new-email', 'claude-e2e3@e2e.invalid'); await p.fill('#new-name', 'E2E New Person'); await p.click('text=Invite'); await p.waitForSelector('text=Temporary password'); },
    });
    await shot('7-admin-users-mobile-dark', '/admin/users', { token: adminToken, mobile: true, dark: true });
} finally {
    await cleanup();
    await browser.close();
    await pool.end();
}
