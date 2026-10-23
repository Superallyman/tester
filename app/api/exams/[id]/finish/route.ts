import { HttpError, handler, isUuid } from '@/server/auth';
import { query } from '@/server/db';
import { checkState, checkSummary } from '@/server/exams';

type Ctx = { params: Promise<{ id: string }> };

// POST { state, summary } → marks the exam finished with its score breakdown
export const POST = handler<Ctx>(async (req, user, ctx) => {
    const { id } = await ctx.params;
    if (!isUuid(id)) throw new HttpError(400, 'Bad id');
    const body = await req.json();
    const state = checkState(body.state);
    const summary = checkSummary(body.summary);
    const rows = await query(
        `update exam_attempts
         set status = 'finished', state = $1, summary = $2, answered = $3, correct = $4, elapsed_sec = $5,
             finished_at = $6, updated_at = now()
         where id = $7 and user_id = $8 and status = 'in_progress'
         returning id`,
        [JSON.stringify(state), JSON.stringify(summary), summary.answered, summary.correct, summary.elapsedSec, summary.finishedAt, id, user.id]);
    if (!rows.length) throw new HttpError(404, 'No unfinished exam with that id');
    return { ok: true };
});
