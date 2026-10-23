// The sign-in form in a real browser: an invited user signs in with a temporary password, is made to choose their own, then gets in
import { chromium } from 'playwright';
const { query, pool } = await import('../../server/db.ts');
const { hashPassword } = await import('../../server/passwords.ts');

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000', E = 'claude-e2e-ui@e2e.invalid';
const path = (url: string) => url.replace(BASE, '');
let failed = 0;
const check = (label: string, ok: boolean, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`); if (!ok) failed++; };

const browser = await chromium.launch({ args: ['--disable-gpu', '--no-sandbox'] });
try {
    await query('delete from app_users where email = $1', [E]);
    await query(`insert into app_users (email, name, password_hash, must_change_password) values ($1, 'UI Invitee', $2, true)`, [E, await hashPassword('abcd-efgh-jkmn')]);
    const page = await (await browser.newContext()).newPage();

    await page.goto(BASE + '/history', { waitUntil: 'networkidle' });
    check('Signed out, /history goes to sign-in', path(page.url()) === '/signin?callbackUrl=%2Fhistory', path(page.url()));

    await page.waitForTimeout(1500); // let React hydrate before typing
    await page.fill('#email', E);
    await page.fill('#password', 'abcd-efgh-jkmn');
    await page.click('button[type=submit]');
    await page.waitForURL('**/account', { timeout: 20000 });
    await page.waitForSelector('text=temporary password');
    check('Temporary password lands on /account', path(page.url()) === '/account');
    check('Navbar shows the account name', (await page.locator('nav a[href="/account"]').first().textContent()) === 'UI Invitee');

    await page.fill('#current', 'abcd-efgh-jkmn');
    await page.fill('#new', 'my own password 1');
    await page.fill('#confirm', 'my own password 1');
    await page.click('button[type=submit]');
    await page.waitForURL(u => !u.pathname.startsWith('/account'), { timeout: 20000 });
    await page.goto(BASE + '/history', { waitUntil: 'networkidle' });
    check('After choosing a password, /history opens', path(page.url()) === '/history', path(page.url()));
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
