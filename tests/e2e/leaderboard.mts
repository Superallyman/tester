// Leaderboard totals are computed on the server: no attempts in the response, streak days in the viewer's time
// zone, account names shown, and the page still renders.
import { encode } from 'next-auth/jwt';
import { chromium } from 'playwright';
const { query, pool } = await import('../../server/db.ts');
const { buildStats } = await import('../../app/leaderboard/stats.ts');

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000', E = 'claude-e2e-lb@e2e.invalid';
let failed = 0;
const check = (label: string, ok: boolean, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`); if (!ok) failed++; };

// Pure function: two attempts an hour apart around Toronto's midnight are one day in UTC, two days in Toronto
const row = (iso: string) => ({ question_id: 'q', is_correct: true, attempted_at: new Date(iso).toISOString(), user: 'someone', answered: true, category: 'Neuro' });
const around = [row('2026-10-20T23:30:00-04:00'), row('2026-10-21T00:30:00-04:00')];
check('Days counted in UTC', buildStats(around, 'all', 100, 'UTC')[0].activeDays === 1);
check('Days counted in Toronto', buildStats(around, 'all', 100, 'America/Toronto')[0].activeDays === 2);
check('Test accounts never show', buildStats([{ ...row('2026-10-21T12:00:00Z'), user: 'claude-e2e-x' }], 'all', 100).length === 0);

const browser = await chromium.launch({ args: ['--disable-gpu', '--no-sandbox'] });
try {
    await query('delete from app_users where email = $1', [E]);
    const [me] = await query<{ id: string }>(`insert into app_users (email, name) values ($1, 'E2E Leader') returning id`, [E]);
    const cookie = await encode({ token: { name: 'E2E Leader', email: E, uid: me.id, canSeeLeaderboard: true, method: 'github' }, secret: process.env.NEXTAUTH_SECRET });
    const get = (path: string) => fetch(BASE + path, { headers: { cookie: `next-auth.session-token=${cookie}` } });

    check('Unknown time zone refused', (await get('/api/leaderboard?tz=Mars/Olympus')).status === 400);
    const res = await get('/api/leaderboard?tz=America/Toronto');
    const body = await res.text();
    const data = JSON.parse(body);
    check('Response has totals per window', ['all', '30', '7'].every(w => Array.isArray(data.windows?.[w])));
    check('No individual attempts are sent', !('rows' in data) && !body.includes('question_id'));
    const [{ n }] = await query<{ n: number }>('select count(*)::int as n from user_activity');
    console.log(`      response ${(body.length / 1024).toFixed(1)} KB for ${n} attempts`);
    const named = await query<{ email: string; name: string }>(`select email, name from app_users where name <> split_part(email, '@', 1)`);
    const shown = data.windows.all.map((u: { key: string; name: string }) => u);
    check('Account names are used where they exist',
        named.every(a => !shown.find((u: { key: string }) => u.key === a.email.split('@')[0]) || shown.find((u: { key: string; name: string }) => u.key === a.email.split('@')[0]).name === a.name));

    const ctx = await browser.newContext();
    await ctx.addCookies([{ name: 'next-auth.session-token', value: cookie, url: BASE }]);
    const page = await ctx.newPage();
    await page.goto(BASE + '/leaderboard', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !document.body.innerText.includes('Loading the leaderboard'), null, { timeout: 30000 });
    const text = await page.locator('main, body').first().innerText();
    check('Page renders without errors', !text.includes('Could not load'), text.slice(0, 120));
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
