import { HttpError, handler, isUuid } from '@/server/auth';
import { query } from '@/server/db';

type Ctx = { params: Promise<{ id: string }> };

const REASONS = ['wrong_answer', 'unclear', 'typo', 'outdated', 'other'];

// POST { reason, comment? } → flags a question for the admins. Reporting it again while the first report is still
// open updates that report instead of adding another.
export const POST = handler<Ctx>(async (req, user, ctx) => {
    const { id } = await ctx.params;
    if (!isUuid(id)) throw new HttpError(400, 'Bad id');
    const { reason, comment } = await req.json();
    if (!REASONS.includes(reason)) throw new HttpError(400, 'Pick a reason');
    const note = typeof comment === 'string' ? comment.trim().slice(0, 2000) || null : null;
    if (reason === 'other' && !note) throw new HttpError(400, 'Say what the problem is');

    const updated = await query(
        `update question_reports set reason = $1, comment = $2, created_at = now()
         where question_id = $3 and user_id = $4 and status = 'open' returning id`, [reason, note, id, user.id]);
    if (updated.length) return { ok: true, updated: true };
    const rows = await query(
        `insert into question_reports (question_id, user_id, reason, comment)
         select id, $2, $3, $4 from questions where id = $1 returning id`, [id, user.id, reason, note]);
    if (!rows.length) throw new HttpError(404, 'No such question');
    return { ok: true, updated: false };
});
