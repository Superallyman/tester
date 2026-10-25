import { HttpError, handler, isUuid } from '@/server/auth';
import { query } from '@/server/db';

export interface NoteRow { question_id: string; note: string; bookmarked: boolean }

// GET → ids of the user's bookmarked questions (newest first) and how many notes they have
export const GET = handler(async (_req, user) => {
    const [bookmarks, [{ notes }]] = await Promise.all([
        query<{ question_id: string }>(`select n.question_id from question_notes n join questions q on q.id = n.question_id
                                         where n.user_id = $1 and n.bookmarked order by n.updated_at desc`, [user.id]),
        query<{ notes: number }>(`select count(*)::int as notes from question_notes where user_id = $1 and note <> ''`, [user.id]),
    ]);
    return { bookmarks: bookmarks.map(b => b.question_id), notes };
});

// POST { ids } → the user's note and bookmark for each of these questions that has one
export const POST = handler(async (req, user) => {
    const { ids } = await req.json();
    if (!Array.isArray(ids) || ids.length > 1000 || !ids.every(isUuid)) throw new HttpError(400, 'Bad ids');
    return query<NoteRow>('select question_id, note, bookmarked from question_notes where user_id = $1 and question_id = any($2::uuid[])', [user.id, ids]);
});
