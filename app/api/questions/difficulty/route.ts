import { HttpError, handler, isUuid } from '@/server/auth';
import { query } from '@/server/db';

// POST { ids } → for each of these questions that anyone has answered: how many people tried it, and how many
// got it right first time
export const POST = handler(async req => {
    const { ids } = await req.json();
    if (!Array.isArray(ids) || ids.length > 1000 || !ids.every(isUuid)) throw new HttpError(400, 'Bad ids');
    return query<{ question_id: string; people: number; first_correct: number }>(
        'select question_id, people, first_correct from question_difficulty where question_id = any($1::uuid[])', [ids]);
});
