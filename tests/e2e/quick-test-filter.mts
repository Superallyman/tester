// Browser check of the Quick Test satisfaction filter and History's rating labels on :3000, as a throwaway account
import { encode } from 'next-auth/jwt';
import { chromium } from 'playwright';
const { query, pool } = await import('../../server/db.ts');
const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000', E = 'claude-e2e-sat@e2e.invalid';
const SHOT = process.argv[2];
let failed = 0;
const browser = await chromium.launch({ args: ['--disable-gpu', '--no-sandbox'] });
try {
    await query('delete from user_activity where user_email = $1', [E]);
    await query('delete from app_users where email = $1', [E]);
    const [{ id: uid }] = await query<{ id: string }>(`insert into app_users (email, name) values ($1, 'E2E Sat') returning id`, [E]);
    const qs = (await query<{ id: string }>('select id from questions order by id limit 4')).map(r => r.id);
    // [question, minutes ago, correct, user_rating, satisfaction]
    const rows: [number, number, boolean, number | null, number | null][] = [
        [0, 60, false, 1, 1], [0, 10, false, 1, 3],   // Q1 re-rated: latest satisfaction 3
        [1, 50, false, 2, 2],                          // Q2: 2
        [2, 40, false, 4, null],                       // Q3: confidence only, no satisfaction
        [3, 30, true, 4, 4],                           // Q4: 4, mastered
    ];
    for (const [q, ago, ok, ur, sr] of rows) {
        await query(`insert into user_activity (question_id, is_correct, user_rating, satisfaction_rating, submitted_answer, user_email, attempted_at)
                     values ($1, $2, $3, $4, '{A}', $5, now() - make_interval(mins => $6))`, [qs[q], ok, ur, sr, E, ago]);
    }
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addCookies([{ name: 'next-auth.session-token', value: await encode({ token: { name: 'E2E Sat', email: E, uid, method: 'github' }, secret: process.env.NEXTAUTH_SECRET }), url: BASE }]);
    const page = await ctx.newPage();

    const run = async (label: string, levels: number[], excludeMastered: boolean, expected: number) => {
        await page.goto(BASE + '/', { waitUntil: 'networkidle' });
        await page.waitForTimeout(1500);
        await page.locator('input[type=number]').last().fill('10');
        for (const l of levels) await page.locator(`button[aria-pressed]`, { hasText: new RegExp(`^${l}$`) }).click();
        if (excludeMastered) await page.getByText('Exclude Mastered').click();
        if (label === 'shot' && SHOT) await page.screenshot({ path: SHOT, clip: { x: 0, y: 0, width: 1280, height: 900 } });
        await page.getByText('Generate Quiz').click();
        await page.waitForFunction(() => document.querySelectorAll('h3').length > 0 || document.body.innerText.includes('No questions found'), null, { timeout: 15000 });
        const got = await page.locator('h3').count();
        const ok = got === expected;
        if (!ok) failed++;
        console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: satisfaction [${levels}]${excludeMastered ? ' + exclude mastered' : ''} -> ${got} (expected ${expected})`);
    };
    await run('latest rating wins', [3], false, 1);
    await run('older rating ignored', [1], false, 0);
    await run('multiple levels', [2, 4], false, 2);
    await run('shot', [2, 3], false, 2);
    await run('mastered excluded', [4], true, 0);
    await run('exclude mastered alone', [], true, 3);

    await page.goto(BASE + '/history', { waitUntil: 'networkidle' });
    await page.waitForSelector('text=CONFIDENCE', { timeout: 15000 });
    const text = await page.locator('body').innerText();
    const labelsOk = /\b[1-4]\/4\b/.test(text) && !text.includes('/10');
    if (!labelsOk) failed++;
    console.log(`${labelsOk ? 'PASS' : 'FAIL'}  History shows confidence as x/4`);
} catch (e) { failed++; console.error(e); } finally {
    await query('delete from user_activity where user_email = $1', [E]);
    await query('delete from app_users where email = $1', [E]);
    await browser.close(); await pool.end();
    console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
    process.exitCode = failed ? 1 : 0;
}
