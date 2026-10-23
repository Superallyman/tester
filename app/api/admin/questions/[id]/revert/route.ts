import { HttpError, handler, isUuid } from '@/server/auth';
import { pool } from '@/server/db';
import { QUESTION_FIELDS, QuestionInput } from '@/server/questions';

type Ctx = { params: Promise<{ id: string }> };

// POST { editId } → puts the question back the way it was before that edit. The undo is itself logged as an edit.
export const POST = handler<Ctx>(async (req, admin, ctx) => {
    const { id } = await ctx.params;
    const { editId } = await req.json();
    if (!isUuid(id) || !isUuid(editId)) throw new HttpError(400, 'Bad id');
    const client = await pool.connect();
    try {
        await client.query('begin');
        const { rows: [edit] } = await client.query<{ before: QuestionInput | null }>(
            'select before from question_edits where id = $1 and question_id = $2', [editId, id]);
        if (!edit) throw new HttpError(404, 'No such edit');
        if (!edit.before) throw new HttpError(400, 'That edit created the question; there is nothing to go back to');
        const { rows: [current] } = await client.query(`select ${QUESTION_FIELDS} from questions where id = $1 for update`, [id]);
        if (!current) throw new HttpError(404, 'Not found');
        const b = edit.before;
        await client.query(
            `update questions set category = $1, question_text = $2, options = $3, correct_answers = $4, explanation = $5,
                                  updated_at = now() where id = $6`,
            [b.category, b.question_text, b.options, b.correct_answers, b.explanation, id]);
        await client.query('insert into question_edits (question_id, editor_id, before, after) values ($1, $2, $3, $4)',
            [id, admin.id, JSON.stringify(current), JSON.stringify(b)]);
        await client.query('commit');
        return { ok: true };
    } catch (err) {
        await client.query('rollback').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}, { admin: true });
