import { HttpError, handler, isUuid } from '@/server/auth';
import { query } from '@/server/db';

type Ctx = { params: Promise<{ questionId: string }> };

// PUT { note?, bookmarked? } → saves either or both; an empty note without a bookmark removes the row
export const PUT = handler<Ctx>(async (req, user, ctx) => {
    const { questionId } = await ctx.params;
    if (!isUuid(questionId)) throw new HttpError(400, 'Bad id');
    const body = await req.json();
    const note = body.note === undefined ? null : typeof body.note === 'string' ? body.note : undefined;
    const bookmarked = body.bookmarked === undefined ? null : typeof body.bookmarked === 'boolean' ? body.bookmarked : undefined;
    if (note === undefined || bookmarked === undefined) throw new HttpError(400, 'Bad note');
    if (note !== null && note.length > 5000) throw new HttpError(400, 'Notes are limited to 5000 characters');

    const [row] = await query<{ note: string; bookmarked: boolean }>(`
        insert into question_notes (user_id, question_id, note, bookmarked)
        select $1, id, coalesce($3, ''), coalesce($4, false) from questions where id = $2
        on conflict (user_id, question_id) do update
            set note = coalesce($3, question_notes.note), bookmarked = coalesce($4, question_notes.bookmarked), updated_at = now()
        returning note, bookmarked`, [user.id, questionId, note, bookmarked]);
    if (!row) throw new HttpError(404, 'No such question');
    if (!row.note.trim() && !row.bookmarked) {
        await query('delete from question_notes where user_id = $1 and question_id = $2', [user.id, questionId]);
    }
    return row;
});
