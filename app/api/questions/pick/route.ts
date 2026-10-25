import { HttpError, handler, isUuid } from '@/server/auth';
import { query } from '@/server/db';

const MAX_PICK = 500;

// POST { include?, exclude?, ids?, unseenOnly?, excludeMastered?, satisfaction?, limit } → random question ids for a
// Quick Test, filtered against the signed-in user's own history:
//   include / exclude   category names (include wins when both are given)
//   ids                 restrict to these questions (the customizer's phrase search)
//   unseenOnly          never attempted
//   excludeMastered     attempted, never answered correctly
//   satisfaction        latest satisfaction rating is one of these (1-4)
//   bookmarkedOnly      only questions the user bookmarked
export const POST = handler(async (req, user) => {
    const body = await req.json();
    const limit = Number(body.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PICK) throw new HttpError(400, `Pick between 1 and ${MAX_PICK} questions`);
    const strings = (v: unknown) => (Array.isArray(v) && v.every(x => typeof x === 'string') ? v as string[] : []);
    const levels = Array.isArray(body.satisfaction) ? body.satisfaction.filter((n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 4) : [];
    const ids = body.ids === undefined ? null : strings(body.ids);
    if (ids && (!ids.every(isUuid) || ids.length > 5000)) throw new HttpError(400, 'Bad ids');

    const args: unknown[] = [user.email];
    const where: string[] = [];
    const include = strings(body.include), exclude = strings(body.exclude);
    if (include.length) { args.push(include); where.push(`q.category = any($${args.length})`); }
    else if (exclude.length) { args.push(exclude); where.push(`not (q.category = any($${args.length}))`); }
    if (ids) { args.push(ids); where.push(`q.id = any($${args.length}::uuid[])`); }
    if (body.bookmarkedOnly === true) {
        args.push(user.id);
        where.push(`exists (select 1 from question_notes n where n.user_id = $${args.length} and n.question_id = q.id and n.bookmarked)`);
    }
    if (body.unseenOnly === true) {
        where.push('s.question_id is null');
    } else if (body.excludeMastered === true || levels.length) {
        where.push('s.question_id is not null');
        if (body.excludeMastered === true) where.push('not s.mastered');
        if (levels.length) { args.push(levels); where.push(`s.satisfaction = any($${args.length}::int[])`); }
    }
    args.push(limit);

    const rows = await query<{ id: string }>(`
        with s as (
            select question_id, bool_or(is_correct) as mastered,
                   (array_agg(satisfaction_rating order by attempted_at desc, id desc)
                        filter (where satisfaction_rating is not null))[1] as satisfaction
            from user_activity where user_email = $1 group by question_id
        )
        select q.id from questions q left join s on s.question_id = q.id
        ${where.length ? `where ${where.join(' and ')}` : ''}
        order by random() limit $${args.length}`, args);
    return rows.map(r => r.id);
});
