import { HttpError, handler } from '@/server/auth';
import { pool, query } from '@/server/db';
import { checkQuestions, checkState } from '@/server/exams';

// GET → the unfinished exam (with its state, to compare with the browser's copy) and finished ones (no detail)
export const GET = handler(async (_req, user) => {
    const [inProgress, finished] = await Promise.all([
        query(`select id, client_id, label, total, state, updated_at from exam_attempts
               where user_id = $1 and status = 'in_progress'`, [user.id]),
        query(`select id, client_id, label, total, answered, correct, elapsed_sec, finished_at,
                      (summary->>'timeLimitSec')::int as time_limit_sec, summary->'byCategory' as by_category,
                      questions is not null as has_detail
               from exam_attempts where user_id = $1 and status = 'finished'
               order by finished_at desc`, [user.id]),
    ]);
    return { inProgress: inProgress[0] ?? null, finished };
});

// POST { state, questions } → starts an exam on the server, replacing any unfinished one; returns its id
export const POST = handler(async (req, user) => {
    const body = await req.json();
    const state = checkState(body.state);
    const questions = checkQuestions(body.questions, state.questionIds.length);
    const client = await pool.connect();
    try {
        await client.query('begin');
        await client.query(`delete from exam_attempts where user_id = $1 and status = 'in_progress' and client_id <> $2`, [user.id, state.id]);
        const { rows } = await client.query(
            `insert into exam_attempts (user_id, client_id, label, status, questions, state, total, elapsed_sec)
             values ($1, $2, $3, 'in_progress', $4, $5, $6, $7)
             on conflict (user_id, client_id) do update set state = excluded.state, elapsed_sec = excluded.elapsed_sec, updated_at = now()
               where exam_attempts.status = 'in_progress'
             returning id`,
            [user.id, state.id, state.config.label, JSON.stringify(questions), JSON.stringify(state), questions.length, state.elapsedSec]);
        await client.query('commit');
        if (!rows.length) throw new HttpError(409, 'That exam is already finished');
        return { id: rows[0].id };
    } catch (err) {
        await client.query('rollback').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
});
