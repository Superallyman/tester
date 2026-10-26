// Quick Test page: the Today card and Smart Review show same-size skeletons while loading, so the test
// customizer below them doesn't jump when the data arrives (desktop and phone widths). And the logo +
// wordmark, visible on phones too, always lands on a fresh Quick Test.
import { encode } from 'next-auth/jwt';
import { chromium } from 'playwright';
const { query, pool } = await import('../../server/db.ts');

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000', E = 'claude-e2e-layout@e2e.invalid';
let failed = 0;
const check = (label: string, ok: boolean, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`); if (!ok) failed++; };

const browser = await chromium.launch({ args: ['--disable-gpu', '--no-sandbox'] });
try {
    await query('delete from user_activity where user_email = $1', [E]);
    await query('delete from app_users where email = $1', [E]);
    const [me] = await query<{ id: string }>(`insert into app_users (email, name, daily_goal) values ($1, 'E2E Layout', 20) returning id`, [E]);
    // Enough history that every Smart Review card has something in it
    await query(`insert into user_activity (question_id, is_correct, user_rating, satisfaction_rating, submitted_answer, user_email, attempted_at)
        select q.id, g % 3 = 0, 1 + (g % 4), 1 + (g % 4), '{A}', $1, now() - make_interval(days => g % 30)
        from generate_series(1, 60) g cross join lateral (select id from questions order by md5(id::text || g) limit 1) q`, [E]);
    const cookie = await encode({ token: { name: 'E2E Layout', email: E, uid: me.id, method: 'github' }, secret: process.env.NEXTAUTH_SECRET });

    for (const [label, width] of [['desktop', 1200], ['phone', 390]] as const) {
        const ctx = await browser.newContext({ viewport: { width, height: 1000 } });
        await ctx.addCookies([{ name: 'next-auth.session-token', value: cookie, url: BASE }]);
        const page = await ctx.newPage();
        // Warm up (the dev server compiles on first visit), then measure with the data held back
        await page.goto(BASE + '/', { waitUntil: 'networkidle' });
        await page.route(/\/api\/(progress|review|activity|notes)/, async r => { await new Promise(res => setTimeout(res, 2000)); await r.continue(); });
        await page.reload({ waitUntil: 'domcontentloaded' });
        const heading = page.locator('h2', { hasText: 'Test Customizer' });
        await heading.waitFor({ timeout: 30000 });
        await page.waitForTimeout(500);
        const before = (await heading.boundingBox())!.y;
        const skeletons = await page.locator('section[aria-hidden="true"] .orbit-skeleton').count();
        await page.locator('section[aria-label="Today\'s practice"]').waitFor({ timeout: 30000 });
        await page.getByRole('button', { name: /Due for review/ }).waitFor({ timeout: 30000 });
        await page.waitForTimeout(500);
        const after = (await heading.boundingBox())!.y;
        check(`${label}: skeletons shown while loading`, skeletons > 5, String(skeletons));
        check(`${label}: customizer stays put when data arrives`, Math.abs(after - before) <= 2, `${before.toFixed(0)} → ${after.toFixed(0)}`);
        await page.unroute(/\/api\//);

        const logo = page.getByRole('link', { name: /start a new Quick Test/ });
        check(`${label}: logo and wordmark visible`, await logo.isVisible() && (await logo.innerText()).trim().toUpperCase() === 'TESTER');
        if (label === 'phone') {
            // Mid-quiz on / : the logo brings back a fresh customizer
            await page.waitForTimeout(800);
            await page.getByText('Generate Quiz').click();
            await page.waitForSelector('h3', { timeout: 30000 });
            await logo.click();
            await heading.waitFor({ timeout: 30000 });
            check('phone: logo resets a quiz in progress', (await page.locator('h3').count()) === 0);
            // From another page it goes to Quick Test
            await page.goto(BASE + '/history', { waitUntil: 'networkidle' });
            await page.getByRole('link', { name: /start a new Quick Test/ }).click();
            await heading.waitFor({ timeout: 30000 });
            check('phone: logo goes to Quick Test from another page', new URL(page.url()).pathname === '/');
        }
        await ctx.close();
    }
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
