// Spaced repetition: the scheduling rules, building a schedule from past history, moving it on with new answers,
// and the "Due for review" set in Smart Review.
import { encode } from 'next-auth/jwt';
import { chromium } from 'playwright';
const { query, pool } = await import('../../server/db.ts');
const { nextCard, gradeOf } = await import('../../server/schedule.ts');

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000', E = 'claude-e2e-srs@e2e.invalid';
let failed = 0;
const check = (label: string, ok: boolean, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`); if (!ok) failed++; };

// ---- Rules
const t0 = new Date('2026-10-01T12:00:00Z');
let card = nextCard(null, 'good', t0);
const intervals = [card.interval_days];
for (let i = 0; i < 3; i++) { card = nextCard(card, 'good', card.due_at); intervals.push(card.interval_days); }
check('Good answers space out: 1, 3, then growing', intervals[0] === 1 && intervals[1] === 3 && intervals[2] > 6 && intervals[3] > intervals[2] * 2, intervals.join(', '));
const lapsed = nextCard(card, 'again', card.due_at);
check('A wrong answer brings it back tomorrow and counts a lapse', lapsed.interval_days === 1 && lapsed.reps === 0 && lapsed.lapses === 1 && lapsed.ease < card.ease);
check('Easy jumps further than good, hard less', nextCard(null, 'easy', t0).interval_days === 4
    && nextCard(nextCard(null, 'hard', t0), 'hard', t0).interval_days < nextCard(nextCard(null, 'good', t0), 'good', t0).interval_days);
check('Grades from correctness and confidence', gradeOf(false, 4) === 'again' && gradeOf(true, 1) === 'hard' && gradeOf(true, 3) === 'good'
    && gradeOf(true, 4) === 'easy' && gradeOf(true, null) === 'good');

const browser = await chromium.launch({ args: ['--disable-gpu', '--no-sandbox'] });
try {
    await query('delete from user_activity where user_email = $1', [E]);
    await query('delete from app_users where email = $1', [E]);
    const [me] = await query<{ id: string }>(`insert into app_users (email, name) values ($1, 'E2E Review') returning id`, [E]);
    const qs = (await query<{ id: string }>('select id from questions order by id limit 4')).map(r => r.id);
    const add = (qid: string, ok: boolean, conf: number | null, ago: string, answer = '{A}') => query(
        `insert into user_activity (question_id, is_correct, user_rating, satisfaction_rating, submitted_answer, user_email, attempted_at)
         values ($1, $2, $3, $3, $4::text[], $5, now() - $6::interval)`, [qid, ok, conf, answer, E, ago]);
    await add(qs[0], true, 3, '10 days');   // learned once → due after 1 day → 9 days overdue
    await add(qs[1], false, 2, '2 days');   // wrong → due after 1 day → 1 day overdue
    await add(qs[2], true, 4, '1 hour');    // easy → due in 4 days
    await add(qs[3], false, null, '5 days', '{}'); // a skip: never scheduled

    const cookie = await encode({ token: { name: 'E2E Review', email: E, uid: me.id, method: 'github' }, secret: process.env.NEXTAUTH_SECRET });
    const call = async (path: string, method = 'GET', body?: unknown) => {
        const res = await fetch(BASE + path, { method, headers: { cookie: `next-auth.session-token=${cookie}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
        return { status: res.status, data: await res.json().catch(() => null) };
    };

    let r = (await call('/api/review?tz=UTC')).data;
    check('History replayed into a schedule (skips left out)', r?.scheduled === 3, JSON.stringify(r));
    check('Two due, most overdue first', r?.dueCount === 2 && r.dueIds[0] === qs[0] && r.dueIds[1] === qs[1]);
    check('The easy one is due within a week', r?.upcoming?.reduce((s: number, d: { n: number }) => s + d.n, 0) === 1);

    await call('/api/activity', 'POST', { rows: [{ question_id: qs[0], is_correct: true, user_rating: 3, satisfaction_rating: 3, submitted_answer: ['A'] }] });
    r = (await call('/api/review?tz=UTC')).data;
    const [s0] = await query<{ reps: number; interval_days: number }>('select reps, interval_days from review_schedule where user_id = $1 and question_id = $2', [me.id, qs[0]]);
    check('Answering it right pushes it out (second success: 3 days)', r?.dueCount === 1 && s0.reps === 2 && s0.interval_days === 3, JSON.stringify(s0));
    await call('/api/activity', 'POST', { rows: [{ question_id: qs[2], is_correct: false, user_rating: 4, satisfaction_rating: 4, submitted_answer: ['B'] }] });
    r = (await call('/api/review?tz=UTC')).data;
    // Wrong → due again tomorrow, so not in today's set
    const [s2] = await query<{ due: boolean }>(`select due_at between now() + interval '23 hours' and now() + interval '25 hours' as due from review_schedule where user_id = $1 and question_id = $2`, [me.id, qs[2]]);
    check('Getting one wrong brings it back tomorrow', r?.dueCount === 1 && !r.dueIds.includes(qs[2]) && s2?.due === true, JSON.stringify(r?.dueIds));
    await call('/api/activity', 'POST', { rows: [{ question_id: qs[3], is_correct: false, user_rating: null, satisfaction_rating: 2, submitted_answer: [] }] });
    const [{ n }] = await query<{ n: number }>('select count(*)::int as n from review_schedule where user_id = $1', [me.id]);
    check('A new skip still schedules nothing', n === 3);

    // ---- Browser: Smart Review offers the due set
    const ctx = await browser.newContext({ timezoneId: 'UTC' });
    await ctx.addCookies([{ name: 'next-auth.session-token', value: cookie, url: BASE }]);
    const page = await ctx.newPage();
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    const due = page.getByRole('button', { name: /Due for review/ });
    await due.waitFor({ timeout: 30000 }).catch(async e => { await page.screenshot({ path: 'tests/screenshots-out/review-fail.png', fullPage: true }); throw e; });
    check('Smart Review shows the due count', (await due.innerText()).includes('1'), (await due.innerText()).replace(/\n/g, ' | '));
    await page.waitForTimeout(800);
    await due.click();
    await page.waitForSelector('h3', { timeout: 30000 });
    check('It starts a quiz of the due questions', (await page.locator('h3').count()) === 1);
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
