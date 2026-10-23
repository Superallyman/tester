import { HttpError, handler, isUuid } from '@/server/auth';
import { query } from '@/server/db';
import { requireLeaderboard } from '@/server/challenges';

type Ctx = { params: Promise<{ id: string }> };

// POST { examId } → records a finished exam as the user's entry. The score is read from the saved exam, which has
// to be the user's, finished, and on exactly the challenge's questions in its order. Only the first entry counts.
export const POST = handler<Ctx>(async (req, user, ctx) => {
    requireLeaderboard(user);
    const { id } = await ctx.params;
    const { examId } = await req.json();
    if (!isUuid(id) || !isUuid(examId)) throw new HttpError(400, 'Bad id');
    const [exam] = await query<{ ok: boolean; correct: number; total: number; elapsed_sec: number; finished_at: string }>(`
        select (select coalesce(array(select jsonb_array_elements_text(a.state->'questionIds'))::uuid[] = c.question_ids, false)) as ok,
               a.correct, a.total, a.elapsed_sec, a.finished_at
        from exam_attempts a, challenges c
        where a.id = $1 and a.user_id = $2 and a.status = 'finished' and c.id = $3`, [examId, user.id, id]);
    if (!exam) throw new HttpError(404, 'No finished exam with that id');
    if (!exam.ok) throw new HttpError(400, "That exam wasn't this challenge's questions");
    const rows = await query(`
        insert into challenge_entries (challenge_id, user_id, exam_attempt_id, correct, total, elapsed_sec, finished_at)
        values ($1, $2, $3, $4, $5, $6, $7) on conflict do nothing returning challenge_id`,
        [id, user.id, examId, exam.correct, exam.total, exam.elapsed_sec, exam.finished_at]);
    return { recorded: rows.length > 0 };
});
