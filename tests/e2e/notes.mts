// Notes and bookmarks: private per person, saved from History, hidden in Quick Test until submitting, and usable
// as a filter (customizer) and a set (Smart Review).
import { encode } from 'next-auth/jwt';
import { chromium } from 'playwright';
const { query, pool } = await import('../../server/db.ts');

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
const E1 = 'claude-e2e-notes1@e2e.invalid', E2 = 'claude-e2e-notes2@e2e.invalid';
let failed = 0;
const check = (label: string, ok: boolean, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`); if (!ok) failed++; };
const cleanup = async () => {
    await query('delete from user_activity where user_email in ($1, $2)', [E1, E2]);
    await query('delete from app_users where email in ($1, $2)', [E1, E2]);
};

const browser = await chromium.launch({ args: ['--disable-gpu', '--no-sandbox'] });
try {
    await cleanup();
    const mk = async (email: string, name: string) => {
        const [u] = await query<{ id: string }>(`insert into app_users (email, name) values ($1, $2) returning id`, [email, name]);
        const cookie = await encode({ token: { name, email, uid: u.id, method: 'github' }, secret: process.env.NEXTAUTH_SECRET });
        const call = async (path: string, method = 'GET', body?: unknown) => {
            const res = await fetch(BASE + path, { method, headers: { cookie: `next-auth.session-token=${cookie}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
            return { status: res.status, data: await res.json().catch(() => null) };
        };
        return { id: u.id, cookie, call };
    };
    const u1 = await mk(E1, 'E2E Notes'), u2 = await mk(E2, 'E2E Other');
    const qs = (await query<{ id: string }>('select id from questions order by id limit 3')).map(r => r.id);

    // ---- API
    check('Save a note and a bookmark', (await u1.call(`/api/notes/${qs[0]}`, 'PUT', { note: 'Think vertex distance', bookmarked: true })).status === 200);
    await u1.call(`/api/notes/${qs[1]}`, 'PUT', { note: 'Only a note' });
    const mine = (await u1.call('/api/notes', 'POST', { ids: qs })).data;
    check('Read back for a set of questions', mine?.length === 2 && mine.find((n: { question_id: string }) => n.question_id === qs[0])?.bookmarked === true);
    check("Other people can't see them", (await u2.call('/api/notes', 'POST', { ids: qs })).data?.length === 0);
    check('Bookmark list', JSON.stringify((await u1.call('/api/notes')).data?.bookmarks) === JSON.stringify([qs[0]]));
    check('Too-long note refused', (await u1.call(`/api/notes/${qs[2]}`, 'PUT', { note: 'x'.repeat(5001) })).status === 400);
    check('Unknown question is a 404', (await u1.call('/api/notes/00000000-0000-0000-0000-000000000000', 'PUT', { bookmarked: true })).status === 404);
    await u1.call(`/api/notes/${qs[1]}`, 'PUT', { note: '' });
    const [{ n }] = await query<{ n: number }>('select count(*)::int as n from question_notes where user_id = $1', [u1.id]);
    check('Clearing a note without a bookmark removes it', n === 1);
    const picked = (await u1.call('/api/questions/pick', 'POST', { limit: 10, bookmarkedOnly: true })).data;
    check('Customizer pick: bookmarked only', JSON.stringify(picked) === JSON.stringify([qs[0]]), JSON.stringify(picked));

    // ---- Browser: bookmark and note from History
    await query(`insert into user_activity (question_id, is_correct, user_rating, satisfaction_rating, submitted_answer, user_email)
                 values ($1, true, 3, 3, '{A}', $2)`, [qs[2], E1]);
    const ctx = await browser.newContext();
    await ctx.addCookies([{ name: 'next-auth.session-token', value: u1.cookie, url: BASE }]);
    const page = await ctx.newPage();
    await page.goto(BASE + '/history', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Bookmark', exact: true }).waitFor({ timeout: 30000 });
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Bookmark', exact: true }).click();
    await page.getByRole('button', { name: 'Add a note' }).click();
    await page.getByLabel('Your note on this question').fill('Saved from History');
    await page.locator('[aria-live=polite]', { hasText: /^Saved$/ }).waitFor({ timeout: 10000 });
    const [row] = await query<{ note: string; bookmarked: boolean }>('select note, bookmarked from question_notes where user_id = $1 and question_id = $2', [u1.id, qs[2]]);
    check('History saves the bookmark and the note', row?.bookmarked === true && row.note === 'Saved from History', JSON.stringify(row));
    // Typing and leaving at once must not lose the note
    await page.getByLabel('Your note on this question').fill('Typed, then left');
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    let left: { note: string } | undefined;
    for (let i = 0; i < 10 && left?.note !== 'Typed, then left'; i++) {
        [left] = await query<{ note: string }>('select note from question_notes where user_id = $1 and question_id = $2', [u1.id, qs[2]]);
        if (left?.note !== 'Typed, then left') await page.waitForTimeout(300);
    }
    check('Leaving right after typing still saves the note', left?.note === 'Typed, then left', JSON.stringify(left));

    // ---- Quick Test from Smart Review's Bookmarked set: bookmark shown, note hidden until submitting
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    const card = page.getByRole('button', { name: /^Bookmarked/ });
    await card.waitFor({ timeout: 30000 });
    check('Smart Review counts bookmarks', (await card.innerText()).includes('2'));
    await page.waitForTimeout(800);
    await card.click();
    await page.waitForSelector('h3', { timeout: 30000 });
    await page.waitForTimeout(800);
    check('Quiz has the bookmarked questions', (await page.locator('h3').count()) === 2);
    check('Notes stay hidden before submitting', (await page.getByRole('button', { name: /Your note|Add a note/ }).count()) === 0
        && (await page.getByRole('button', { name: 'Bookmarked' }).count()) === 2);
    await page.keyboard.press('Control+Enter');
    await page.waitForSelector('text=Quiz Complete!', { timeout: 30000 });
    check('After submitting, notes show', await page.locator('text=Think vertex distance').isVisible());
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
