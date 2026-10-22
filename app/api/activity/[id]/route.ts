import { HttpError, handler, isUuid, ratingOrNull } from '@/server/auth';
import { query } from '@/server/db';

type Ctx = { params: Promise<{ id: string }> };

const ownId = async (ctx: Ctx) => {
    const { id } = await ctx.params;
    if (!isUuid(id)) throw new HttpError(400, 'Bad id');
    return id;
};

// PATCH { satisfaction_rating } on one of the signed-in user's own attempts
export const PATCH = handler<Ctx>(async (req, user, ctx) => {
    const id = await ownId(ctx);
    const { satisfaction_rating } = await req.json();
    const rows = await query('update user_activity set satisfaction_rating = $1 where id = $2 and user_email = $3 returning id',
        [ratingOrNull(satisfaction_rating, 4), id, user.email]);
    if (!rows.length) throw new HttpError(404, 'Not found');
    return { ok: true };
});

export const DELETE = handler<Ctx>(async (_req, user, ctx) => {
    const id = await ownId(ctx);
    const rows = await query('delete from user_activity where id = $1 and user_email = $2 returning id', [id, user.email]);
    if (!rows.length) throw new HttpError(404, 'Not found');
    return { ok: true };
});
