// Practice exams saved on the server: the API (create, save, stale-save guard, finish, import, ownership)
// and the browser (resume an exam started on another device, background saving, importing local history, review).
import { encode } from 'next-auth/jwt';
import { chromium } from 'playwright';
const { query, pool } = await import('../../server/db.ts');

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
const E = 'claude-e2e-exam@e2e.invalid', OTHER = 'claude-e2e-exam2@e2e.invalid';
let failed = 0;
const check = (label: string, ok: boolean, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`); if (!ok) failed++; };

const cleanup = () => query(`delete from app_users where email in ($1, $2)`, [E, OTHER]); // exams cascade
const cookieFor = async (uid: string, email: string) =>
    'next-auth.session-token=' + await encode({ token: { name: 'E2E Exam', email, uid, method: 'github' }, secret: process.env.NEXTAUTH_SECRET });
const call = async (cookie: string, path: string, method = 'GET', body?: unknown) => {
    const res = await fetch(BASE + path, { method, headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json().catch(() => null) };
};

type Q = { id: string; question_text: string; options: string[]; correct_answers: string[]; explanation: string; category: string };
const examState = (id: string, qs: Q[], extra: object = {}) => ({
    version: 1, id, startedAt: new Date().toISOString(), config: { label: 'E2E Block', count: qs.length, timeLimitSec: 600, saveToHistory: false },
    questionIds: qs.map(q => q.id), answers: {}, flags: [], seen: [qs[0].id], critiques: {}, notes: '', marks: {}, current: 0,
    remainingSec: 600, elapsedSec: 0, phase: 'exam', reviewQueue: null, colorScheme: 'default', timeSpent: {},
    savedAt: new Date().toISOString(), ...extra,
});
const summaryOf = (id: string, qs: Q[], correct: number, finishedAt = new Date().toISOString()) => ({
    id, finishedAt, label: 'E2E Block', total: qs.length, answered: qs.length, correct, elapsedSec: 300, timeLimitSec: 600,
    byCategory: { [qs[0].category]: { correct, total: qs.length } }, questionIds: qs.map(q => q.id), incorrectIds: [], flaggedIds: [],
    answers: {}, critiques: {}, timeSpent: {}, savedCount: 0,
});

const browser = await chromium.launch({ args: ['--disable-gpu', '--no-sandbox'] });
try {
    await cleanup();
    const [me] = await query<{ id: string }>(`insert into app_users (email, name) values ($1, 'E2E Exam') returning id`, [E]);
    const [other] = await query<{ id: string }>(`insert into app_users (email, name) values ($1, 'E2E Other') returning id`, [OTHER]);
    const cookie = await cookieFor(me.id, E), otherCookie = await cookieFor(other.id, OTHER);
    const qs = await query<Q>(`select id, question_text, options, correct_answers, coalesce(explanation, '') as explanation, category
                               from questions order by id limit 3`);

    // ---- API
    const a = examState('e2e-a', qs);
    const created = await call(cookie, '/api/exams', 'POST', { state: a, questions: qs });
    check('Start an exam on the server', created.status === 200 && !!created.data?.id, JSON.stringify(created.data));
    const aId = created.data.id;
    check('Questions count must match the state', (await call(cookie, '/api/exams', 'POST', { state: examState('e2e-x', qs), questions: qs.slice(1) })).status === 400);
    let list = await call(cookie, '/api/exams');
    check('List shows it in progress', list.data?.inProgress?.id === aId && list.data.finished.length === 0);

    const later = { ...a, answers: { [qs[0].id]: ['A'] }, elapsedSec: 30, savedAt: new Date(Date.now() + 1000).toISOString() };
    check('Progress saves', (await call(cookie, `/api/exams/${aId}`, 'PUT', { state: later })).data?.saved === true);
    const stale = { ...a, elapsedSec: 5, savedAt: new Date(Date.now() + 60000).toISOString() };
    check('A copy with less exam time is ignored, whatever its clock says', (await call(cookie, `/api/exams/${aId}`, 'PUT', { state: stale })).data?.saved === false);
    const stored = await call(cookie, `/api/exams/${aId}`);
    check('Stored state is the newer one', stored.data?.state?.elapsedSec === 30 && stored.data?.questions?.length === 3);
    check("Another user can't read it", (await call(otherCookie, `/api/exams/${aId}`)).status === 404);
    check("Another user can't save over it", (await call(otherCookie, `/api/exams/${aId}`, 'PUT', { state: later })).data?.saved === false);

    const b = examState('e2e-b', qs);
    const bId = (await call(cookie, '/api/exams', 'POST', { state: b, questions: qs })).data?.id;
    list = await call(cookie, '/api/exams');
    check('Starting another exam replaces the unfinished one', list.data?.inProgress?.id === bId && (await call(cookie, `/api/exams/${aId}`)).status === 404);

    const fin = await call(cookie, `/api/exams/${bId}/finish`, 'POST', { state: b, summary: summaryOf('e2e-b', qs, 2) });
    check('Finish an exam', fin.status === 200);
    check('Finishing twice is refused', (await call(cookie, `/api/exams/${bId}/finish`, 'POST', { state: b, summary: summaryOf('e2e-b', qs, 2) })).status === 404);
    list = await call(cookie, '/api/exams');
    const done = list.data?.finished?.[0];
    check('Finished exam listed with its score', !list.data?.inProgress && done?.correct === 2 && done?.total === 3 && done?.has_detail === true, JSON.stringify(done));

    const imp = await call(cookie, '/api/exams/import', 'POST', {
        summaries: [summaryOf('e2e-old1', qs, 1, '2026-09-01T10:00:00Z'), summaryOf('e2e-b', qs, 0)],
        last: { summary: summaryOf('e2e-old1', qs, 1, '2026-09-01T10:00:00Z'), questions: qs },
    });
    check('Import skips exams already on the server', imp.data?.imported === 1, JSON.stringify(imp.data));
    const imported = (await call(cookie, '/api/exams')).data.finished.find((f: { client_id: string }) => f.client_id === 'e2e-old1');
    check('Imported result keeps its detail and date', imported?.has_detail === true && imported.finished_at.startsWith('2026-09-01'));
    check('Delete from history', (await call(cookie, `/api/exams/${imported.id}`, 'DELETE')).status === 200);

    // ---- Browser: an exam started on "another device" (the API above) is offered here, and keeps saving
    // Its device clock runs a minute fast, which must not stop this browser's saves
    const c = examState('e2e-c', qs, { savedAt: new Date(Date.now() + 60000).toISOString() });
    await call(cookie, '/api/exams', 'POST', { state: c, questions: qs });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addCookies([{ name: 'next-auth.session-token', value: cookie.split('=')[1], url: BASE }]);
    // This browser also has old local history from before exams were synced
    await ctx.addInitScript(([s]) => {
        if (sessionStorage.getItem('seeded')) return;
        sessionStorage.setItem('seeded', '1');
        localStorage.setItem('nbeo_exam_history', JSON.stringify([s]));
    }, [summaryOf('e2e-local', qs, 3, '2026-08-15T09:00:00Z')]);
    const page = await ctx.newPage();
    page.on('dialog', d => d.accept());
    await page.goto(BASE + '/exam', { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Exam in progress', { timeout: 15000 });
    check('Exam from the other device is offered', (await page.locator('text=E2E Block ·').first().textContent())?.includes('0/3 answered') ?? false);
    await page.waitForSelector('h2:has-text("Your past exams")', { timeout: 15000 });
    const rows = await query<{ client_id: string }>('select client_id from exam_attempts where user_id = $1 and status = $2', [me.id, 'finished']);
    check('Local history was imported', rows.some(r => r.client_id === 'e2e-local'));
    check('Local history was cleared after import', await page.evaluate(() => localStorage.getItem('nbeo_exam_history') === null));

    await page.click('text=Resume Exam');
    await page.waitForTimeout(1000);
    await page.keyboard.press('a');
    await page.waitForTimeout(3500); // quick save fires 1.5 s after an answer
    const [saved] = await query<{ state: { answers: Record<string, string[]> } }>(
        `select state from exam_attempts where user_id = $1 and status = 'in_progress'`, [me.id]);
    check('Answer reached the server in the background', (saved?.state.answers[qs[0].id]?.length ?? 0) === 1, JSON.stringify(saved?.state.answers));

    // Review a past exam in full from the list
    await page.goto(BASE + '/exam', { waitUntil: 'networkidle' });
    await page.waitForSelector('h2:has-text("Your past exams")', { timeout: 15000 });
    await page.getByRole('button', { name: 'Review' }).first().click();
    const report = await page.waitForSelector('text=/\\d+ of 3 correct/', { timeout: 15000 }).then(el => el.textContent(), () => null);
    check('Review opens the full score report', report === '2 of 3 correct', String(report));
    await ctx.close();
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
