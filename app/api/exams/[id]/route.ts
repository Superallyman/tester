import { HttpError, handler, isUuid } from '@/server/auth';
import { query } from '@/server/db';
import { checkState } from '@/server/exams';

type Ctx = { params: Promise<{ id: string }> };

const examId = async (ctx: Ctx) => {
    const { id } = await ctx.params;
    if (!isUuid(id)) throw new HttpError(400, 'Bad id');
    return id;
};

// GET → one of the user's exams in full: questions, state and (once finished) summary
export const GET = handler<Ctx>(async (_req, user, ctx) => {
    const [row] = await query(
        `select id, client_id, label, status, questions, state, summary from exam_attempts where id = $1 and user_id = $2`,
        [await examId(ctx), user.id]);
    if (!row) throw new HttpError(404, 'Not found');
    return row;
});

// PUT { state } → saves progress. A copy that has seen less exam time than the stored one is ignored, so a second
// device with a stale copy can't rewind it. Exam time only grows while the exam is open, and unlike device clocks
// it means the same thing on every device.
export const PUT = handler<Ctx>(async (req, user, ctx) => {
    const id = await examId(ctx);
    const state = checkState((await req.json()).state);
    const rows = await query(
        `update exam_attempts set state = $1, elapsed_sec = $2, updated_at = now()
         where id = $3 and user_id = $4 and status = 'in_progress'
           and elapsed_sec <= $2
         returning id`,
        [JSON.stringify(state), state.elapsedSec, id, user.id]);
    return { saved: rows.length > 0 };
});

// DELETE → removes an exam: discarding an unfinished one, or clearing a finished one from history
export const DELETE = handler<Ctx>(async (_req, user, ctx) => {
    const rows = await query('delete from exam_attempts where id = $1 and user_id = $2 returning id', [await examId(ctx), user.id]);
    if (!rows.length) throw new HttpError(404, 'Not found');
    return { ok: true };
});
