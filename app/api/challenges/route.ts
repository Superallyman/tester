import { HttpError, handler, isUuid } from '@/server/auth';
import { query } from '@/server/db';
import { requireLeaderboard } from '@/server/challenges';

// GET → the 30 most recent challenges with everyone's scores (scores only; nobody's answers are shared)
export const GET = handler(async (_req, user) => {
    requireLeaderboard(user);
    return query(`
        select c.id, c.title, c.created_at, c.time_limit_sec, cardinality(c.question_ids) as total,
               coalesce(cu.name, 'deleted account') as creator, c.creator_id = $1 as mine,
               coalesce(json_agg(json_build_object(
                   'name', u.name, 'me', e.user_id = $1, 'correct', e.correct, 'total', e.total,
                   'elapsed_sec', e.elapsed_sec, 'finished_at', e.finished_at)
                 order by e.correct desc, e.elapsed_sec asc) filter (where e.user_id is not null), '[]') as entries
        from challenges c
        left join app_users cu on cu.id = c.creator_id
        left join challenge_entries e on e.challenge_id = c.id
        left join app_users u on u.id = e.user_id
        group by c.id, cu.name
        order by c.created_at desc
        limit 30`, [user.id]);
});

// POST { title, questionIds, timeLimitSec } → creates a challenge from an exam that was just built
export const POST = handler(async (req, user) => {
    requireLeaderboard(user);
    const { title, questionIds, timeLimitSec } = await req.json();
    const name = typeof title === 'string' ? title.trim().slice(0, 120) : '';
    if (!name) throw new HttpError(400, 'Give the challenge a name');
    if (!Array.isArray(questionIds) || !questionIds.length || questionIds.length > 400 || !questionIds.every(isUuid)
        || new Set(questionIds).size !== questionIds.length) throw new HttpError(400, 'Bad questions');
    if (timeLimitSec !== null && !(Number.isInteger(timeLimitSec) && timeLimitSec > 0)) throw new HttpError(400, 'Bad time limit');
    const [{ n }] = await query<{ n: number }>('select count(*)::int as n from questions where id = any($1::uuid[])', [questionIds]);
    if (n !== questionIds.length) throw new HttpError(400, 'Some of those questions no longer exist');
    const [row] = await query<{ id: string }>(
        'insert into challenges (creator_id, title, question_ids, time_limit_sec) values ($1, $2, $3, $4) returning id',
        [user.id, name, questionIds, timeLimitSec]);
    return { id: row.id };
});
