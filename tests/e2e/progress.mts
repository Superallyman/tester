// Daily goal, streaks and the study heatmap
import { encode } from 'next-auth/jwt';
import { chromium } from 'playwright';
const { query, pool } = await import('../../server/db.ts');

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000', E = 'claude-e2e-prog@e2e.invalid';
let failed = 0;
const check = (label: string, ok: boolean, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`); if (!ok) failed++; };

const browser = await chromium.launch({ args: ['--disable-gpu', '--no-sandbox'] });
try {
    await query('delete from user_activity where user_email = $1', [E]);
    await query('delete from app_users where email = $1', [E]);
    const [me] = await query<{ id: string }>(`insert into app_users (email, name) values ($1, 'E2E Progress') returning id`, [E]);
    const [q] = await query<{ id: string }>('select id from questions limit 1');
    // In the browser's zone (UTC here): 3 answers today (+1 blank skip), 5 yesterday, 2 three days ago
    const add = (daysAgo: number, n: number, answer = '{A}') => query(
        `insert into user_activity (question_id, is_correct, user_rating, satisfaction_rating, submitted_answer, user_email, attempted_at)
         select $1, g % 2 = 0, 2, 2, $2::text[], $3, date_trunc('day', now() at time zone 'UTC') at time zone 'UTC' - make_interval(days => $4) + interval '12 hours' + make_interval(mins => g)
         from generate_series(1, $5) g`, [q.id, answer, E, daysAgo, n]);
    await add(0, 3); await add(0, 1, '{}'); await add(1, 5); await add(3, 2);

    const cookie = await encode({ token: { name: 'E2E Progress', email: E, uid: me.id, method: 'github' }, secret: process.env.NEXTAUTH_SECRET });
    const call = async (path: string, method = 'GET', body?: unknown) => {
        const res = await fetch(BASE + path, { method, headers: { cookie: `next-auth.session-token=${cookie}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
        return { status: res.status, data: await res.json().catch(() => null) };
    };

    let p = (await call('/api/progress?tz=UTC')).data;
    check('Today counts answers but not blank skips', p?.todayCount === 3, JSON.stringify(p && { todayCount: p.todayCount, streak: p.streak }));
    check('Streak: today and yesterday', p?.streak === 2);
    check('Three active days in the calendar', p?.days?.length === 3);
    check('Bad goal refused', (await call('/api/progress', 'PUT', { goal: 0 })).status === 400);
    check('Set a goal', (await call('/api/progress', 'PUT', { goal: 4 })).status === 200);
    p = (await call('/api/progress?tz=UTC')).data;
    check('Goal streak counts yesterday while today is still short', p?.goal === 4 && p.goalStreak === 1, JSON.stringify({ goal: p?.goal, goalStreak: p?.goalStreak }));

    const ctx = await browser.newContext({ timezoneId: 'UTC' });
    await ctx.addCookies([{ name: 'next-auth.session-token', value: cookie, url: BASE }]);
    const page = await ctx.newPage();
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.waitForSelector('section[aria-label="Today\'s practice"]', { timeout: 30000 });
    const today = await page.locator('section[aria-label="Today\'s practice"]').innerText();
    check('Home shows progress toward the goal', today.includes('3 of 4 questions') && today.includes('2-day streak'), today.replace(/\n/g, ' | '));

    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: 'Change goal' }).click();
    await page.locator('#daily-goal').fill('3');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForSelector('text=goal met ✓', { timeout: 10000 });
    check('Changing the goal updates the card', (await page.locator('section[aria-label="Today\'s practice"]').innerText()).includes('2 goal days running'));

    await page.goto(BASE + '/data', { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Study activity', { timeout: 30000 });
    check('Analytics shows the heatmap', await page.locator('text=10 answers on 3 days in the last 26 weeks').isVisible());
    const filled = await page.locator('figure svg rect[class*="fill-[#"]').count();
    check('Three days are shaded', filled >= 3 + 4, String(filled)); // + the legend's four shaded swatches
    await ctx.close();
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
