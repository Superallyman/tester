import { HttpError, handler, isUuid, ratingOrNull } from '@/server/auth';
import { query } from '@/server/db';
import { recordAnswers } from '@/server/schedule';

export interface ActivityInput {
    question_id: string;
    is_correct: boolean;
    user_rating?: number | null;
    satisfaction_rating?: number | null;
    submitted_answer: string[];
}

// GET → every attempt by the signed-in user, oldest first, with the question's category
export const GET = handler((_req, user) =>
    query(`
        select a.id, a.question_id, a.is_correct, a.user_rating, a.satisfaction_rating, a.attempted_at, q.category
        from user_activity a
        left join questions q on q.id = a.question_id
        where a.user_email = $1
        order by a.attempted_at, a.id`, [user.email]));

// POST { rows } → inserts attempts as the signed-in user; returns the new ids
export const POST = handler(async (req, user) => {
    const { rows } = await req.json() as { rows: ActivityInput[] };
    if (!Array.isArray(rows) || rows.length === 0 || rows.length > 500) throw new HttpError(400, 'Bad rows');

    const clean = rows.map(r => {
        if (!isUuid(r.question_id) || typeof r.is_correct !== 'boolean') throw new HttpError(400, 'Bad row');
        if (!Array.isArray(r.submitted_answer) || !r.submitted_answer.every(s => typeof s === 'string')) throw new HttpError(400, 'Bad answer');
        return [r.question_id, r.is_correct, ratingOrNull(r.user_rating, 4), ratingOrNull(r.satisfaction_rating, 4), r.submitted_answer];
    });

    // One multi-row insert: unnest the column arrays (submitted_answer goes in as JSON since text[][] can't be ragged)
    const inserted = await query<{ id: string; question_id: string; is_correct: boolean; user_rating: number | null; attempted_at: Date; answered: boolean }>(`
        insert into user_activity (question_id, is_correct, user_rating, satisfaction_rating, submitted_answer, user_email)
        select qid, ok, ur, sr, array(select jsonb_array_elements_text(sa)), $6
        from unnest($1::uuid[], $2::boolean[], $3::int[], $4::int[], $5::jsonb[]) as t(qid, ok, ur, sr, sa)
        returning id, question_id, is_correct, user_rating, attempted_at, cardinality(submitted_answer) > 0 as answered`,
        [
            clean.map(c => c[0]),
            clean.map(c => c[1]),
            clean.map(c => c[2]),
            clean.map(c => c[3]),
            clean.map(c => JSON.stringify(c[4])),
            user.email,
        ]);
    // Skips (no answer picked) don't move the review schedule
    await recordAnswers(user, inserted.filter(r => r.answered));
    return inserted.map(({ id, question_id }) => ({ id, question_id }));
});
