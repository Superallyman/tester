// Account changes reach the nav without signing in again: an admin turning off their own leaderboard access on
// /admin/users loses the Leaderboard link straight away
import { encode } from 'next-auth/jwt';
import { chromium } from 'playwright';
const { query, pool } = await import('../../server/db.ts');

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000', E = 'claude-e2e-selfadmin@e2e.invalid';
let failed = 0;
const check = (label: string, ok: boolean, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`); if (!ok) failed++; };

const browser = await chromium.launch({ args: ['--disable-gpu', '--no-sandbox'] });
try {
    await query('delete from app_users where email = $1', [E]);
    const [me] = await query<{ id: string }>(`insert into app_users (email, name, is_admin, can_see_leaderboard) values ($1, 'E2E SelfAdmin', true, true) returning id`, [E]);
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    await ctx.addCookies([{ name: 'next-auth.session-token', url: BASE,
        value: await encode({ token: { name: 'E2E SelfAdmin', email: E, uid: me.id, isAdmin: true, canSeeLeaderboard: true, method: 'github' }, secret: process.env.NEXTAUTH_SECRET }) }]);
    const page = await ctx.newPage();
    await page.goto(BASE + '/admin/users', { waitUntil: 'networkidle' });
    const link = page.getByRole('link', { name: 'Leaderboard', exact: true });
    check('Leaderboard link to start with', await link.isVisible());
    const box = page.getByText(E, { exact: true }).locator('xpath=ancestor::div[contains(@class, "justify-between")][1]')
        .getByRole('checkbox', { name: /Leaderboard/ });
    await box.click();
    await link.waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
    check('Turning off your own access hides it without signing in again', (await link.count()) === 0);
    // Click again only once the list has reloaded with the first change
    for (let i = 0; i < 40 && await box.isChecked(); i++) await page.waitForTimeout(250);
    await box.click();
    await link.waitFor({ timeout: 10000 }).catch(() => {});
    check('And turning it back on shows it', await link.isVisible());
    await ctx.close();
} catch (e) {
    failed++;
    console.error(e);
} finally {
    await query('delete from app_users where email = $1', [E]);
    await browser.close();
    await pool.end();
    console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
    process.exitCode = failed ? 1 : 0;
}
