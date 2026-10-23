// Reporting a question and fixing it in the admin editor: API rules, then the real pages.
// Works only on a throwaway question it creates (category "E2E Test"), which is deleted at the end with its
// reports and edit log, so no real question is ever reported or edited.
import { encode } from 'next-auth/jwt';
import { chromium } from 'playwright';
const { query, pool } = await import('../../server/db.ts');

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
const USER = 'claude-e2e-rep@e2e.invalid', ADMIN = 'claude-e2e-repadmin@e2e.invalid';
let failed = 0;
const check = (label: string, ok: boolean, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`); if (!ok) failed++; };
const token = async (uid: string, email: string, isAdmin: boolean) =>
    encode({ token: { name: email.split('@')[0], email, uid, isAdmin, method: 'github' }, secret: process.env.NEXTAUTH_SECRET });
const call = async (cookie: string, path: string, method = 'GET', body?: unknown) => {
    const res = await fetch(BASE + path, { method, headers: { cookie: `next-auth.session-token=${cookie}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json().catch(() => null) };
};
const cleanup = async () => {
    await query(`delete from questions where category = 'E2E Test'`);
    await query(`delete from user_activity where user_email in ($1, $2)`, [USER, ADMIN]);
    await query(`delete from app_users where email in ($1, $2)`, [USER, ADMIN]);
};

const browser = await chromium.launch({ args: ['--disable-gpu', '--no-sandbox'] });
try {
    await cleanup();
    const [user] = await query<{ id: string }>(`insert into app_users (email, name) values ($1, 'E2E Reporter') returning id`, [USER]);
    const [admin] = await query<{ id: string }>(`insert into app_users (email, name, is_admin) values ($1, 'E2E Admin', true) returning id`, [ADMIN]);
    const u = await token(user.id, USER, false), a = await token(admin.id, ADMIN, true);

    // ---- API
    const q = { category: 'E2E Test', question_text: 'Which lens corrects myopia?', options: ['Plus', 'Minus', 'Prism', 'Cylinder'], correct_answers: ['Plus'], explanation: 'Wrong on purpose.' };
    check('Non-admins cannot add questions', (await call(u, '/api/admin/questions', 'POST', q)).status === 403);
    check('Answer key must be one of the options', (await call(a, '/api/admin/questions', 'POST', { ...q, correct_answers: ['Concave'] })).status === 400);
    check('Duplicate options refused', (await call(a, '/api/admin/questions', 'POST', { ...q, options: ['Plus', 'Plus', 'Prism'] })).status === 400);
    const created = await call(a, '/api/admin/questions', 'POST', q);
    check('Admin adds a question', created.status === 200 && !!created.data?.id);
    const qid = created.data.id;

    check('"Something else" needs a comment', (await call(u, `/api/questions/${qid}/report`, 'POST', { reason: 'other' })).status === 400);
    check('Unknown reason refused', (await call(u, `/api/questions/${qid}/report`, 'POST', { reason: 'boring' })).status === 400);
    const r1 = await call(u, `/api/questions/${qid}/report`, 'POST', { reason: 'wrong_answer', comment: 'Myopia takes minus lenses.' });
    const r2 = await call(u, `/api/questions/${qid}/report`, 'POST', { reason: 'wrong_answer', comment: 'Minus, see any optics text.' });
    const [{ n }] = await query<{ n: number }>(`select count(*)::int as n from question_reports where question_id = $1`, [qid]);
    check('Reporting again updates the open report', r1.data?.updated === false && r2.data?.updated === true && n === 1);
    check('Reporting a missing question is a 404', (await call(u, `/api/questions/00000000-0000-0000-0000-000000000000/report`, 'POST', { reason: 'typo' })).status === 404);

    check('Non-admins cannot list questions', (await call(u, '/api/admin/questions')).status === 403);
    const queue = await call(a, '/api/admin/questions?reported=1&category=E2E%20Test');
    check('Reported question is in the admin queue', queue.data?.rows?.[0]?.id === qid && queue.data.rows[0].open_reports === 1, JSON.stringify(queue.data?.rows?.[0]));
    check('Report count for the tab badge', (await call(a, '/api/admin/reports')).data?.open >= 1);
    check('Non-admins cannot edit', (await call(u, `/api/admin/questions/${qid}`, 'PUT', q)).status === 403);

    // ---- Browser: the reporter sees the question in History and reports it from there
    await query(`insert into user_activity (question_id, is_correct, user_rating, satisfaction_rating, submitted_answer, user_email)
                 values ($1, true, 3, 3, '{Plus}', $2)`, [qid, USER]);
    await query(`delete from question_reports where question_id = $1`, [qid]); // start the UI part with no reports
    const userCtx = await browser.newContext();
    await userCtx.addCookies([{ name: 'next-auth.session-token', value: u, url: BASE }]);
    const up = await userCtx.newPage();
    await up.goto(BASE + '/history', { waitUntil: 'networkidle' });
    await up.waitForSelector('text=Which lens corrects myopia?', { timeout: 15000 });
    await up.waitForTimeout(1000);
    await up.getByText('⚑ Report a problem').first().click();
    await up.getByRole('radio', { name: 'Answer key is wrong' }).click();
    await up.locator('textarea').fill('Should be Minus.');
    await up.getByRole('button', { name: 'Send report' }).click();
    await up.waitForSelector('text=Reported. Thanks', { timeout: 10000 });
    const [rep] = await query<{ reason: string; comment: string }>(`select reason, comment from question_reports where question_id = $1 and status = 'open'`, [qid]);
    check('Report sent from History', rep?.reason === 'wrong_answer' && rep.comment === 'Should be Minus.', JSON.stringify(rep));
    await userCtx.close();

    // ---- Browser: the admin fixes it from the queue
    const adminCtx = await browser.newContext({ viewport: { width: 1100, height: 1000 } });
    await adminCtx.addCookies([{ name: 'next-auth.session-token', value: a, url: BASE }]);
    const ap = await adminCtx.newPage();
    ap.on('dialog', d => d.accept());
    await ap.goto(BASE + '/admin/questions', { waitUntil: 'networkidle' });
    await ap.waitForSelector('text=Which lens corrects myopia?', { timeout: 15000 });
    check('Admin tab shows a report badge', (await ap.locator('nav[aria-label=Admin] span.bg-red-500').count()) === 1);
    await ap.getByText('Which lens corrects myopia?').click();
    await ap.waitForSelector('text=Should be Minus.', { timeout: 15000 });
    await ap.waitForTimeout(800);
    // Untick Plus (A), tick Minus (B), fix the explanation
    await ap.locator('label:has-text("Correct") input').nth(0).uncheck();
    await ap.locator('label:has-text("Correct") input').nth(1).check();
    await ap.locator('#explanation').fill('Myopia is corrected with minus (concave) lenses.');
    await ap.getByRole('button', { name: /Save and resolve 1 report/ }).click();
    await ap.waitForSelector('text=1 report marked resolved', { timeout: 10000 });
    const [fixed] = await query<{ correct_answers: string[]; explanation: string }>('select correct_answers, explanation from questions where id = $1', [qid]);
    const [{ open }] = await query<{ open: number }>(`select count(*)::int as open from question_reports where question_id = $1 and status = 'open'`, [qid]);
    check('Edit saved and report resolved', fixed.correct_answers.join() === 'Minus' && fixed.explanation.startsWith('Myopia is corrected') && open === 0, JSON.stringify(fixed));
    check('Edit history lists the change', await ap.locator('text=changed answer key, explanation').isVisible());

    await ap.getByRole('button', { name: 'Undo' }).click();
    await ap.waitForSelector('text=Edit undone.', { timeout: 10000 });
    const [undone] = await query<{ correct_answers: string[] }>('select correct_answers from questions where id = $1', [qid]);
    check('Undo restores the previous answer key', undone.correct_answers.join() === 'Plus');
    const [{ edits }] = await query<{ edits: number }>('select count(*)::int as edits from question_edits where question_id = $1', [qid]);
    check('Every change is logged (create, edit, undo)', edits === 3, String(edits));
    await adminCtx.close();
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
