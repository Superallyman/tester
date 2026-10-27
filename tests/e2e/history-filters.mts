// History filters: result (incl. skipped), mastery, bookmarked / noted, confidence, period, text search, latest
// attempt per question and the match count, through the API and the page. Plus /design being admin only.
import { encode } from 'next-auth/jwt';
import { chromium } from 'playwright';
const { query, pool } = await import('../../server/db.ts');

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
const E = 'claude-e2e-history@e2e.invalid', EA = 'claude-e2e-history-admin@e2e.invalid';
let failed = 0;
const check = (label: string, ok: boolean, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`); if (!ok) failed++; };
const cleanup = async () => {
    await query('delete from user_activity where user_email in ($1, $2)', [E, EA]);
    await query('delete from app_users where email in ($1, $2)', [E, EA]);
};

const browser = await chromium.launch({ args: ['--disable-gpu', '--no-sandbox'] });
try {
    await cleanup();
    const [me] = await query<{ id: string }>(`insert into app_users (email, name) values ($1, 'E2E History') returning id`, [E]);
    const [admin] = await query<{ id: string }>(`insert into app_users (email, name, is_admin) values ($1, 'E2E History Admin', true) returning id`, [EA]);
    const cookie = await encode({ token: { name: 'E2E History', email: E, uid: me.id, method: 'github' }, secret: process.env.NEXTAUTH_SECRET });
    const adminCookie = await encode({ token: { name: 'E2E History Admin', email: EA, uid: admin.id, isAdmin: true, method: 'github' }, secret: process.env.NEXTAUTH_SECRET });
    const get = async (params: string, c = cookie) => {
        const res = await fetch(`${BASE}/api/activity/history?${params}`, { headers: { cookie: `next-auth.session-token=${c}` } });
        return res.json();
    };

    // q0: wrong then right (mastered, 2 attempts). q1: wrong, bookmarked. q2: skipped, 40 days ago, with a note.
    const qs = await query<{ id: string; question_text: string }>('select id, question_text from questions order by id limit 3');
    const ins = (q: number, correct: boolean, answer: string, conf: number, daysAgo: number) => query(
        `insert into user_activity (question_id, is_correct, user_rating, satisfaction_rating, submitted_answer, user_email, attempted_at)
         values ($1, $2, $3, 3, $4, $5, now() - make_interval(days => $6))`, [qs[q].id, correct, conf, answer ? [answer] : [], E, daysAgo]);
    await ins(0, false, 'A', 1, 5); await ins(0, true, 'A', 4, 1); await ins(1, false, 'B', 2, 2); await ins(2, false, '', 1, 40);
    await query(`insert into question_notes (user_id, question_id, bookmarked, note) values ($1, $2, true, ''), ($1, $3, false, 'Remember this')`, [me.id, qs[1].id, qs[2].id]);

    const n = async (params: string) => (await get(params + '&count=1')).total;
    check('Count of everything', await n('') === 4);
    check('Correct', await n('status=correct') === 1);
    check('Incorrect leaves out skipped', await n('status=incorrect') === 2);
    check('Skipped', await n('status=skipped') === 1);
    check('Mastered = every attempt on a question answered right at least once', await n('mastery=mastered') === 2);
    check('Not yet mastered', await n('mastery=unmastered') === 2);
    check('Bookmarked', await n('saved=bookmarked') === 1);
    check('With a note', await n('saved=notes') === 1);
    check('Confidence', await n('confidence=1') === 2);
    check('Last 30 days', await n('days=30') === 3);
    check('Latest attempt per question', await n('latest=1') === 3);
    check('Filters combine', await n('latest=1&mastery=mastered') === 1);
    const words = qs[1].question_text.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(w => w.length > 6)[0];
    const found = await get(`q=${encodeURIComponent(words)}`);
    check('Text search', Array.isArray(found) && found.some((r: { question_id: string }) => r.question_id === qs[1].id), words);
    const rows = await get('latest=1&sort=oldest');
    check('Rows carry question_id and question data', rows.length === 3 && rows.every((r: { question_id: string; questions: unknown }) => r.question_id && r.questions));
    check("Others' bookmarks don't leak in", (await get('saved=bookmarked&count=1', adminCookie)).total === 0);

    // ---- Page
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 1000 } });
    await ctx.addCookies([{ name: 'next-auth.session-token', value: cookie, url: BASE }]);
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(BASE + '/history', { waitUntil: 'networkidle' });
    const count = page.locator('[aria-live="polite"]', { hasText: /attempt/ });
    await count.filter({ hasText: '4 attempts' }).waitFor({ timeout: 30000 });
    check('Page shows the total', true);
    await page.getByRole('button', { name: /Saved/ }).click();
    await page.getByRole('option', { name: 'Bookmarked' }).click();
    await count.filter({ hasText: '1 attempt match' }).waitFor({ timeout: 15000 });
    check('Bookmarked filter narrows the list', (await page.locator('.orbit-card h3, h3').count()) >= 1);
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await count.filter({ hasText: '4 attempts' }).waitFor({ timeout: 15000 });
    await page.getByRole('switch', { name: /Latest attempt/ }).click();
    await count.filter({ hasText: '3 attempts match' }).waitFor({ timeout: 15000 });
    check('Latest-only switch and Clear work', true);
    await page.getByRole('searchbox', { name: 'Search history' }).fill('zzqx-no-such-text');
    await page.getByText('No attempts match these filters.').waitFor({ timeout: 15000 });
    check('Search with no hits says so', true);
    check('No console errors on History', errors.length === 0, errors.join(' | ').slice(0, 300));

    // ---- /design is admin only
    await page.goto(BASE + '/design', { waitUntil: 'domcontentloaded' });
    check('Non-admin is sent home from /design', new URL(page.url()).pathname === '/');
    await ctx.close();
    const actx = await browser.newContext();
    await actx.addCookies([{ name: 'next-auth.session-token', value: adminCookie, url: BASE }]);
    const apage = await actx.newPage();
    const res = await apage.goto(BASE + '/design', { waitUntil: 'domcontentloaded' });
    check('Admin can open /design', new URL(apage.url()).pathname === '/design' && res?.status() === 200);
    await actx.close();
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
