// Question difficulty from everyone's first tries: labelling rules, test accounts left out, the customizer filter,
// and the line shown after answering (never before).
import { encode } from 'next-auth/jwt';
import { chromium } from 'playwright';
const { query, pool } = await import('../../server/db.ts');
const { difficultyOf } = await import('../../utils/difficulty.ts');

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000', E = 'claude-e2e-diff@e2e.invalid';
let failed = 0;
const check = (label: string, ok: boolean, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`); if (!ok) failed++; };

check('Fewer than 3 people: no label', difficultyOf(2, 0) === null);
check('Labels at the thresholds', difficultyOf(10, 7) === 'easy' && difficultyOf(10, 4) === 'medium' && difficultyOf(10, 3) === 'hard' && difficultyOf(3, 1) === 'hard');

const browser = await chromium.launch({ args: ['--disable-gpu', '--no-sandbox'] });
try {
    await query('delete from user_activity where user_email = $1', [E]);
    await query('delete from app_users where email = $1', [E]);
    const [me] = await query<{ id: string }>(`insert into app_users (email, name) values ($1, 'E2E Difficulty') returning id`, [E]);
    const cookie = await encode({ token: { name: 'E2E Difficulty', email: E, uid: me.id, method: 'github' }, secret: process.env.NEXTAUTH_SECRET });
    const call = async (path: string, body: unknown) => (await fetch(BASE + path, {
        method: 'POST', headers: { cookie: `next-auth.session-token=${cookie}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();

    // Real questions that people have answered, and what the view says about them
    const answered = await query<{ question_id: string; people: number; first_correct: number }>(
        'select question_id, people, first_correct from question_difficulty order by people desc, question_id limit 5');
    const ids = answered.map(a => a.question_id);
    const before = await call('/api/questions/difficulty', { ids });
    check('API returns everyone\'s first tries', before.length === answered.length
        && before.every((b: { question_id: string; people: number }) => answered.find(a => a.question_id === b.question_id)?.people === b.people));

    await query(`insert into user_activity (question_id, is_correct, user_rating, satisfaction_rating, submitted_answer, user_email)
                 select unnest($1::uuid[]), false, 2, 2, '{A}', $2`, [ids, E]);
    const after = await call('/api/questions/difficulty', { ids });
    check('Test accounts never count', JSON.stringify(after) === JSON.stringify(before));

    for (const level of ['easy', 'medium', 'hard'] as const) {
        const picked: string[] = await call('/api/questions/pick', { limit: 50, difficulty: level });
        const rows = picked.length ? await query<{ people: number; first_correct: number }>('select people, first_correct from question_difficulty where question_id = any($1::uuid[])', [picked]) : [];
        check(`Filter "${level}" returns only ${level} questions (${picked.length} now)`, rows.length === picked.length && rows.every(r => difficultyOf(r.people, r.first_correct) === level));
    }
    const bad = await fetch(BASE + '/api/questions/pick', { method: 'POST', headers: { cookie: `next-auth.session-token=${cookie}`, 'content-type': 'application/json' }, body: JSON.stringify({ limit: 5, difficulty: 'brutal' }) });
    check('Unknown difficulty refused', bad.status === 400);

    // ---- Browser: History shows it; Quick Test only after submitting
    const ctx = await browser.newContext();
    await ctx.addCookies([{ name: 'next-auth.session-token', value: cookie, url: BASE }]);
    const page = await ctx.newPage();
    await page.goto(BASE + '/history', { waitUntil: 'networkidle' });
    // One line per History item, all five filled in once the stats arrive
    await page.waitForFunction(n => (document.body.innerText.match(/right on their first try/g) || []).length >= n, answered.length, { timeout: 30000 });
    const top = answered[0];
    check('History shows the first-try line', await page.locator(`text=${top.first_correct} of ${top.people} ${top.people === 1 ? 'person' : 'people'} right on their first try`).first().isVisible());

    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.locator('input[type=number]').last().fill('2');
    await page.getByText('Generate Quiz').click();
    await page.waitForSelector('h3', { timeout: 30000 });
    await page.waitForTimeout(1000);
    check('Not shown before submitting', (await page.locator('text=/right on their first try|Nobody else has answered/').count()) === 0);
    await page.keyboard.press('Control+Enter');
    await page.waitForSelector('text=Quiz Complete!', { timeout: 30000 });
    await page.waitForSelector('text=/right on their first try|Nobody else has answered/', { timeout: 15000 });
    check('Shown after submitting', (await page.locator('text=/right on their first try|Nobody else has answered/').count()) === 2);
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
