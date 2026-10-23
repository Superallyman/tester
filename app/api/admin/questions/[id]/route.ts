import { HttpError, handler, isUuid } from '@/server/auth';
import { pool, query } from '@/server/db';
import { QUESTION_FIELDS, checkQuestion } from '@/server/questions';

type Ctx = { params: Promise<{ id: string }> };

const questionId = async (ctx: Ctx) => {
    const { id } = await ctx.params;
    if (!isUuid(id)) throw new HttpError(400, 'Bad id');
    return id;
};

// GET → the question, its reports (open first), its edit history, and how people have answered it
export const GET = handler<Ctx>(async (_req, _admin, ctx) => {
    const id = await questionId(ctx);
    const [[question], reports, edits, [stats]] = await Promise.all([
        query(`select id, ${QUESTION_FIELDS}, created_at, updated_at from questions where id = $1`, [id]),
        query(`select r.id, r.reason, r.comment, r.status, r.created_at, r.resolved_at,
                      coalesce(u.name, 'deleted account') as reporter, ru.name as resolved_by
               from question_reports r
               left join app_users u on u.id = r.user_id
               left join app_users ru on ru.id = r.resolved_by
               where r.question_id = $1 order by (r.status = 'open') desc, r.created_at desc`, [id]),
        query(`select e.id, e.before, e.after, e.edited_at, coalesce(u.name, 'deleted account') as editor
               from question_edits e left join app_users u on u.id = e.editor_id
               where e.question_id = $1 order by e.edited_at desc limit 20`, [id]),
        query(`select count(*)::int as attempts, count(*) filter (where is_correct)::int as correct
               from user_activity where question_id = $1 and cardinality(submitted_answer) > 0`, [id]),
    ]);
    if (!question) throw new HttpError(404, 'Not found');
    return { question, reports, edits, stats };
}, { admin: true });

// PUT { category, question_text, options, correct_answers, explanation, resolveReports? } → saves an edit,
// logging the before/after; resolveReports also closes the question's open reports
export const PUT = handler<Ctx>(async (req, admin, ctx) => {
    const id = await questionId(ctx);
    const body = await req.json();
    const q = checkQuestion(body);
    const client = await pool.connect();
    try {
        await client.query('begin');
        const { rows: [before] } = await client.query(`select ${QUESTION_FIELDS} from questions where id = $1 for update`, [id]);
        if (!before) throw new HttpError(404, 'Not found');
        await client.query(
            `update questions set category = $1, question_text = $2, options = $3, correct_answers = $4, explanation = $5,
                                  updated_at = now() where id = $6`,
            [q.category, q.question_text, q.options, q.correct_answers, q.explanation, id]);
        await client.query('insert into question_edits (question_id, editor_id, before, after) values ($1, $2, $3, $4)',
            [id, admin.id, JSON.stringify(before), JSON.stringify(q)]);
        let resolved = 0;
        if (body.resolveReports === true) {
            resolved = (await client.query(
                `update question_reports set status = 'resolved', resolved_at = now(), resolved_by = $2
                 where question_id = $1 and status = 'open'`, [id, admin.id])).rowCount ?? 0;
        }
        await client.query('commit');
        return { ok: true, resolved };
    } catch (err) {
        await client.query('rollback').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}, { admin: true });
