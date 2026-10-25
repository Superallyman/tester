// Analytics: per-area accuracy, exam-weighted readiness (recent answers preferred), weekly counts, skips left out,
// and the reworked page.
import { encode } from 'next-auth/jwt';
import { chromium } from 'playwright';
const { query, pool } = await import('../../server/db.ts');
const { BLUEPRINT, blueprintKey } = await import('../../app/exam/blueprint.ts');

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000', E = 'claude-e2e-ana@e2e.invalid';
let failed = 0;
const check = (label: string, ok: boolean, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`); if (!ok) failed++; };

const browser = await chromium.launch({ args: ['--disable-gpu', '--no-sandbox'] });
try {
    await query('delete from user_activity where user_email = $1', [E]);
    await query('delete from app_users where email = $1', [E]);
    const [me] = await query<{ id: string }>(`insert into app_users (email, name) values ($1, 'E2E Analytics') returning id`, [E]);

    // Two areas, picked from the bank by how the app maps categories
    const qs = await query<{ id: string; category: string }>('select id, category from questions');
    const inArea = (key: string) => qs.filter(q => blueprintKey(q.category.trim().replace(/\s+/g, ' ')) === key).map(q => q.id);
    const [kA, kB] = ['glaucoma', 'ametropia'];
    const A = inArea(kA), B = inArea(kB);
    const wA = BLUEPRINT.find(r => r.key === kA)!.weight, wB = BLUEPRINT.find(r => r.key === kB)!.weight;
    const add = (ids: string[], n: number, nCorrect: number, ago: string, answer = '{A}') => query(
        `insert into user_activity (question_id, is_correct, user_rating, satisfaction_rating, submitted_answer, user_email, attempted_at)
         select ($1::uuid[])[1 + (g % cardinality($1::uuid[]))], g <= $2, 2, 2, $3::text[], $4, now() - $5::interval - make_interval(mins => g)
         from generate_series(1, $6) g`, [ids, nCorrect, answer, E, ago, n]);
    await add(A, 10, 8, '2 days');      // area A: 80% recently
    await add(B, 10, 5, '3 days');      // area B: 50% recently…
    await add(B, 10, 10, '100 days');   // …but 100% long ago, which readiness should ignore (enough recent answers)
    await add(A, 5, 0, '1 day', '{}');  // skips: never counted

    const cookie = await encode({ token: { name: 'E2E Analytics', email: E, uid: me.id, method: 'github' }, secret: process.env.NEXTAUTH_SECRET });
    const data = await (await fetch(BASE + '/api/analytics?tz=UTC', { headers: { cookie: `next-auth.session-token=${cookie}` } })).json();
    const a = data.areas.find((x: { key: string }) => x.key === kA), b = data.areas.find((x: { key: string }) => x.key === kB);
    check('Per-area totals leave skips out', a.answered === 10 && a.correct === 8 && b.answered === 20 && b.correct === 15, JSON.stringify({ a, b }));
    check('Recent answers tracked separately', b.recentAnswered === 10 && b.recentCorrect === 5);
    const expected = ((wA * 0.8 + wB * 0.5) / (wA + wB)) * 100;
    check('Readiness weights recent accuracy by exam share', Math.abs(data.readiness.pct - expected) < 0.01 && data.readiness.coveredWeight === wA + wB,
        `${data.readiness.pct?.toFixed(2)} vs ${expected.toFixed(2)}`);
    const weekTotal = data.weeks.reduce((s: number, w: { answered: number }) => s + w.answered, 0);
    check('Weekly counts include everything in the last 26 weeks, minus skips', weekTotal === 30, String(weekTotal));
    check('Every blueprint area is listed', BLUEPRINT.every(r => data.areas.some((x: { key: string }) => x.key === r.key)));
    check('Unknown time zone refused', (await fetch(BASE + '/api/analytics?tz=Nowhere/Place', { headers: { cookie: `next-auth.session-token=${cookie}` } })).status === 400);

    const ctx = await browser.newContext({ timezoneId: 'UTC' });
    await ctx.addCookies([{ name: 'next-auth.session-token', value: cookie, url: BASE }]);
    const page = await ctx.newPage();
    await page.goto(BASE + '/data', { waitUntil: 'networkidle' });
    await page.waitForSelector('#readiness-title', { timeout: 60000 });
    const ready = await page.locator('section[aria-labelledby=readiness-title]').innerText();
    check('Page shows the readiness number', ready.includes(`${expected.toFixed(0)}%`), ready.split('\n').slice(0, 2).join(' | '));
    check('Area and trend sections render', await page.locator('#areas-title').isVisible() && await page.locator('#trend-title').isVisible());
    check('Overall totals leave skips out', (await page.locator('text=Total Practice Volume').locator('..').innerText()).includes('30'));
    check('Old 7-day bars are gone', (await page.locator('text=7-Day Accuracy Trend').count()) === 0);
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
