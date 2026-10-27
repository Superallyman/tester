// Challenges: the API rules, then taking one in the real exam screen and seeing the result ranked.
import { encode } from 'next-auth/jwt';
import { chromium } from 'playwright';
const { query, pool } = await import('../../server/db.ts');

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
const A = 'claude-e2e-cha@e2e.invalid', B = 'claude-e2e-chb@e2e.invalid', C = 'claude-e2e-chc@e2e.invalid';
let failed = 0;
const check = (label: string, ok: boolean, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`); if (!ok) failed++; };
const cleanup = async () => {
    await query(`delete from challenges where title like 'E2E %'`);
    await query('delete from user_activity where user_email in ($1, $2, $3)', [A, B, C]);
    await query('delete from app_users where email in ($1, $2, $3)', [A, B, C]);
};

type Q = { id: string; question_text: string; options: string[]; correct_answers: string[]; explanation: string; category: string };

const browser = await chromium.launch({ args: ['--disable-gpu', '--no-sandbox'] });
try {
    await cleanup();
    const user = async (email: string, name: string, lb: boolean) => {
        const [u] = await query<{ id: string }>(`insert into app_users (email, name, can_see_leaderboard) values ($1, $2, $3) returning id`, [email, name, lb]);
        const cookie = await encode({ token: { name, email, uid: u.id, canSeeLeaderboard: lb, method: 'github' }, secret: process.env.NEXTAUTH_SECRET });
        const call = async (path: string, method = 'GET', body?: unknown) => {
            const res = await fetch(BASE + path, { method, headers: { cookie: `next-auth.session-token=${cookie}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
            return { status: res.status, data: await res.json().catch(() => null) };
        };
        return { id: u.id, cookie, call };
    };
    const a = await user(A, 'E2E Alice', true), b = await user(B, 'E2E Bob', true), c = await user(C, 'E2E Carol', false);
    const qs = await query<Q>(`select id, question_text, options, correct_answers, coalesce(explanation, '') as explanation, category from questions order by id limit 3`);
    const ids = qs.map(q => q.id);

    check('No leaderboard access, no challenges', (await c.call('/api/challenges')).status === 403);
    check('Duplicate questions refused', (await a.call('/api/challenges', 'POST', { title: 'E2E dup', questionIds: [ids[0], ids[0]], timeLimitSec: 300 })).status === 400);
    const created = await a.call('/api/challenges', 'POST', { title: 'E2E Friday block', questionIds: ids, timeLimitSec: 300 });
    check('Create a challenge', created.status === 200 && !!created.data?.id);
    const cid = created.data.id;

    // A finished exam on the challenge's questions becomes the entry; the score comes from the saved exam
    const finishExam = async (who: typeof a, order: string[], correct: number, clientId: string) => {
        const state = { version: 1, id: clientId, config: { label: 'Challenge: E2E', count: 3, timeLimitSec: 300, saveToHistory: false, challengeId: cid },
            questionIds: order, answers: {}, flags: [], seen: [], critiques: {}, notes: '', marks: {}, current: 0, remainingSec: 300, elapsedSec: 100 + correct,
            phase: 'exam', reviewQueue: null, colorScheme: 'default', timeSpent: {} };
        const byId = new Map(qs.map(q => [q.id, q]));
        const examId = (await who.call('/api/exams', 'POST', { state, questions: order.map(i => byId.get(i)) })).data.id;
        await who.call(`/api/exams/${examId}/finish`, 'POST', { state, summary: { id: clientId, label: 'Challenge: E2E', total: 3, answered: 3, correct,
            elapsedSec: 100 + correct, finishedAt: new Date().toISOString(), byCategory: {}, questionIds: order, incorrectIds: [], flaggedIds: [], answers: {}, critiques: {}, timeSpent: {}, savedCount: 0 } });
        return examId;
    };
    const aExam = await finishExam(a, ids, 2, 'e2e-ch-a');
    check('Entry recorded', (await a.call(`/api/challenges/${cid}/entry`, 'POST', { examId: aExam })).data?.recorded === true);
    const aExam2 = await finishExam(a, ids, 3, 'e2e-ch-a2');
    check('Only the first try counts', (await a.call(`/api/challenges/${cid}/entry`, 'POST', { examId: aExam2 })).data?.recorded === false);
    const shuffled = await finishExam(b, [ids[2], ids[0], ids[1]], 3, 'e2e-ch-b1');
    check('An exam on other questions or another order is refused', (await b.call(`/api/challenges/${cid}/entry`, 'POST', { examId: shuffled })).status === 400);
    check("Can't enter someone else's exam", (await b.call(`/api/challenges/${cid}/entry`, 'POST', { examId: aExam })).status === 404);
    check("Only the creator can remove it", (await b.call(`/api/challenges/${cid}`, 'DELETE')).status === 404);

    // ---- Browser: Bob takes it from the exam page, answers through the real exam screen, and finishes
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    await ctx.addCookies([{ name: 'next-auth.session-token', value: b.cookie, url: BASE }]);
    const page = await ctx.newPage();
    await page.goto(BASE + '/exam', { waitUntil: 'networkidle' });
    const cardSel = 'article[aria-label="Challenge E2E Friday block"]';
    await page.waitForSelector(cardSel, { timeout: 30000 });
    check('Challenge listed with the first score', (await page.locator(cardSel).innerText()).includes('E2E Alice'));
    await page.locator(cardSel).getByRole('button', { name: 'Take challenge' }).click();
    await page.waitForSelector('button:has-text("1 of 3")', { timeout: 30000 });
    const [inProgress] = await query<{ state: { config: { challengeId?: string }; questionIds: string[] } }>(
        `select state from exam_attempts where user_id = $1 and status = 'in_progress'`, [b.id]);
    check('Exam has the challenge questions in order', JSON.stringify(inProgress?.state.questionIds) === JSON.stringify(ids) && inProgress.state.config.challengeId === cid);
    const right = qs.map(q => q.options.indexOf(q.correct_answers[0]));
    for (let i = 0; i < 3; i++) {
        await page.keyboard.press('ABCDEFG'[right[i]]);
        await page.locator('button[class*="navNext"]').click();
    }
    await page.getByRole('button', { name: /End Review/ }).first().click();
    await page.getByRole('button', { name: 'Yes' }).click();
    await page.waitForSelector('text=/of 3 correct/', { timeout: 30000 });
    let entry: { correct: number } | undefined;
    for (let i = 0; i < 20 && !entry; i++) {
        [entry] = await query<{ correct: number }>('select correct from challenge_entries where challenge_id = $1 and user_id = $2', [cid, b.id]);
        if (!entry) await page.waitForTimeout(500);
    }
    check('Finishing in the browser records the entry', entry?.correct === 3, JSON.stringify(entry));
    const list = (await b.call('/api/challenges')).data.find((x: { id: string }) => x.id === cid);
    check('Ranked: most correct first', list?.entries?.map((e: { name: string }) => e.name).join() === 'E2E Bob,E2E Alice', JSON.stringify(list?.entries));
    await ctx.close();

    check('Creator removes it', (await a.call(`/api/challenges/${cid}`, 'DELETE')).status === 200);
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
