// Quick Test from the keyboard: answer, rate, move and submit without the mouse, in both display modes
import { encode } from 'next-auth/jwt';
import { chromium } from 'playwright';
const { query, pool } = await import('../../server/db.ts');

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000', E = 'claude-e2e-keys@e2e.invalid';
let failed = 0;
const check = (label: string, ok: boolean, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`); if (!ok) failed++; };

const browser = await chromium.launch({ args: ['--disable-gpu', '--no-sandbox'] });
try {
    await query('delete from app_users where email = $1', [E]);
    await query('delete from user_activity where user_email = $1', [E]);
    const [me] = await query<{ id: string }>(`insert into app_users (email, name) values ($1, 'E2E Keys') returning id`, [E]);
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    await ctx.addCookies([{ name: 'next-auth.session-token', url: BASE,
        value: await encode({ token: { name: 'E2E Keys', email: E, uid: me.id, method: 'github' }, secret: process.env.NEXTAUTH_SECRET }) }]);
    const page = await ctx.newPage();

    const newQuiz = async (count: number, mode: 'all' | 'one') => {
        await page.goto(BASE + '/', { waitUntil: 'networkidle' });
        await page.evaluate(m => localStorage.setItem('quiz_mode', m), mode);
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForTimeout(1500);
        await page.locator('input[type=number]').last().fill(String(count));
        await page.getByText('Generate Quiz').click();
        await page.waitForSelector('h3', { timeout: 15000 });
        await page.waitForTimeout(500);
    };

    // All at once
    await newQuiz(3, 'all');
    const texts = await page.locator('h3').allTextContents();
    check('Three questions shown at once', texts.length === 3);
    for (const [letter, rating] of [['a', '2'], ['b', '3'], ['a', '1']]) {
        await page.keyboard.press(letter);
        await page.keyboard.press(rating);
        await page.keyboard.press('ArrowRight');
    }
    await page.keyboard.press('Control+Enter');
    await page.waitForSelector('text=Quiz Complete!', { timeout: 15000 });
    await page.waitForTimeout(1000);
    const rows = await query<{ user_rating: number; satisfaction_rating: number; n: number }>(
        `select user_rating, satisfaction_rating, cardinality(submitted_answer) as n from user_activity where user_email = $1 order by user_rating`, [E]);
    check('All three answers saved with the keyed ratings', rows.map(r => r.user_rating).join() === '1,2,3' && rows.every(r => r.n === 1), JSON.stringify(rows));

    // After submitting, 1-4 updates satisfaction on the outlined question
    await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); // back to the first question
    await page.keyboard.press('4');
    // Saved in the background; give a cold dev server time to compile the route
    let first: { satisfaction_rating: number } | undefined;
    for (let i = 0; i < 20 && first?.satisfaction_rating !== 4; i++) {
        await page.waitForTimeout(500);
        [first] = await query<{ satisfaction_rating: number }>(`select satisfaction_rating from user_activity where user_email = $1 and user_rating = 2`, [E]);
    }
    check('After submitting, a number key changes satisfaction', first?.satisfaction_rating === 4, JSON.stringify(first));

    // One at a time
    await newQuiz(3, 'one');
    check('One question on screen', (await page.locator('h3').count()) === 1);
    check('Progress reads 1 of 3', await page.locator('text=Question 1 of 3').isVisible());
    await page.keyboard.press('Enter');
    check('Enter moves to the next question', await page.locator('text=Question 2 of 3').isVisible());
    await page.keyboard.press('c');
    const picked = await page.locator('h3 ~ div button').nth(2).evaluate(el => getComputedStyle(el).backgroundColor);
    check('Letter key picks that option', picked === 'rgb(68, 68, 68)', picked);
    await page.keyboard.press('?');
    check('? shows the shortcuts', await page.locator('text=Ctrl + Enter').isVisible());
} catch (e) {
    failed++;
    console.error(e);
} finally {
    await query('delete from user_activity where user_email = $1', [E]);
    await query('delete from app_users where email = $1', [E]);
    await browser.close();
    await pool.end();
    console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
    process.exitCode = failed ? 1 : 0;
}
