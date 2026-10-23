import { HttpError, handler, isUuid } from '@/server/auth';
import { query } from '@/server/db';
import { requireLeaderboard } from '@/server/challenges';

type Ctx = { params: Promise<{ id: string }> };

// GET → what's needed to take the challenge: its questions in order and its time limit
export const GET = handler<Ctx>(async (_req, user, ctx) => {
    requireLeaderboard(user);
    const { id } = await ctx.params;
    if (!isUuid(id)) throw new HttpError(400, 'Bad id');
    const [row] = await query(`
        select c.id, c.title, c.question_ids, c.time_limit_sec,
               exists (select 1 from challenge_entries e where e.challenge_id = c.id and e.user_id = $2) as taken
        from challenges c where c.id = $1`, [id, user.id]);
    if (!row) throw new HttpError(404, 'No such challenge');
    return row;
});

// DELETE → the creator removes their challenge (and its scores)
export const DELETE = handler<Ctx>(async (_req, user, ctx) => {
    requireLeaderboard(user);
    const { id } = await ctx.params;
    if (!isUuid(id)) throw new HttpError(400, 'Bad id');
    const rows = await query('delete from challenges where id = $1 and (creator_id = $2 or $3) returning id', [id, user.id, user.isAdmin]);
    if (!rows.length) throw new HttpError(404, 'Not found, or not yours to remove');
    return { ok: true };
});
