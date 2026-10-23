// Quick Test from the keyboard: answer, rate, move and submit without the mouse, in both display modes;
// single-answer questions act like radio buttons and multi-answer ones like checkboxes
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
    await query(`delete from questions where category = 'E2E Test'`);
    await query(`insert into questions (category, question_text, options, correct_answers, explanation) values
        ('E2E Test', 'E2E single: which lens corrects myopia?', '{Plus,Minus,Prism}', '{Minus}', 'x'),
        ('E2E Test', 'E2E multi: which two are refractive errors?', '{Myopia,Hyperopia,Glaucoma,Cataract}', '{Myopia,Hyperopia}', 'x')`);
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
    await page.keyboard.press('?');
    await page.keyboard.press('j');
    check('J goes back', await page.locator('text=Question 1 of 3').isVisible());
    await page.keyboard.press('k');
    check('K goes forward', await page.locator('text=Question 2 of 3').isVisible());

    // Radio vs checkbox, on the two throwaway questions only (picked through the category filter)
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.setItem('quiz_mode', 'all'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.getByText('Filter by Category').click();
    await page.getByRole('button', { name: 'E2E Test' }).click();
    await page.locator('input[type=number]').last().fill('10');
    await page.getByText('Generate Quiz').click();
    await page.waitForSelector('h3', { timeout: 15000 });
    await page.waitForTimeout(500);
    const card = (text: string) => page.locator('div', { has: page.locator('h3', { hasText: text }) }).last();
    const single = card('E2E single'), multi = card('E2E multi');
    await single.getByRole('radio', { name: /Plus/ }).click();
    await single.getByRole('radio', { name: /Minus/ }).click();
    const singleChecked = await single.locator('[aria-checked=true]').allTextContents();
    check('Single answer: picking another replaces the first', singleChecked.length === 1 && singleChecked[0].includes('Minus'), JSON.stringify(singleChecked));
    check('Single answer shows no "Select" hint', !(await single.locator('text=/^Select \\d/').count()));
    await multi.getByRole('checkbox', { name: /Myopia/ }).click();
    await multi.getByRole('checkbox', { name: /Hyperopia/ }).click();
    check('Multi answer: both stay picked', (await multi.locator('[aria-checked=true]').count()) === 2);
    check('Multi answer says how many to pick', (await multi.textContent())?.includes('Select 2 · 2 chosen') ?? false);
} catch (e) {
    failed++;
    console.error(e);
} finally {
    await query('delete from user_activity where user_email = $1', [E]);
    await query(`delete from questions where category = 'E2E Test'`);
    await query('delete from app_users where email = $1', [E]);
    await browser.close();
    await pool.end();
    console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
    process.exitCode = failed ? 1 : 0;
}
