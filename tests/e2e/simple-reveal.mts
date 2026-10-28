// Simple reveal (a per-account setting: plain marks beside answers instead of coloured answers), the show-password
// button, and the nav: no links when signed out, Leaderboard only for accounts given it
import { encode } from 'next-auth/jwt';
import { chromium } from 'playwright';
const { query, pool } = await import('../../server/db.ts');

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
const E = 'claude-e2e-reveal@e2e.invalid', E2 = 'claude-e2e-reveal2@e2e.invalid';
let failed = 0;
const check = (label: string, ok: boolean, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`); if (!ok) failed++; };
const cleanup = async () => {
    await query('delete from user_activity where user_email in ($1, $2)', [E, E2]);
    await query('delete from app_users where email in ($1, $2)', [E, E2]);
};

const browser = await chromium.launch({ args: ['--disable-gpu', '--no-sandbox'] });
try {
    await cleanup();
    const [me] = await query<{ id: string }>(`insert into app_users (email, name, can_see_leaderboard) values ($1, 'E2E Reveal', true) returning id`, [E]);
    const [other] = await query<{ id: string }>(`insert into app_users (email, name, can_see_leaderboard) values ($1, 'E2E NoBoard', false) returning id`, [E2]);
    const cookieFor = (id: string, email: string, canSeeLeaderboard: boolean) =>
        encode({ token: { name: 'E2E', email, uid: id, canSeeLeaderboard, method: 'github' }, secret: process.env.NEXTAUTH_SECRET });
    const cookie = await cookieFor(me.id, E, true);
    const call = async (method: string, body?: unknown) => {
        const res = await fetch(BASE + '/api/account/preferences', { method, headers: { cookie: `next-auth.session-token=${cookie}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
        return { status: res.status, data: await res.json().catch(() => null) };
    };

    // ---- API
    check('Off by default', (await call('GET')).data?.simpleReveal === false);
    check('Turned on', (await call('PUT', { simpleReveal: true })).data?.simpleReveal === true && (await call('GET')).data?.simpleReveal === true);
    check('Bad value refused', (await call('PUT', { simpleReveal: 'yes' })).status === 400);
    await call('PUT', { simpleReveal: false });
    check('Needs an account', (await fetch(BASE + '/api/account/preferences')).status === 401);

    // ---- Nav
    const anon = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const ap = await anon.newPage();
    await ap.goto(BASE + '/signin', { waitUntil: 'networkidle' });
    check('Signed out: no nav links', (await ap.getByRole('link', { name: /^(Quick Test|Practice Exam|Analytics|History|Leaderboard)$/ }).count()) === 0);
    // ---- Show password
    const pw = ap.locator('#password');
    await pw.fill('secret-123');
    await ap.getByRole('button', { name: 'Show password' }).click();
    check('Show password reveals it', await pw.getAttribute('type') === 'text' && await pw.inputValue() === 'secret-123');
    await ap.getByRole('button', { name: 'Hide password' }).click();
    check('And hides it again', await pw.getAttribute('type') === 'password');
    await anon.close();

    const noBoard = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    await noBoard.addCookies([{ name: 'next-auth.session-token', url: BASE, value: await cookieFor(other.id, E2, false) }]);
    const np = await noBoard.newPage();
    await np.goto(BASE + '/history', { waitUntil: 'networkidle' });
    check('Signed in: nav links shown', await np.getByRole('link', { name: 'History', exact: true }).isVisible());
    check('No Leaderboard link without access', (await np.getByRole('link', { name: 'Leaderboard' }).count()) === 0);
    await noBoard.close();

    // ---- Quick Test
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    await ctx.addCookies([{ name: 'next-auth.session-token', url: BASE, value: cookie }]);
    const page = await ctx.newPage();
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    check('Leaderboard link with access', await page.getByRole('link', { name: 'Leaderboard' }).isVisible());
    await page.evaluate(() => localStorage.setItem('quiz_mode', 'all'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    // The question limit can be emptied while typing a new number, and an empty box goes back to the last number
    const limitBox = page.locator('input[type=number]').last();
    await limitBox.fill('5');
    await limitBox.press('End'); await limitBox.press('Backspace');
    check('Question limit can be emptied', await limitBox.inputValue() === '');
    await limitBox.press('3'); await limitBox.press('Backspace');
    await page.locator('h2', { hasText: 'Test Customizer' }).click();
    check('Left empty, it goes back to the last number', await limitBox.inputValue() === '3');
    await limitBox.fill('5');
    await page.getByText('Generate Quiz').click();
    await page.waitForSelector('h3', { timeout: 30000 });
    for (let i = 0; i < 5; i++) { await page.keyboard.press('a'); await page.keyboard.press('ArrowRight'); }
    await page.keyboard.press('Control+Enter');
    await page.waitForSelector('text=Quiz Complete!', { timeout: 30000 });

    const coloured = () => page.locator('.orbit-option.is-right, .orbit-option.is-wrong, .orbit-option.is-missed').count();
    const marks = () => page.locator('.sr-only', { hasText: /^(Your answer, correct|Your answer, incorrect|Correct answer, not picked)$/ }).count();
    check('Coloured answers by default', await coloured() >= 5 && await marks() === 0);
    await page.getByRole('switch', { name: 'Simple reveal' }).click();
    await page.waitForTimeout(300);
    const nMarks = await marks();
    check('Simple reveal: plain answers with marks', await coloured() === 0 && nMarks >= 5, String(nMarks));
    // Every question has at least one correct answer, so each gets a ✓ or a –
    const rightOrMissed = await page.locator('.sr-only', { hasText: /^(Your answer, correct|Correct answer, not picked)$/ }).count();
    check('Each question marks its correct answer', rightOrMissed >= 5, String(rightOrMissed));
    let saved = false;
    for (let i = 0; i < 20 && !saved; i++) { await page.waitForTimeout(300); saved = (await call('GET')).data?.simpleReveal === true; }
    check('Switch saves to the account', saved);
    await page.screenshot({ path: 'tests/screenshots-out/simple-reveal.png', fullPage: false });
    await ctx.close();
} catch (e) {
    failed++;
    console.error(e);
} finally {
    await cleanup();
    await browser.close();
    await pool.end();
    console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
    process.exitCode = failed ? 1 : 0;
}
