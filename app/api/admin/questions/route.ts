import { handler } from '@/server/auth';
import { pool, query } from '@/server/db';
import { QUESTION_FIELDS, checkQuestion } from '@/server/questions';

const PAGE = 50;

// GET ?q=text&category=…&reported=1&offset=0 → a page of questions with their open report counts.
// With reported=1, only questions that have open reports, most reported first.
export const GET = handler(async req => {
    const p = req.nextUrl.searchParams;
    const offset = Math.max(0, Number(p.get('offset')) || 0);
    const where: string[] = [];
    const args: unknown[] = [];
    const q = p.get('q')?.trim();
    if (q) {
        args.push(`%${q}%`);
        where.push(`(question_text ilike $${args.length} or explanation ilike $${args.length} or options::text ilike $${args.length} or id::text = $${args.length + 1})`);
        args.push(q);
    }
    const category = p.get('category');
    if (category) { args.push(category); where.push(`category = $${args.length}`); }
    const reported = p.get('reported') === '1';
    if (reported) where.push('r.open_reports > 0');

    const filter = where.length ? `where ${where.join(' and ')}` : '';
    const [rows, [{ total }], [{ open }], categories] = await Promise.all([
        query(`
            select q.id, q.category, q.question_text, q.updated_at, coalesce(r.open_reports, 0)::int as open_reports, r.latest_report
            from questions q
            left join (select question_id, count(*) as open_reports, max(created_at) as latest_report
                       from question_reports where status = 'open' group by question_id) r on r.question_id = q.id
            ${filter}
            order by ${reported ? 'r.open_reports desc, r.latest_report desc' : 'q.category, q.question_text'}, q.id
            limit ${PAGE} offset ${offset}`, args),
        query<{ total: number }>(`
            select count(*)::int as total from questions q
            left join (select question_id, count(*) as open_reports from question_reports where status = 'open' group by question_id) r
              on r.question_id = q.id
            ${filter}`, args),
        query<{ open: number }>(`select count(*)::int as open from question_reports where status = 'open'`),
        query<{ category: string; n: number }>('select category, count(*)::int as n from questions group by category order by category'),
    ]);
    return { rows, total, pageSize: PAGE, openReports: open, categories };
}, { admin: true });

// POST { category, question_text, options, correct_answers, explanation } → adds a question to the bank
export const POST = handler(async (req, admin) => {
    const q = checkQuestion(await req.json());
    const client = await pool.connect();
    try {
        await client.query('begin');
        const { rows: [row] } = await client.query(
            `insert into questions (${QUESTION_FIELDS}, updated_at) values ($1, $2, $3, $4, $5, now()) returning id`,
            [q.category, q.question_text, q.options, q.correct_answers, q.explanation]);
        await client.query('insert into question_edits (question_id, editor_id, before, after) values ($1, $2, null, $3)',
            [row.id, admin.id, JSON.stringify(q)]);
        await client.query('commit');
        return { id: row.id };
    } catch (err) {
        await client.query('rollback').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}, { admin: true });
